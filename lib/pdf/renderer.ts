import type { PDFDocumentProxy } from "pdfjs-dist";
import { assertPdfRenderingSupport } from "@/lib/pdf/capabilities";
import { PdfProcessingError } from "@/lib/pdf/errors";
import {
  MAX_PDF_RENDER_SOURCE_PAGES,
  type PdfRenderSource,
} from "@/lib/pdf/types";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";

function rendererError(caught: unknown, filename: string) {
  if (caught instanceof PdfProcessingError) return caught;

  const message = caught instanceof Error ? caught.message : "";
  const name = caught instanceof Error ? caught.name : "";
  const detail = `${name} ${message}`.toLowerCase();

  if (detail.includes("password") || detail.includes("encrypt")) {
    return new PdfProcessingError(
      "encrypted-pdf",
      `${filename} is password-protected or encrypted. Unlock it before converting.`,
    );
  }
  if (
    detail.includes("invalidpdf") ||
    detail.includes("missingpdf") ||
    detail.includes("invalid pdf") ||
    detail.includes("format error")
  ) {
    return new PdfProcessingError(
      "corrupt-pdf",
      `${filename} could not be opened. It may be corrupt or incomplete.`,
    );
  }
  return new PdfProcessingError(
    "renderer-load-failed",
    `The browser PDF renderer could not open ${filename}.`,
  );
}

export async function loadPdfRendererDocument(file: File) {
  assertPdfRenderingSupport();
  validatePdfFile(file);
  validatePdfTotalSize([file]);

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    return await loadingTask.promise;
  } catch (caught) {
    throw rendererError(caught, file.name);
  }
}

function assertRenderablePageCount(document: PDFDocumentProxy, filename: string) {
  if (document.numPages === 0) {
    throw new PdfProcessingError(
      "empty-document",
      `${filename} does not contain any pages to convert.`,
    );
  }
  if (document.numPages > MAX_PDF_RENDER_SOURCE_PAGES) {
    throw new PdfProcessingError(
      "too-many-source-pages",
      `${filename} has more than ${MAX_PDF_RENDER_SOURCE_PAGES.toLocaleString()} pages. This safety limit helps prevent browser memory exhaustion.`,
    );
  }
}

export async function readRenderablePdfMetadata(
  file: File,
  id: string,
): Promise<PdfRenderSource> {
  const document = await loadPdfRendererDocument(file);
  try {
    assertRenderablePageCount(document, file.name);
    const firstPage = await document.getPage(1);
    try {
      const viewport = firstPage.getViewport({ scale: 1 });
      return {
        id,
        file,
        pageCount: document.numPages,
        firstPageWidth: Math.ceil(viewport.width),
        firstPageHeight: Math.ceil(viewport.height),
      };
    } finally {
      firstPage.cleanup();
    }
  } catch (caught) {
    throw rendererError(caught, file.name);
  } finally {
    await document.destroy();
  }
}

export function assertPdfRendererPageCount(
  document: PDFDocumentProxy,
  filename: string,
) {
  assertRenderablePageCount(document, filename);
}
