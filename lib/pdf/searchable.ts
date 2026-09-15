import { degrees, PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeSearchablePdfFilename } from "@/lib/pdf/filenames";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { createPdfOcrEngine, recognizePdfPage, type WordProgressPhase } from "@/lib/pdf/to-word";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";
import type { WordPage, WordSpan } from "@/lib/pdf/word-layout";

export const MAX_SEARCHABLE_PDF_SOURCE_PAGES = 200;
export const MAX_SEARCHABLE_PDF_OUTPUT_SIZE = 200 * 1024 * 1024;
export const SEARCHABLE_PDF_MIN_TEXT_CHARS = 25;

export type SearchablePdfProgressPhase = WordProgressPhase | "saving";
export type SearchableTextPlacement = {
  text: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
};
export type SearchablePdfResult = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  ocrPageCount: number;
  preservedTextPageCount: number;
  unreadablePageCount: number;
};

type PdfViewport = {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
};

export function hasUsablePdfText(textContent: { items: Array<unknown> }) {
  return textContent.items.reduce<number>((count, item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return count;
    return count + String(item.str ?? "").replace(/\s/g, "").length;
  }, 0) >= SEARCHABLE_PDF_MIN_TEXT_CHARS;
}

function spansFromWordPage(page: WordPage): WordSpan[] {
  return page.blocks.flatMap((block) => {
    if (block.kind === "image") return [];
    if (block.kind === "table") return block.rows.flat(2).flatMap((line) => line.spans);
    return block.lines.flatMap((line) => line.spans);
  }).filter((span) => span.text.trim());
}

function inverseRotatedPoint(
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270,
  width: number,
  height: number,
): [number, number] {
  if (rotation === 90) return [y, height - x];
  if (rotation === 180) return [width - x, height - y];
  if (rotation === 270) return [width - y, x];
  return [x, y];
}

/** Map the OCR page's top-down coordinates back through its corrective
 * rotation and PDF.js viewport into original PDF user-space coordinates. */
export function searchablePlacements(
  wordPage: WordPage,
  ocrRotation: 0 | 90 | 180 | 270,
  viewport: PdfViewport,
): SearchableTextPlacement[] {
  return spansFromWordPage(wordPage).map((span) => {
    const start = inverseRotatedPoint(span.x, span.y, ocrRotation, viewport.width, viewport.height);
    const end = inverseRotatedPoint(span.x + span.width, span.y, ocrRotation, viewport.width, viewport.height);
    const top = inverseRotatedPoint(span.x, span.y - span.size, ocrRotation, viewport.width, viewport.height);
    const [x, y] = viewport.convertToPdfPoint(...start);
    const [endX, endY] = viewport.convertToPdfPoint(...end);
    const [topX, topY] = viewport.convertToPdfPoint(...top);
    return {
      text: span.text,
      x,
      y,
      angle: Math.atan2(endY - y, endX - x) * 180 / Math.PI,
      width: Math.hypot(endX - x, endY - y),
      height: Math.hypot(topX - x, topY - y),
    };
  }).filter((placement) => placement.width > 1 && placement.height > 1);
}

function encodableEnglishText(font: PDFFont, value: string) {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  let result = "";
  for (const character of normalized) {
    try { font.encodeText(character); result += character; }
    catch { result += " "; }
  }
  return result.replace(/\s+/g, " ").trim();
}

export async function addSearchableTextLayers(
  source: Uint8Array,
  layers: Map<number, SearchableTextPlacement[]>,
) {
  const document = await PDFDocument.load(source, { ignoreEncryption: false, updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const [pageNumber, placements] of layers) {
    const page = document.getPage(pageNumber - 1);
    for (const placement of placements) {
      const text = encodableEnglishText(font, placement.text);
      if (!text) continue;
      let size = Math.max(3, Math.min(72, placement.height * 0.82));
      const measured = font.widthOfTextAtSize(text, size);
      if (measured > placement.width && measured > 0) size *= placement.width / measured;
      page.drawText(text, {
        x: placement.x,
        y: placement.y,
        size: Math.max(2, size),
        font,
        rotate: degrees(placement.angle),
        // A near-zero fill avoids a Poppler rendering bug triggered by a
        // fully transparent text graphics state while remaining invisible.
        opacity: 0.0001,
      });
    }
  }
  return document.save();
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new PdfProcessingError("searchable-pdf-failed", "Searchable PDF creation was cancelled.");
}

export async function createSearchablePdf(
  file: File,
  onProgress?: (current: number, total: number, phase: SearchablePdfProgressPhase, subProgress?: number) => void,
  signal?: AbortSignal,
): Promise<SearchablePdfResult> {
  await validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotCancelled(signal);
  const renderer = await loadPdfRendererDocument(file);
  let engine: Awaited<ReturnType<typeof createPdfOcrEngine>> | null = null;
  const layers = new Map<number, SearchableTextPlacement[]>();
  let preservedTextPageCount = 0;
  let unreadablePageCount = 0;
  try {
    if (!renderer.numPages || renderer.numPages > MAX_SEARCHABLE_PDF_SOURCE_PAGES) {
      throw new PdfProcessingError("searchable-pdf-workload-too-large", `This tool supports PDFs with up to ${MAX_SEARCHABLE_PDF_SOURCE_PAGES} pages.`);
    }
    for (let pageNumber = 1; pageNumber <= renderer.numPages; pageNumber += 1) {
      assertNotCancelled(signal);
      onProgress?.(pageNumber, renderer.numPages, "extracting");
      const page = await renderer.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        if (hasUsablePdfText(textContent)) {
          preservedTextPageCount += 1;
          continue;
        }
        const reportOcrProgress = onProgress ? (current: number, total: number, phase?: WordProgressPhase, part?: number) => onProgress(current, total, phase ?? "ocr", part) : undefined;
        if (!engine) engine = await createPdfOcrEngine(reportOcrProgress, pageNumber, renderer.numPages);
        const recognized = await recognizePdfPage(page, pageNumber, renderer.numPages, engine, reportOcrProgress, signal, true);
        assertNotCancelled(signal);
        const placements = searchablePlacements(recognized.page, recognized.rotation, page.getViewport({ scale: 1 }));
        if (placements.length) layers.set(pageNumber, placements);
        else unreadablePageCount += 1;
      } finally { page.cleanup(); }
    }
    assertNotCancelled(signal);
    if (layers.size === 0 && preservedTextPageCount === 0) {
      throw new PdfProcessingError("ocr-failed", "No readable English text could be recovered. Try a clearer scan.");
    }
    onProgress?.(renderer.numPages, renderer.numPages, "saving");
    const source = new Uint8Array(await file.arrayBuffer());
    const saved = layers.size ? await addSearchableTextLayers(source, layers) : source;
    if (saved.byteLength > MAX_SEARCHABLE_PDF_OUTPUT_SIZE) {
      throw new PdfProcessingError("searchable-pdf-output-too-large", "The searchable PDF exceeds the 200 MB browser safety limit.");
    }
    const blob = new Blob([saved.slice().buffer], { type: "application/pdf" });
    return {
      blob,
      filename: makeSearchablePdfFilename(file.name),
      size: blob.size,
      pageCount: renderer.numPages,
      ocrPageCount: layers.size,
      preservedTextPageCount,
      unreadablePageCount,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError("searchable-pdf-failed", caught instanceof Error ? caught.message : "The searchable PDF could not be created.");
  } finally {
    if (engine) await engine.terminate();
    await renderer.destroy();
  }
}
