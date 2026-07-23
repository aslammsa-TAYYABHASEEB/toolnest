import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { parsePageSelection } from "@/lib/pdf/page-selection";
import {
  MAX_PDF_RENDER_DIMENSION,
  MAX_PDF_RENDER_MEMORY,
  MAX_PDF_RENDER_OUTPUTS,
  MAX_PDF_RENDER_TOTAL_PIXELS,
  type PdfPageSelectionMode,
  type PdfRenderEstimate,
  type PdfRenderScale,
} from "@/lib/pdf/types";

export function createPdfRenderPageSelection(
  mode: PdfPageSelectionMode,
  expression: string,
  pageCount: number,
) {
  const pages = mode === "all"
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : parsePageSelection(expression, pageCount).pages;

  if (pages.length > MAX_PDF_RENDER_OUTPUTS) {
    throw new PdfProcessingError(
      "too-many-output-files",
      `Convert no more than ${MAX_PDF_RENDER_OUTPUTS} pages at once to protect browser memory.`,
    );
  }
  return pages;
}

export async function estimatePdfRender(
  document: PDFDocumentProxy,
  pages: number[],
  scale: PdfRenderScale,
): Promise<PdfRenderEstimate> {
  const dimensions: PdfRenderEstimate["dimensions"] = [];
  let totalPixels = 0;

  for (const pageNumber of pages) {
    const page = await document.getPage(pageNumber);
    try {
      const viewport = page.getViewport({ scale });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      if (width > MAX_PDF_RENDER_DIMENSION || height > MAX_PDF_RENDER_DIMENSION) {
        throw new PdfProcessingError(
          "render-dimension-too-large",
          `Page ${pageNumber} would be ${width.toLocaleString()} × ${height.toLocaleString()} pixels. Lower the scale so neither dimension exceeds ${MAX_PDF_RENDER_DIMENSION.toLocaleString()} pixels.`,
        );
      }
      totalPixels += width * height;
      dimensions.push({ pageNumber, width, height });
    } finally {
      page.cleanup();
    }
  }

  const estimatedMemory = totalPixels * 4;
  if (
    totalPixels > MAX_PDF_RENDER_TOTAL_PIXELS ||
    estimatedMemory > MAX_PDF_RENDER_MEMORY
  ) {
    throw new PdfProcessingError(
      "render-workload-too-large",
      `This selection is estimated to need ${Math.ceil(estimatedMemory / 1024 / 1024)} MB of canvas memory. Select fewer pages or use a lower scale.`,
    );
  }

  return { pages, dimensions, totalPixels, estimatedMemory };
}
