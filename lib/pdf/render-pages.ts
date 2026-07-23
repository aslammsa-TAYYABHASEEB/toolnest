import type { PDFPageProxy } from "pdfjs-dist";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makePdfPageImageFilename } from "@/lib/pdf/filenames";
import {
  assertPdfRendererPageCount,
  loadPdfRendererDocument,
} from "@/lib/pdf/renderer";
import { estimatePdfRender } from "@/lib/pdf/render-selection";
import type {
  PdfRenderOptions,
  PdfRenderResult,
  RenderedPdfPage,
} from "@/lib/pdf/types";

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new PdfProcessingError(
            "canvas-export-failed",
            "The browser could not create an image from the rendered page.",
          ));
        }
      },
      type,
      quality,
    );
  });
}

async function createPreviewBlob(canvas: HTMLCanvasElement) {
  const maximumWidth = 240;
  const maximumHeight = 180;
  const previewScale = Math.min(
    maximumWidth / canvas.width,
    maximumHeight / canvas.height,
    1,
  );
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(canvas.width * previewScale));
  preview.height = Math.max(1, Math.round(canvas.height * previewScale));
  const context = preview.getContext("2d");
  if (!context) {
    throw new PdfProcessingError(
      "renderer-unavailable",
      "This browser could not create a preview canvas.",
    );
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, preview.width, preview.height);
  context.drawImage(canvas, 0, 0, preview.width, preview.height);
  try {
    return await canvasToBlob(preview, "image/jpeg", 0.72);
  } finally {
    preview.width = 0;
    preview.height = 0;
  }
}

async function renderPage(
  page: PDFPageProxy,
  pageNumber: number,
  sourceName: string,
  options: PdfRenderOptions,
): Promise<RenderedPdfPage> {
  const viewport = page.getViewport({ scale: options.scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new PdfProcessingError(
      "renderer-unavailable",
      "This browser could not create the canvas needed to render a PDF page.",
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
    const mimeType = options.format === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await canvasToBlob(
      canvas,
      mimeType,
      options.format === "jpeg" ? options.quality : undefined,
    );
    const previewBlob = await createPreviewBlob(canvas);
    return {
      blob,
      previewBlob,
      filename: makePdfPageImageFilename(
        sourceName,
        pageNumber,
        options.format === "jpeg" ? "jpg" : "png",
      ),
      pageNumber,
      width: canvas.width,
      height: canvas.height,
      size: blob.size,
      format: options.format,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function renderPdfPages(
  file: File,
  pages: number[],
  options: PdfRenderOptions,
): Promise<PdfRenderResult> {
  const documentProxy = await loadPdfRendererDocument(file);
  const images: RenderedPdfPage[] = [];
  try {
    assertPdfRendererPageCount(documentProxy, file.name);
    await estimatePdfRender(documentProxy, pages, options.scale);

    for (const pageNumber of pages) {
      const page = await documentProxy.getPage(pageNumber);
      try {
        images.push(await renderPage(page, pageNumber, file.name, options));
      } finally {
        page.cleanup();
      }
    }

    return {
      images,
      pageCount: images.length,
      totalSize: images.reduce((total, image) => total + image.size, 0),
      options,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "render-failed",
      caught instanceof Error
        ? caught.message
        : "The browser could not finish rendering the selected pages.",
    );
  } finally {
    await documentProxy.destroy();
  }
}
