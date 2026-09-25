import type { ExtractedPdfTable } from "./to-excel";
import type { GridMerge } from "./vector-table";

/**
 * Display-only plan for the extracted-table preview. It reads table.rows and table.merges and
 * expresses a merged region as one spanning cell; the underlying matrix is never rewritten and
 * no value is ever copied, moved or dropped.
 */
export type TableViewCell = {
  /** Real matrix coordinate of the rendered cell (the merge start inside a merged region). */
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
  /** True only when this coordinate is the start of an applied merge. */
  merged: boolean;
};

export type TableViewPlan = {
  /** Rendered rows in order; a coordinate covered by an applied merge appears in no row. */
  rows: TableViewCell[][];
  /** Merges that are drawn as one spanning cell. */
  applied: GridMerge[];
  /** Merges left expanded on purpose, so no stored value can be hidden by rendering. */
  skipped: GridMerge[];
};

export const TABLE_VIEW_COPY = {
  skippedMerge: (count: number) => `${count} merged region${count === 1 ? " is" : "s are"} ` +
    "shown cell by cell because the stored values underneath would otherwise be hidden.",
} as const;

const isEmptyValue = (value: unknown) => String(value ?? "").trim() === "";
const cellKey = (row: number, column: number) => `${row}:${column}`;
const mergeKey = (merge: GridMerge) =>
  `${cellKey(merge.startRow, merge.startColumn)}-${cellKey(merge.endRow, merge.endColumn)}`;

function isMergeShape(merge: GridMerge) {
  return Number.isInteger(merge.startRow) && Number.isInteger(merge.endRow) &&
    Number.isInteger(merge.startColumn) && Number.isInteger(merge.endColumn) &&
    merge.startRow >= 0 && merge.startColumn >= 0 &&
    merge.startRow <= merge.endRow && merge.startColumn <= merge.endColumn;
}

/** Every coordinate of the region must exist, otherwise a span would outrun the real matrix. */
function regionExists(rows: ExtractedPdfTable["rows"], merge: GridMerge) {
  for (let row = merge.startRow; row <= merge.endRow; row += 1)
    if (!rows[row] || rows[row].length <= merge.endColumn) return false;
  return true;
}

/** A merge may only hide coordinates that genuinely hold no value of their own. */
function regionHoldsOwnData(rows: ExtractedPdfTable["rows"], merge: GridMerge) {
  for (let row = merge.startRow; row <= merge.endRow; row += 1)
    for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
      if (row === merge.startRow && column === merge.startColumn) continue;
      if (!isEmptyValue(rows[row][column])) return true;
    }
  return false;
}

function regionOverlaps(covered: Set<string>, merge: GridMerge) {
  for (let row = merge.startRow; row <= merge.endRow; row += 1)
    for (let column = merge.startColumn; column <= merge.endColumn; column += 1)
      if (covered.has(cellKey(row, column))) return true;
  return false;
}

/**
 * Builds the render plan for one extracted table. A merge is applied only when it is well formed,
 * fully inside the matrix, does not overlap an already applied merge and covers no stored value;
 * anything else is reported through `skipped` and rendered cell by cell instead.
 */
export function tableViewPlan(table: ExtractedPdfTable | undefined | null): TableViewPlan {
  const matrix = table?.rows ?? [];
  const applied: GridMerge[] = [];
  const skipped: GridMerge[] = [];
  const anchors = new Map<string, GridMerge>();
  const covered = new Set<string>();
  const handled = new Set<string>();
  for (const merge of table?.merges ?? []) {
    if (!isMergeShape(merge)) { skipped.push({ ...merge }); continue; }
    const key = mergeKey(merge);
    if (handled.has(key)) continue;
    handled.add(key);
    // A 1x1 region is not a merge: it hides and changes nothing.
    if (merge.startRow === merge.endRow && merge.startColumn === merge.endColumn) continue;
    if (!regionExists(matrix, merge) || regionHoldsOwnData(matrix, merge) || regionOverlaps(covered, merge)) {
      skipped.push({ ...merge });
      continue;
    }
    anchors.set(cellKey(merge.startRow, merge.startColumn), merge);
    for (let row = merge.startRow; row <= merge.endRow; row += 1)
      for (let column = merge.startColumn; column <= merge.endColumn; column += 1) covered.add(cellKey(row, column));
    applied.push({ ...merge });
  }
  const rows = matrix.map((sourceRow, row) => {
    const planRow: TableViewCell[] = [];
    for (let column = 0; column < sourceRow.length; column += 1) {
      const merge = anchors.get(cellKey(row, column));
      if (!merge && covered.has(cellKey(row, column))) continue;
      planRow.push({ row, column,
        rowSpan: merge ? merge.endRow - merge.startRow + 1 : 1,
        colSpan: merge ? merge.endColumn - merge.startColumn + 1 : 1,
        merged: Boolean(merge) });
    }
    return planRow;
  });
  return { rows, applied, skipped };
}

/** The rendered cell covering a real matrix coordinate; null when nothing is rendered there. */
export function tableViewCellAt(plan: TableViewPlan, row: number, column: number): TableViewCell | null {
  for (const planRow of plan.rows) for (const cell of planRow)
    if (row >= cell.row && row < cell.row + cell.rowSpan && column >= cell.column && column < cell.column + cell.colSpan)
      return cell;
  return null;
}

/**
 * Visible selection for a real selection: a coordinate inside an applied merge resolves to the
 * rendered anchor cell, every other coordinate keeps selecting itself. Selection state, and with
 * it all Source Review provenance, stays owned by the caller and is never rewritten here.
 */
export function tableViewSelection(plan: TableViewPlan, cell: { row: number; column: number } | null) {
  if (!cell) return null;
  const rendered = tableViewCellAt(plan, cell.row, cell.column);
  return rendered ? { row: rendered.row, column: rendered.column } : { row: cell.row, column: cell.column };
}

export function tableViewMergeNotice(plan: TableViewPlan) {
  return plan.skipped.length ? TABLE_VIEW_COPY.skippedMerge(plan.skipped.length) : null;
}
