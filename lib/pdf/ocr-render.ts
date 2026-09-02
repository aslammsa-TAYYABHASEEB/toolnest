import type { PDFPageProxy } from "pdfjs-dist";
import { PdfProcessingError } from "@/lib/pdf/errors";

/**
 * Render a single PDF page to an offscreen canvas for OCR.
 * Separate from render-pages.ts's renderPage()/renderPdfPages() (which other
 * tools depend on) — this returns the raw canvas instead of a blob and does
 * not produce previews.
 */
export async function renderPageToCanvasForOcr(
  page: PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new PdfProcessingError(
      "renderer-unavailable",
      "This browser could not create the canvas needed for OCR.",
    );
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      background: "rgb(255,255,255)",
    }).promise;
    return canvas;
  } catch (caught) {
    canvas.width = 0;
    canvas.height = 0;
    throw new PdfProcessingError(
      "render-failed",
      caught instanceof Error
        ? caught.message
        : "The browser could not render the page for OCR.",
    );
  }
}
