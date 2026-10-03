import { REDACTION_LIMITS, REDACTION_SCALE, RedactionError, type RedactionMark, type RedactionPage, type RedactionRectangle } from "./types";

export function redactionPageGeometry(page: number, width: number, height: number, rotation: number): RedactionPage {
  if (![width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0 || ![0, 90, 180, 270].includes(rotation)) {
    throw new RedactionError("refused", "This PDF has unsupported page geometry or rotation.");
  }
  const pixelWidth = Math.ceil(width * REDACTION_SCALE), pixelHeight = Math.ceil(height * REDACTION_SCALE);
  if (!Number.isSafeInteger(pixelWidth * pixelHeight) || pixelWidth * pixelHeight > REDACTION_LIMITS.pagePixels) {
    throw new RedactionError("limit", "A page exceeds the 4 megapixel export limit. This version cannot process it.");
  }
  return Object.freeze({ page, width, height, rotation, pixelWidth, pixelHeight });
}
export function assertRedactionDocumentLimits(pages: readonly RedactionPage[]) {
  if (!pages.length || pages.length > REDACTION_LIMITS.pages) throw new RedactionError("limit", "Choose a PDF with 1 to 10 pages.");
  if (pages.reduce((sum, page) => sum + page.pixelWidth * page.pixelHeight, 0) > REDACTION_LIMITS.totalPixels) {
    throw new RedactionError("limit", "This PDF exceeds the 40 megapixel total export limit.");
  }
}
export function snapshotRedactionMarks(marks: readonly RedactionMark[], pages: readonly RedactionPage[]) {
  const ids = new Set<string>();
  return Object.freeze(marks.map(mark => {
    const page = pages[mark.page - 1], b = mark.rect;
    if (!mark.id || ids.has(mark.id) || !Number.isInteger(mark.page) || !page || b.length !== 4
      || !b.every(Number.isFinite) || b[0] < 0 || b[1] < 0 || b[2] <= b[0] || b[3] <= b[1]
      || b[2] > page.width || b[3] > page.height) {
      throw new RedactionError("refused", "A marked area is outside its page or is invalid. Review the marks before continuing.");
    }
    ids.add(mark.id);
    return Object.freeze({ id: mark.id, page: mark.page, rect: Object.freeze([...b]) as RedactionRectangle });
  }));
}
export function redactionSelectionKey(marks: readonly RedactionMark[]) {
  return JSON.stringify(marks.map(mark => [mark.id, mark.page, ...mark.rect]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}
export function outwardPixelRectangle(rect: RedactionRectangle) {
  return [Math.floor(rect[0] * REDACTION_SCALE), Math.floor(rect[1] * REDACTION_SCALE),
    Math.ceil(rect[2] * REDACTION_SCALE), Math.ceil(rect[3] * REDACTION_SCALE)] as const;
}
/** CSS coordinates only: DPR and preview zoom never enter stored selections. */
export function redactionPoint(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, page: RedactionPage) {
  return [Math.max(0, Math.min(page.width, (clientX - box.left) / box.width * page.width)),
    Math.max(0, Math.min(page.height, (clientY - box.top) / box.height * page.height))] as const;
}
