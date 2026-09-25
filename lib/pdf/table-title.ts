/**
 * Conservative heading recovery for PDF-to-Excel. A title is only kept when the
 * text sits directly above the detected table inside its horizontal band, so
 * distant body prose, footers and neighbouring tables can never leak in.
 * All coordinates are page points, top-down origin. Selection is display-only:
 * rows, evidence and CSV/XLSX matrices are never touched from here.
 */
import { lineText, type WordBlock } from "./word-layout";

export type TableTitleLine = {
  text: string;
  /** Baseline-extent box; parts of the line may still sit outside this range. */
  left: number;
  right: number;
  /** Baseline y minus the ascent approximation; bottom is the descent. */
  top: number;
  bottom: number;
  size: number;
  /** Horizontal ink runs used to reject space-aligned tabular rows. */
  segments: Array<{ left: number; right: number }>;
};

export type TableTitleBox = { left: number; right: number; top: number; bottom: number };

export type TableTitlePage = { lines: TableTitleLine[]; width: number; height: number };

/** Structurally matches the item shape produced by vector-table pageTextItems. */
export type PdfTextItem = {
  text: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  left: number;
  right: number;
  size: number;
};

/** Evidence shape needed to derive a table's page box; PdfCellEvidence satisfies it. */
export type TableTitleEvidenceCell = {
  bbox: { left: number; top: number; width: number; height: number };
} | null;

export const TABLE_TITLE_LIMITS = {
  maxLines: 3,
  maxLineChars: 140,
  maxChars: 200,
  /** A heading sits within ~1.5 lines of the table edge. */
  adjacencyMin: 36,
  adjacencyPerSize: 2.5,
  /** A heading block has paragraph-scale gaps between its lines. */
  blockGapMin: 20,
  blockGapPerSize: 1.8,
  /** Space-aligned (tabular) text is never a heading. */
  rowGapMin: 14,
  rowGapPerSize: 2.4,
  /** A heading roughly spans the table; allow modest asymmetric overhang. */
  bandOverhangRatio: .15,
  bandOverhangMin: 6,
  /** Long terminal-sentence lines are body prose, not headings. */
  proseTailChars: 60,
} as const;

const PAGINATION_LINE = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

function normalizeTitleText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Join horizontally upright PDF text runs into page lines. */
export function titleLinesFromTextItems(items: PdfTextItem[]): TableTitleLine[] {
  const upright = items
    .filter(item => item.text && Math.abs(item.dy) <= Math.abs(item.dx) &&
      Number.isFinite(item.left + item.right + item.y + item.size))
    .sort((a, b) => a.startY - b.startY || a.left - b.left);
  const lines: TableTitleLine[] = [];
  for (const item of upright) {
    const line = lines[lines.length - 1];
    const tolerance = line ? Math.max(1, Math.min(line.size, item.size) * .35) : 0;
    if (line && Math.abs(item.startY - line.bottom) <= tolerance) {
      const gap = item.left - line.right;
      const space = gap >= Math.max(1, Math.min(line.size, item.size) * .15) ? " " : "";
      line.text = normalizeTitleText(line.text + space + item.text);
      line.left = Math.min(line.left, item.left);
      line.right = Math.max(line.right, item.right);
      line.top = Math.min(line.top, item.y - item.size);
      line.bottom = Math.max(line.bottom, item.y + item.size * .2);
      line.size = Math.max(line.size, item.size);
      line.segments.push({ left: item.left, right: item.right });
      continue;
    }
    lines.push({ text: normalizeTitleText(item.text), left: item.left, right: item.right,
      top: item.y - item.size, bottom: item.y + item.size * .2, size: item.size,
      segments: [{ left: item.left, right: item.right }] });
  }
  return lines;
}

/** Lines of prose paragraphs only; table cells never become title candidates. */
export function titleLinesFromBlocks(blocks: WordBlock[]): TableTitleLine[] {
  const lines: TableTitleLine[] = [];
  for (const block of blocks) {
    if (block.kind !== "paragraph" && block.kind !== "heading") continue;
    for (const line of block.lines) {
      const text = normalizeTitleText(lineText(line));
      if (!text) continue;
      lines.push({ text, left: line.x, right: line.right,
        top: line.y - line.size, bottom: line.y + line.size * .2, size: line.size,
        segments: line.spans.filter(span => span.text.trim())
          .map(span => ({ left: span.x, right: span.x + span.width })) });
    }
  }
  return lines;
}

export function titlePageFromBlocks(page: { blocks: WordBlock[]; width: number; height: number }): TableTitlePage {
  return { lines: titleLinesFromBlocks(page.blocks), width: page.width, height: page.height };
}

/** Page-space box of a table from its normalized (0..1) evidence bboxes. */
export function evidenceTitleBox(
  evidence: Array<Array<TableTitleEvidenceCell>>,
  width: number,
  height: number,
): TableTitleBox | undefined {
  const boxes = evidence.flat().filter((cell): cell is NonNullable<TableTitleEvidenceCell> => Boolean(cell))
    .map(cell => cell.bbox);
  if (!boxes.length || !(width > 0) || !(height > 0)) return undefined;
  const left = Math.min(...boxes.map(box => box.left)) * width;
  const right = Math.max(...boxes.map(box => box.left + box.width)) * width;
  const top = Math.min(...boxes.map(box => box.top)) * height;
  const bottom = Math.max(...boxes.map(box => box.top + box.height)) * height;
  if (!(right > left) || !(bottom > top)) return undefined;
  return { left, right, top, bottom };
}

function intersects(box: TableTitleBox, other: TableTitleBox): boolean {
  return box.left < other.right && box.right > other.left &&
    box.top < other.bottom && box.bottom > other.top;
}

function headingLike(line: TableTitleLine): boolean {
  if (line.text.length > TABLE_TITLE_LIMITS.maxLineChars) return false;
  if (PAGINATION_LINE.test(line.text)) return false;
  if (line.text.length >= TABLE_TITLE_LIMITS.proseTailChars && /[.!?]$/.test(line.text)) return false;
  const rowGap = Math.max(TABLE_TITLE_LIMITS.rowGapMin, line.size * TABLE_TITLE_LIMITS.rowGapPerSize);
  for (let index = 1; index < line.segments.length; index++) {
    if (line.segments[index].left - line.segments[index - 1].right >= rowGap) return false;
  }
  return true;
}

/**
 * Select the heading directly above a table: the closest candidate must sit
 * within ~1.5 lines of the table top, span most of its horizontal band, and
 * belong to a gap-consistent block of at most three lines. Anything uncertain
 * returns undefined rather than guessing.
 */
export function selectTableTitle(
  lines: TableTitleLine[],
  region: TableTitleBox | undefined,
  blocked: TableTitleBox[] = [],
): string | undefined {
  if (!region) return undefined;
  const overhang = Math.max(TABLE_TITLE_LIMITS.bandOverhangMin,
    (region.right - region.left) * TABLE_TITLE_LIMITS.bandOverhangRatio);
  const candidates = lines
    .filter(line => line.text &&
      line.bottom <= region.top + 1 &&
      line.left >= region.left - overhang && line.right <= region.right + overhang &&
      !blocked.some(box => intersects(line, box)))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  if (!candidates.length) return undefined;
  const closest = candidates[candidates.length - 1];
  const adjacency = Math.max(TABLE_TITLE_LIMITS.adjacencyMin, closest.size * TABLE_TITLE_LIMITS.adjacencyPerSize);
  if (region.top - closest.bottom > adjacency) return undefined;
  if (!headingLike(closest)) return undefined;
  let end = candidates.length - 1;
  let start = end;
  while (start > 0 && end - start + 1 < TABLE_TITLE_LIMITS.maxLines) {
    const above = candidates[start - 1];
    const gap = candidates[start].top - above.bottom;
    if (gap > Math.max(TABLE_TITLE_LIMITS.blockGapMin, above.size * TABLE_TITLE_LIMITS.blockGapPerSize)) break;
    if (!headingLike(above)) return undefined;
    start -= 1;
  }
  // A fourth line tightly stacked above the selected block is a column of text
  // (or a wider paragraph) whose boundary is unknown: drop the title entirely.
  if (start > 0) {
    const above = candidates[start - 1];
    const gap = candidates[start].top - above.bottom;
    if (gap <= Math.max(TABLE_TITLE_LIMITS.blockGapMin, above.size * TABLE_TITLE_LIMITS.blockGapPerSize)) return undefined;
  }
  const text = candidates.slice(start, end + 1).map(line => line.text).join("\n");
  if (!text || text.length > TABLE_TITLE_LIMITS.maxChars) return undefined;
  return text;
}
