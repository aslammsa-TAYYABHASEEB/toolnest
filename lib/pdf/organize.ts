import { PDFDocument, degrees } from "pdf-lib";
import { loadPdfDocument } from "./loading";
import { PdfProcessingError } from "./errors";
import { normalizePdfRotation, readPdfRotationMetadata } from "./rotation";
import { makeOrganizedPdfFilename } from "./filenames";
import { validatePdfTotalSize } from "./validation";
import { MAX_PDF_ROTATE_SOURCE_PAGES, MAX_PDF_ROTATE_OUTPUT_SIZE, PDF_MIME_TYPE, type PdfRotationSource } from "./types";

export const ORGANIZER_PAGE_LIMIT = MAX_PDF_ROTATE_SOURCE_PAGES;
export const ORGANIZER_UNDO_LIMIT = 20;
export type OrganizerPage = { id: string; sourceId: string; pageIndex: number; rotation: number };
export type OrganizerSource = PdfRotationSource;
export type InsertPosition = "end" | "before" | "after";

export function assertOrganizerCount(count: number) {
  if (count > ORGANIZER_PAGE_LIMIT) throw new PdfProcessingError("workload-too-large", `Keep the session within ${ORGANIZER_PAGE_LIMIT} pages, including inserted pages and duplicates.`);
}

export async function prepareOrganizerSource(file: File, id: string, existing: OrganizerSource[] = []) {
  validatePdfTotalSize([...existing.map(s => s.file), file]);
  const source = await readPdfRotationMetadata(file, id);
  assertOrganizerCount(existing.reduce((n, s) => n + s.pageCount, 0) + source.pageCount);
  return source;
}

export function sourceOrganizerPages(source: OrganizerSource, newId: () => string): OrganizerPage[] {
  return Array.from({ length: source.pageCount }, (_, pageIndex) => ({ id: newId(), sourceId: source.id, pageIndex, rotation: 0 }));
}

export function moveOrganizerPage(pages: OrganizerPage[], id: string, targetIndex: number) {
  const from = pages.findIndex(p => p.id === id);
  if (from < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= pages.length || from === targetIndex) return pages;
  const next = [...pages]; const [item] = next.splice(from, 1); next.splice(targetIndex, 0, item); return next;
}

export function changeOrganizerPages(pages: OrganizerPage[], selected: Set<string>, action: "delete" | "clockwise" | "counterclockwise" | "duplicate", newId: () => string): OrganizerPage[] {
  if (!pages.some(p => selected.has(p.id))) return pages;
  if (action === "duplicate") assertOrganizerCount(pages.length + pages.filter(p => selected.has(p.id)).length);
  return pages.flatMap(p => {
    if (!selected.has(p.id)) return [p];
    if (action === "delete") return [];
    if (action === "duplicate") return [p, { ...p, id: newId() }];
    return [{ ...p, rotation: normalizePdfRotation(p.rotation + (action === "clockwise" ? 90 : -90)) }];
  });
}

export function insertOrganizerPages(pages: OrganizerPage[], added: OrganizerPage[], selected: Set<string>, position: InsertPosition) {
  assertOrganizerCount(pages.length + added.length);
  const index = pages.findIndex(p => selected.has(p.id));
  const at = position === "end" || index < 0 ? pages.length : index + (position === "after" ? 1 : 0);
  return [...pages.slice(0, at), ...added, ...pages.slice(at)];
}

/** Copy original page objects, never thumbnails. Copy each occurrence separately
 * so duplicate pages can have independent rotations and annotations. */
export async function exportOrganizedPdf(sources: OrganizerSource[], pages: OrganizerPage[], selectedOnly = false, onProgress?: (done: number, total: number) => void) {
  if (!pages.length) throw new PdfProcessingError("invalid-page-selection", "Keep or select at least one page before exporting. Undo a deletion, reset, or insert another PDF.");
  assertOrganizerCount(pages.length);
  validatePdfTotalSize(sources.map(s => s.file));
  const sourceMap = new Map(sources.map(s => [s.id, s]));
  if (pages.some(p => !sourceMap.has(p.sourceId) || !Number.isInteger(p.pageIndex) || p.pageIndex < 0 || p.pageIndex >= sourceMap.get(p.sourceId)!.pageCount || ![0, 90, 180, 270].includes(p.rotation))) {
    throw new PdfProcessingError("invalid-page-selection", "The page list is invalid. Reset the document and try again.");
  }
  try {
    const output = await PDFDocument.create();
    const loaded = new Map<string, PDFDocument>();
    for (const [i, item] of pages.entries()) {
      let source = loaded.get(item.sourceId);
      if (!source) { source = await loadPdfDocument(sourceMap.get(item.sourceId)!.file); loaded.set(item.sourceId, source); }
      const [copy] = await output.copyPages(source, [item.pageIndex]);
      copy.setRotation(degrees(normalizePdfRotation(copy.getRotation().angle + item.rotation)));
      output.addPage(copy);
      onProgress?.(i + 1, pages.length);
      if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const bytes = await output.save({ useObjectStreams: true });
    if (bytes.length > MAX_PDF_ROTATE_OUTPUT_SIZE) throw new PdfProcessingError("workload-too-large", "The organized PDF exceeds the 200 MB output limit. Export fewer pages.");
    const blob = new Blob([new Uint8Array(bytes)], { type: PDF_MIME_TYPE });
    return { blob, filename: makeOrganizedPdfFilename(sources[0]?.file.name ?? "document.pdf", selectedOnly), pageCount: pages.length, size: blob.size };
  } catch (error) {
    if (error instanceof PdfProcessingError) throw error;
    throw new PdfProcessingError("organize-failed", "The organized PDF could not be exported. Your session is unchanged; try fewer pages or another file.");
  }
}
