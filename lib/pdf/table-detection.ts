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
const SNAP_TOLERANCE_FONT = 0.9;   // boundary snap tolerance ~0.9x font size
const SNAP_TOLERANCE_FLOOR = 7;

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
 */
function buildTableFromRun(
  run: { line: TextLine; segments: { x0: number; x1: number; text: string }[] }[],
): DetectedTable | null {
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
  let consistent = 0;
  for (const entry of run) {
    const cells = snapToBoundaries(entry.segments, columnXs, tolerance);
    if (!cells) return null; // grid is not clean — not a table
    rows.push(cells);
    if (entry.segments.length === columnCount) consistent++;
  }

  // Stability + consistency gates.
  if (consistent / run.length < MIN_CONSISTENCY) return null;

  // Two-column runs are the classic false-positive shape: a numbered list
  // with a short trailing annotation ("1. Director Recovery, WASA
  // (Chairman)") segments exactly like a 2-column grid. Genuine 2-column
  // tables (e.g. "UC"/"Arrears" numeric pairs) have short, tightly-bounded
  // cell text in BOTH columns, while list items are sentence fragments whose
  // lengths vary a lot. Require low length variance in every column.
  if (columnCount === 2 && isHighLengthVariance(rows)) return null;

  return {
    columnCount,
    columnXs,
    tableRight: Math.max(
      ...run.flatMap((entry) => entry.segments.map((s) => s.x1)),
    ),
    rows,
  };
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
    const table = buildTableFromRun(run);
    if (table) {
      flushProse();
      blocks.push({ kind: "table", table });
    } else {
      // Not a table: every line falls back to prose in original order.
      for (const entry of run) proseItems.push(...entry.line.items);
    }
    run = [];
  };

  for (const line of lines) {
    const segments = segmentLine(line);
    if (segments.length >= MIN_TABLE_COLUMNS) {
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

