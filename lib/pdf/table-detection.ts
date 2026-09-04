/**
 * Conservative table detection heuristic for PDF text items.
 *
 * Detects table-like structures from pdfjs-dist text items (with real advance
 * widths) and partitions a page's line stream into an ordered sequence of
 * table regions and prose regions, so the caller can render tables as Word
 * tables while prose goes through normal paragraph grouping.
 *
 * The algorithm is intentionally conservative to avoid false positives on
 * normal multi-column text or justified paragraphs:
 *   - rows must have >= 2 segments separated by whitespace gaps far larger
 *     than normal inter-word spacing (gap scaled by font size),
 *   - a table is a run of >= MIN_TABLE_ROWS consecutive row-like lines,
 *   - all lines in the run must snap onto ONE shared page-level column
 *     boundary model (derived from the run's densest line) with >= 80%
 *     consistency and a stable column count.
 */

export interface PdfTextItem {
  str: string;
  transform: number[];
  /** Advance width of the item in text-space units (pdfjs `item.width`). */
  width: number;
}

export interface DetectedTable {
  columnCount: number;
  /** Left edge (x) of each column boundary, left to right. */
  columnXs: number[];
  /** Right edge of the table (max segment end across the run). */
  tableRight: number;
  /** rows[r][c] is the text of row r, column c (always columnCount wide). */
  rows: string[][];
}

export type PageBlock =
  | { kind: "table"; table: DetectedTable }
  | { kind: "prose"; items: PdfTextItem[] };

// Detection gates / tuning constants.
const MIN_TABLE_ROWS = 3;          // minimum consecutive row-like lines
const MIN_TABLE_COLUMNS = 2;       // minimum detected columns
const MIN_CONSISTENCY = 0.8;       // rows sharing the dominant column count
const GAP_FLOOR = 14;              // min whitespace gap that can split columns
const GAP_FONT_RATIO = 2.4;        // ...also >= 2.4x the font size
const SNAP_TOLERANCE_FONT = 1.5;   // boundary snap tolerance ~1.5x font size
const SNAP_TOLERANCE_FLOOR = 7;
const MAX_SNAP_FAILURE_RATIO = 0.2; // up to 20% of run rows may fail to snap

/**
 * A visual line of text: items already ordered left-to-right.
 */
interface TextLine {
  y: number;
  fontSize: number;
  items: PdfTextItem[];
}

function fontSizeOf(item: PdfTextItem): number {
  return Math.hypot(item.transform[2], item.transform[3]) || 0;
}

/**
 * Group already-sorted items (top-to-bottom, left-to-right) into visual
 * lines. Whitespace-only and zero-width items are dropped up front: pdfjs
 * emits them both as word separators (small width) AND as full whitespace
 * runs between table cells (large width), so they must never participate in
 * gap math â€” the gap between two real items is simply
 * nextItem.x - (prevItem.x + prevItem.width).
 */
function groupIntoLines(items: PdfTextItem[]): TextLine[] {
  const usable = items.filter(
    (item) => item.str && item.str.trim() && item.width > 0,
  );
  const lines: TextLine[] = [];
  let current: TextLine | null = null;
  for (const item of usable) {
    const fontSize = fontSizeOf(item);
    const y = item.transform[5];
    if (
      current &&
      Math.abs(current.y - y) <=
        0.45 * Math.max(fontSize, current.fontSize, 1)
    ) {
      current.items.push(item);
    } else {
      current = { y, fontSize: fontSize || 1, items: [item] };
      lines.push(current);
    }
  }
  return lines;
}

/**
 * Split one line's items into column segments at whitespace gaps that are
 * far larger than normal inter-word spacing.
 */
function segmentLine(line: TextLine): { x0: number; x1: number; text: string }[] {
  const sorted = [...line.items].sort(
    (a, b) => a.transform[4] - b.transform[4],
  );
  const threshold = Math.max(GAP_FLOOR, GAP_FONT_RATIO * line.fontSize);
  const segments: { x0: number; x1: number; text: string }[] = [];
  let seg: { x0: number; x1: number; text: string } | null = null;
  for (const item of sorted) {
    const x = item.transform[4];
    const x1 = x + item.width;
    if (seg && x - seg.x1 <= threshold) {
      seg.text += (seg.text ? " " : "") + item.str.trim();
      seg.x1 = Math.max(seg.x1, x1);
    } else {
      seg = { x0: x, x1, text: item.str.trim() };
      segments.push(seg);
    }
  }
  return segments;
}

/**
 * Snap a run's line segments onto one shared column-boundary model.
 *
 * Returns null for a line whose segments cannot be mapped injectively onto
 * the boundaries (two segments claiming the same column, or a segment too
 * far from any boundary) — such lines cannot belong to a clean grid table.
 */
function snapToBoundaries(
  segments: { x0: number; x1: number; text: string }[],
  boundaries: number[],
  tolerance: number,
): string[] | null {
  const cells = boundaries.map(() => "");
  const claimed = new Set<number>();
  for (const segment of segments) {
    let best = -1;
    let bestDist = Infinity;
    for (let c = 0; c < boundaries.length; c++) {
      const dist = Math.abs(segment.x0 - boundaries[c]);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (best === -1 || bestDist > tolerance || claimed.has(best)) return null;
    claimed.add(best);
    cells[best] = segment.text;
  }
  return cells;
}

/**
 * True when any column's cell lengths vary too much for a genuine
 * 2-column table. Variance is judged as max length vs min (non-empty)
 * length with an absolute ceiling of TWO_COL_MAX_CELL_LEN chars: numeric
 * key/value pairs ("03".."Total", "167.030".."1,246.984") fit comfortably,
 * while sentence fragments like "5. Deputy Director Recovery - II, WASA"
 * (38 chars) blow past it. BOTH bounds must hold.
 */
const TWO_COL_MAX_CELL_LEN = 16;
const TWO_COL_VARIANCE_RATIO = 2.5;

function isHighLengthVariance(rows: string[][]): boolean {
  for (let c = 0; c < 2; c++) {
    const lengths = rows
      .map((row) => (row[c] ?? "").trim().length)
      .filter((len) => len > 0);
    if (lengths.length === 0) return true;
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    if (max > TWO_COL_MAX_CELL_LEN) return true;
    if (max > TWO_COL_VARIANCE_RATIO * min) return true;
  }
  return false;
}

/**
 * Try to interpret a maximal run of consecutive row-like lines as a table.
 * Returns null when the run fails any detection gate.
 *
 * Returns the detected table plus any "stray" items — rows that could not
 * snap onto the shared boundary model fall back to prose instead of killing
 * the entire run. This prevents a structurally-divergent tail (e.g. a
 * summary section after a table) from poisoning the rows before it.
 */
function buildTableFromRun(
  run: { line: TextLine; segments: { x0: number; x1: number; text: string }[] }[],
): { table: DetectedTable; strayItems: PdfTextItem[] } | null {
  if (run.length < MIN_TABLE_ROWS) return null;

  // Shared boundary model: the run's densest line defines the columns.
  let reference = run[0];
  for (const entry of run) {
    if (entry.segments.length > reference.segments.length) reference = entry;
  }
  const columnCount = reference.segments.length;
  if (columnCount < MIN_TABLE_COLUMNS) return null;
  const columnXs = reference.segments.map((s) => s.x0);
  const tolerance = Math.max(
    SNAP_TOLERANCE_FLOOR,
    SNAP_TOLERANCE_FONT * reference.line.fontSize,
  );

  const rows: string[][] = [];
  const strayItems: PdfTextItem[] = [];
  let snapFailures = 0;
  for (const entry of run) {
    const cells = snapToBoundaries(entry.segments, columnXs, tolerance);
    if (!cells) {
      // Row cannot snap — collect its items as stray prose and skip it.
      snapFailures++;
      strayItems.push(...entry.line.items);
      continue;
    }
    rows.push(cells);
  }

  // Too many rows failed to snap — the run is not a coherent grid.
  if (snapFailures / run.length > MAX_SNAP_FAILURE_RATIO) return null;

  // Stability + consistency gates: most rows must snap successfully onto
  // the shared grid. Rows with fewer segments than columnCount are still
  // consistent (they just leave some cells empty) — what matters is that
  // they snap, not that they have the maximum number of segments.
  if (rows.length / run.length < MIN_CONSISTENCY) return null;

  // Two-column runs are the classic false-positive shape: a numbered list
  // with a short trailing annotation ("1. Director Recovery, WASA
  // (Chairman)") segments exactly like a 2-column grid. Genuine 2-column
  // tables (e.g. "UC"/"Arrears" numeric pairs) have short, tightly-bounded
  // cell text in BOTH columns, while list items are sentence fragments whose
  // lengths vary a lot. Require low length variance in every column.
  if (columnCount === 2 && isHighLengthVariance(rows)) return null;

  return {
    table: {
      columnCount,
      columnXs,
      tableRight: Math.max(
        ...run.flatMap((entry) => entry.segments.map((s) => s.x1)),
      ),
      rows,
    },
    strayItems,
  };
}

/**
 * Compute the mode (most frequent) segment count across a run. Used to
 * detect structural breaks: when a new line's column count diverges from
 * the run's dominant count by more than 1, the run is terminated so a
 * structurally-divergent tail cannot poison the rows before it.
 */
function modeSegmentCount(
  run: { segments: { x0: number; x1: number; text: string }[] }[],
): number {
  const counts = new Map<number, number>();
  for (const entry of run) {
    const k = entry.segments.length;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = k;
    }
  }
  return best;
}

/**
 * Partition a page's items (expected already sorted top-to-bottom,
 * left-to-right, as done by the caller) into an ordered sequence of table
 * and prose blocks. Prose blocks preserve the original item order so they
 * can flow straight into the existing paragraph grouping.
 */
export function partitionPageIntoBlocks(items: PdfTextItem[]): PageBlock[] {
  const lines = groupIntoLines(items);
  if (lines.length === 0) return [];

  const blocks: PageBlock[] = [];
  let proseItems: PdfTextItem[] = [];
  const flushProse = () => {
    if (proseItems.length) {
      blocks.push({ kind: "prose", items: proseItems });
      proseItems = [];
    }
  };

  // Walk the lines, grouping consecutive row-like lines into candidate runs.
  let run: { line: TextLine; segments: { x0: number; x1: number; text: string }[] }[] = [];

  const closeRun = () => {
    const result = buildTableFromRun(run);
    if (result) {
      flushProse();
      blocks.push({ kind: "table", table: result.table });
      // Rows that failed to snap become prose in original order.
      if (result.strayItems.length) {
        proseItems.push(...result.strayItems);
      }
    } else {
      // Not a table: every line falls back to prose in original order.
      for (const entry of run) proseItems.push(...entry.line.items);
    }
    run = [];
  };

  for (const line of lines) {
    const segments = segmentLine(line);
    if (segments.length >= MIN_TABLE_COLUMNS) {
      // Structural-break check: if this line's column count diverges from
      // the run's dominant count by more than 1, terminate the run before
      // adding this line — a different layout is starting.
      if (run.length > 0) {
        const mode = modeSegmentCount(run);
        if (Math.abs(segments.length - mode) > 1) {
          closeRun();
        }
      }
      run.push({ line, segments });
    } else {
      closeRun();
      proseItems.push(...line.items);
    }
  }
  closeRun();

  // Flush any prose collected after the last table block.
  flushProse();

  return blocks;
}

/* ------------------------------------------------------------------------- *
 * OCR-side table detection
 *
 * Same column-boundary concept as the text-PDF path, but fed from
 * Tesseract's word-level bboxes (data.blocks[].paragraphs[].lines[].words).
 * OCR coordinates are much noisier than pdfjs's, and cell text is often
 * garbled or missing entirely (checkbox marks usually are not recognized as
 * characters at all), so this variant:
 *   - tolerates sparse rows (a line with a single segment becomes a row with
 *     empty cells at the unclaimed column positions),
 *   - rejects any segment that spans across an adjacent column boundary
 *     (the classic OCR-garbage shape: one "word" glued across the grid),
 *   - requires a minimum average word confidence inside the run,
 * and is biased to fall back to flat paragraph text whenever anything looks
 * ambiguous. Empirically (see the synthetic ruled rating form) Tesseract's
 * default page segmentation garbles ruled-grid cells badly, so most real
 * forms will NOT pass these gates — that is the intended, conservative
 * behaviour: no table beats a broken table.
 * ------------------------------------------------------------------------- */

export interface OcrWordBox {
  text: string;
  x0: number;
  x1: number;
  confidence: number;
}

export interface OcrLineBox {
  text: string;
  y0: number;
  y1: number;
  words: OcrWordBox[];
}

export type OcrPageBlock =
  | { kind: "table"; table: DetectedTable }
  | { kind: "prose"; lines: OcrLineBox[] };

// OCR tuning (pixel coordinates at the OCR render scale).
const OCR_GAP_HEIGHT_RATIO = 2.2;   // column gap >= 2.2x line height
const OCR_GAP_FLOOR_PX = 25;        // ...and at least this many px
const OCR_SNAP_TOLERANCE = 1.5;     // boundary snap tolerance ~1.5x line height
const OCR_MIN_WORD_CONFIDENCE = 50; // avg word confidence required in a run
const OCR_MAX_SPARSE_RATIO = 0.4;   // <=40% of a run's rows may be sparse

interface OcrSegmentedLine {
  y0: number;
  y1: number;
  height: number;
  segments: { x0: number; x1: number; text: string; confidence: number }[];
}

function segmentOcrLine(line: OcrLineBox): OcrSegmentedLine {
  const words = [...line.words].sort((a, b) => a.x0 - b.x0);
  const height = Math.max(1, line.y1 - line.y0);
  const threshold = Math.max(OCR_GAP_FLOOR_PX, OCR_GAP_HEIGHT_RATIO * height);
  const segments: OcrSegmentedLine["segments"] = [];
  let seg: OcrSegmentedLine["segments"][number] | null = null;
  for (const word of words) {
    const text = word.text.trim();
    if (!text) continue;
    if (seg && word.x0 - seg.x1 < threshold) {
      seg.text += ` ${text}`;
      seg.x1 = word.x1;
      seg.confidence = Math.min(seg.confidence, word.confidence);
    } else {
      seg = { x0: word.x0, x1: word.x1, text, confidence: word.confidence };
      segments.push(seg);
    }
  }
  return { y0: line.y0, y1: line.y1, height, segments };
}

/**
 * Snap OCR segments to the shared boundaries, additionally rejecting any
 * segment whose right edge crosses into the next column — OCR frequently
 * glues the whole grid into one giant "word" and this is the cheapest
 * reliable way to reject such garbage rows.
 */
function snapOcrToBoundaries(
  line: OcrSegmentedLine,
  boundaries: number[],
  tolerance: number,
): string[] | null {
  const cells = boundaries.map(() => "");
  const claimed = new Set<number>();
  for (const segment of line.segments) {
    let best = -1;
    let bestDist = Infinity;
    for (let c = 0; c < boundaries.length; c++) {
      const dist = Math.abs(segment.x0 - boundaries[c]);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (best === -1 || bestDist > tolerance || claimed.has(best)) return null;
    const nextEdge =
      best + 1 < boundaries.length
        ? boundaries[best + 1] - 0.5 * tolerance
        : Infinity;
    if (segment.x1 > nextEdge) return null; // spans into the next column
    claimed.add(best);
    cells[best] = segment.text;
  }
  return cells;
}

function buildOcrTableFromRun(run: OcrSegmentedLine[]): DetectedTable | null {
  // Row-like lines carry >= 2 segments; a run needs at least MIN_TABLE_ROWS
  // of them. Sparse (single-segment) lines inside the run are tolerated up
  // to OCR_MAX_SPARSE_RATIO of the run — they become rows with empty cells.
  const rowLike = run.filter((l) => l.segments.length >= 2);
  if (rowLike.length < MIN_TABLE_ROWS) return null;
  if ((run.length - rowLike.length) / run.length > OCR_MAX_SPARSE_RATIO) {
    return null;
  }

  // Shared boundary model from the densest row-like line.
  let reference = rowLike[0];
  for (const entry of rowLike) {
    if (entry.segments.length > reference.segments.length) {
      reference = entry;
    }
  }
  const columnCount = reference.segments.length;
  if (columnCount < MIN_TABLE_COLUMNS) return null;
  const columnXs = reference.segments.map((s) => s.x0);
  const tolerance = Math.max(15, OCR_SNAP_TOLERANCE * reference.height);

  const rows: string[][] = [];
  let totalConf = 0;
  let confSegments = 0;
  for (const entry of run) {
    const cells = snapOcrToBoundaries(entry, columnXs, tolerance);
    if (!cells) return null; // anything misaligned → not a table
    rows.push(cells);
    for (const segment of entry.segments) {
      totalConf += segment.confidence;
      confSegments += 1;
    }
  }

  // OCR quality gate: garbled grid regions read at low confidence.
  if (confSegments === 0 || totalConf / confSegments < OCR_MIN_WORD_CONFIDENCE) {
    return null;
  }

  if (columnCount === 2 && isHighLengthVariance(rows)) return null;

  return {
    columnCount,
    columnXs,
    tableRight: Math.max(...run.flatMap((e) => e.segments.map((s) => s.x1))),
    rows,
  };
}

/**
 * Partition OCR'd lines (top-to-bottom) into table and prose blocks.
 * Extremely conservative: anything that fails a gate falls back to prose.
 */
export function partitionOcrLinesIntoBlocks(
  lines: OcrLineBox[],
): OcrPageBlock[] {
  const sorted = [...lines].sort((a, b) => a.y0 - b.y0);
  // Keep (original, segmented) pairs so filtered-out empty lines can't
  // desynchronize the two arrays.
  const segmented = sorted
    .map((original) => ({ original, seg: segmentOcrLine(original) }))
    .filter((entry) => entry.seg.segments.length > 0);

  const blocks: OcrPageBlock[] = [];
  let prose: OcrLineBox[] = [];
  const flushProse = () => {
    if (prose.length) {
      blocks.push({ kind: "prose", lines: prose });
      prose = [];
    }
  };

  // A run = maximal consecutive lines that are row-like or sparse. Two
  // consecutive sparse lines terminate the run: isolated stray words must
  // never glue a table together across a prose gap.
  let run: OcrSegmentedLine[] = [];
  let runOriginal: OcrLineBox[] = [];
  let sparseStreak = 0;

  const closeRun = () => {
    const table = buildOcrTableFromRun(run);
    if (table) {
      flushProse();
      blocks.push({ kind: "table", table });
    } else {
      prose.push(...runOriginal);
    }
    run = [];
    runOriginal = [];
    sparseStreak = 0;
  };

  for (let i = 0; i < segmented.length; i++) {
    const line = segmented[i].seg;
    const original = segmented[i].original;
    if (line.segments.length >= 2) {
      if (sparseStreak >= 2) closeRun();
      sparseStreak = 0;
      run.push(line);
      runOriginal.push(original);
    } else if (run.length > 0) {
      // Sparse line tentatively joining an open run.
      run.push(line);
      runOriginal.push(original);
      sparseStreak += 1;
    } else {
      prose.push(original);
    }
  }
  closeRun();
  flushProse();

  return blocks;
}

