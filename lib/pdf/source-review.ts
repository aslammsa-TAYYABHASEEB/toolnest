import type { ExcelCellValue, ExtractedPdfTable, PdfCellEvidence, PdfSourceBox } from "./to-excel";
import type { GridMerge } from "./vector-table";

/** Bounded Source Review zoom so a large page cannot allocate a giant canvas. */
export const SOURCE_REVIEW_MIN_ZOOM = 0.75;
export const SOURCE_REVIEW_MAX_ZOOM = 2;
export const SOURCE_REVIEW_ZOOM_STEP = 0.25;
/** Display-only zoom for the extracted-table pane: never touches values, downloads or evidence. */
export const TABLE_VIEW_MIN_ZOOM = 0.75;
export const TABLE_VIEW_DEFAULT_ZOOM = 1;
export const TABLE_VIEW_MAX_ZOOM = 1.5;
export const TABLE_VIEW_ZOOM_STEP = 0.25;
/** Retina rendering is clamped: 3x device pixels are not needed for cell review. */
export const SOURCE_REVIEW_MAX_PIXEL_RATIO = 2;

export type SourceReviewCell = { row: number; column: number };
export type SourceReviewNotice = "none" | "no-source-location" | "merged-subordinate" | "empty-cell";

export const SOURCE_REVIEW_COPY = {
  heading: "Source Review",
  instruction: "Select a cell to see where it came from in the PDF.",
  location: "Source location",
  tableLabel: "Extracted table",
  noSource: "No source location is available for this cell.",
  emptyCell: "This cell is empty, so there is no source text to highlight.",
  mergedSubordinate: "No separate source location is stored for this merged cell.",
  sourceText: "Source text",
  loading: "Loading the source page…",
  error: "The source page could not be rendered.",
} as const;

export function clampSourceReviewZoom(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(SOURCE_REVIEW_MAX_ZOOM,
    Math.max(SOURCE_REVIEW_MIN_ZOOM, Math.round(value * 100) / 100));
}

/** Bounds the extracted-table display zoom to 0.75x-1.5x; display sizing only. */
export function clampTableViewZoom(value: number) {
  if (!Number.isFinite(value)) return TABLE_VIEW_DEFAULT_ZOOM;
  return Math.min(TABLE_VIEW_MAX_ZOOM,
    Math.max(TABLE_VIEW_MIN_ZOOM, Math.round(value * 100) / 100));
}

export function clampSourceReviewPixelRatio(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(SOURCE_REVIEW_MAX_PIXEL_RATIO, value);
}

/**
 * Display rotation for Source Review: the intrinsic PDF.js page rotation plus the
 * additional clockwise correction stored with OCR evidence.
 * For the supported quarter turns this equals (page.rotate + (evidence.rotation ?? 0)) % 360.
 */
export function sourceReviewRotation(pageRotation: number, evidenceRotation = 0) {
  const total = (Number.isFinite(pageRotation) ? pageRotation : 0) +
    (Number.isFinite(evidenceRotation) ? evidenceRotation : 0);
  const wrapped = ((total % 360) + 360) % 360;
  return (Math.round(wrapped / 90) * 90) % 360;
}

/** Stable identity for the source page/orientation requested by an evidence-backed preview. */
export function sourceReviewPreviewIdentity(fileIdentity: string, evidence: PdfCellEvidence | null) {
  if (!evidence) return null;
  return `${fileIdentity}|page:${evidence.page}|rotation:${sourceReviewRotation(0, evidence.rotation ?? 0)}`;
}

/** A preview is truthful only when its desired source is the source actually painted to canvas. */
export function sourceReviewPreviewMatches(desiredIdentity: string | null, renderedIdentity: string | null) {
  return desiredIdentity !== null && desiredIdentity === renderedIdentity;
}

export function isEmptySourceCell(value: ExcelCellValue | undefined) {
  return String(value ?? "").trim() === "";
}

/** Whether the extracted table really holds an empty value at this exact coordinate. */
export function isEmptySourceCellAt(table: ExtractedPdfTable | undefined, cell: SourceReviewCell | null) {
  if (!table || !cell) return false;
  const row = table.rows[cell.row];
  return Boolean(row) && isEmptySourceCell(row[cell.column]);
}

export function cellEvidence(table: ExtractedPdfTable | undefined, row: number, column: number) {
  return table?.evidence?.[row]?.[column] ?? null;
}

/** First non-empty cell that actually carries provenance. */
export function firstEvidenceCell(table: ExtractedPdfTable | undefined): SourceReviewCell | null {
  if (!table?.rows.length) return null;
  for (let row = 0; row < table.rows.length; row++) {
    const columns = table.rows[row]?.length ?? 0;
    for (let column = 0; column < columns; column++) {
      if (isEmptySourceCell(table.rows[row][column])) continue;
      if (cellEvidence(table, row, column)) return { row, column };
    }
  }
  return null;
}

export function mergeContaining(table: ExtractedPdfTable | undefined, row: number, column: number): GridMerge | null {
  for (const merge of table?.merges ?? []) {
    if (row >= merge.startRow && row <= merge.endRow &&
      column >= merge.startColumn && column <= merge.endColumn) return merge;
  }
  return null;
}

/** Deterministic merged anchor for a subordinate merged cell; null for anchors themselves. */
export function mergeAnchorCell(table: ExtractedPdfTable | undefined, row: number, column: number): SourceReviewCell | null {
  const merge = mergeContaining(table, row, column);
  if (!merge || (merge.startRow === row && merge.startColumn === column)) return null;
  return { row: merge.startRow, column: merge.startColumn };
}

export type SourceReviewSelection = {
  cell: SourceReviewCell | null;
  evidence: PdfCellEvidence | null;
  /** Real evidence used only to display the selected cell's source region. */
  previewEvidence: PdfCellEvidence | null;
  notice: SourceReviewNotice;
  mergedAnchor: SourceReviewCell | null;
  /**
   * Display-only: the already rendered page may stay on screen as context because the selection
   * is a genuinely empty region that has no source location of its own. It never carries
   * evidence, a highlight, source details or an invented source text.
   */
  retainPageContext: boolean;
};

export function describeSourceReviewSelection(
  table: ExtractedPdfTable | undefined,
  cell: SourceReviewCell | null,
): SourceReviewSelection {
  if (!table || !cell) return { cell: cell ?? null, evidence: null, previewEvidence: null,
    notice: "no-source-location", mergedAnchor: null, retainPageContext: false };
  const evidence = cellEvidence(table, cell.row, cell.column);
  if (evidence) return { cell, evidence, previewEvidence: evidence, notice: "none", mergedAnchor: null,
    retainPageContext: false };
  const mergedAnchor = mergeAnchorCell(table, cell.row, cell.column);
  if (mergedAnchor) {
    // A merged subordinate keeps its own null evidence and may only ever preview the real evidence
    // stored on its anchor. When that anchor has none, page context may stay on screen only when
    // the selected subordinate and the anchor are both genuinely empty; a non-empty merged region
    // whose provenance went missing stays conservative and retains nothing.
    const anchorEvidence = cellEvidence(table, mergedAnchor.row, mergedAnchor.column);
    const emptyMergedRegion = anchorEvidence === null &&
      isEmptySourceCellAt(table, mergedAnchor) && isEmptySourceCellAt(table, cell);
    return { cell, evidence: null, previewEvidence: anchorEvidence, notice: "merged-subordinate",
      mergedAnchor, retainPageContext: emptyMergedRegion };
  }
  // A genuinely empty cell has no source text at all; keep it distinct from a non-empty
  // cell that simply has no stored provenance. Neither case may invent evidence.
  const row = table.rows[cell.row];
  if (row && isEmptySourceCell(row[cell.column])) return { cell, evidence: null, previewEvidence: null,
    notice: "empty-cell", mergedAnchor: null, retainPageContext: true };
  return { cell, evidence: null, previewEvidence: null, notice: "no-source-location", mergedAnchor: null,
    retainPageContext: false };
}

export function sourceReviewNoticeMessage(selection: SourceReviewSelection) {
  if (selection.notice === "merged-subordinate") return SOURCE_REVIEW_COPY.mergedSubordinate;
  if (selection.notice === "empty-cell") return SOURCE_REVIEW_COPY.emptyCell;
  if (selection.notice === "no-source-location") return SOURCE_REVIEW_COPY.noSource;
  return null;
}

function percent(value: number) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return `${Math.round(clamped * 10000) / 100}%`;
}

/** Normalized (0..1, top-left origin) evidence box as CSS percentages of the rendered page. */
export function sourceReviewBoxStyle(box: PdfSourceBox) {
  const left = Math.min(1, Math.max(0, Number.isFinite(box.left) ? box.left : 0));
  const width = Math.min(Number.isFinite(box.width) ? box.width : 0, 1 - left);
  return { left: percent(left), top: percent(box.top), width: percent(width), height: percent(box.height) };
}

export function sourceReviewSourceLabel(evidence: PdfCellEvidence) {
  return evidence.source === "ocr" ? "OCR" : "PDF text";
}

/** Only actual OCR confidence is reported; native PDF text never gets an invented score. */
export function sourceReviewOcrConfidence(evidence: PdfCellEvidence) {
  if (evidence.source !== "ocr") return null;
  if (typeof evidence.ocrConfidence !== "number" || !Number.isFinite(evidence.ocrConfidence)) return null;
  return `OCR confidence: ${Math.round(evidence.ocrConfidence)}%`;
}

export function sourceReviewPageLabel(page: number, totalPages: number) {
  return totalPages > 0 ? `Page ${page} of ${totalPages}` : `Page ${page}`;
}

export function sourceReviewCellLabel(cell: SourceReviewCell | null) {
  return cell ? `Row ${cell.row + 1} · Column ${cell.column + 1}` : "";
}
