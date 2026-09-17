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
      intent: "print",
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

/**
 * Return a canvas rotated clockwise by 0/90/180/270 degrees.
 * When degrees is 0, the same canvas is returned unchanged; otherwise a new
 * canvas is created (the caller is responsible for releasing both).
 */
export function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: 0 | 90 | 180 | 270,
): HTMLCanvasElement {
  if (degrees === 0) return source;
  const rotated = document.createElement("canvas");
  const swap = degrees === 90 || degrees === 270;
  rotated.width = swap ? source.height : source.width;
  rotated.height = swap ? source.width : source.height;
  const context = rotated.getContext("2d", { alpha: false });
  if (!context) {
    throw new PdfProcessingError(
      "renderer-unavailable",
      "This browser could not create the canvas needed for OCR.",
    );
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, rotated.width, rotated.height);
  context.save();
  context.translate(rotated.width / 2, rotated.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  context.restore();
  return rotated;
}

/**
 * Build a smaller copy used only for Tesseract orientation/script detection.
 * OCR recognition continues to use the original full-resolution render. OSD
 * needs page-level line direction rather than glyph detail, so bounding this
 * probe avoids encoding and analyzing millions of unnecessary pixels.
 */
export function createOrientationProbeCanvas(
  source: HTMLCanvasElement,
  targetLongEdge = 1400,
): HTMLCanvasElement {
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= targetLongEdge) return source;
  const scale = targetLongEdge / longEdge;
  const probe = document.createElement("canvas");
  probe.width = Math.max(1, Math.round(source.width * scale));
  probe.height = Math.max(1, Math.round(source.height * scale));
  const context = probe.getContext("2d", { alpha: false });
  if (!context) {
    probe.width = 0;
    probe.height = 0;
    throw new PdfProcessingError(
      "renderer-unavailable",
      "This browser could not create the canvas needed for OCR orientation detection.",
    );
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, probe.width, probe.height);
  context.drawImage(source, 0, 0, probe.width, probe.height);
  return probe;
}

