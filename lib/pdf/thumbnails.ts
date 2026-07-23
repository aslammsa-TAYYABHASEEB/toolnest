import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import {
  MAX_PDF_ROTATE_SOURCE_PAGES,
  MAX_PDF_ROTATE_THUMBNAIL_PIXELS,
  MAX_PDF_ROTATE_THUMBNAILS,
  type PdfThumbnail,
} from "@/lib/pdf/types";

function thumbnailBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else {
          reject(new PdfProcessingError(
            "thumbnail-failed",
            "The browser could not create a page thumbnail.",
          ));
        }
      },
      "image/jpeg",
      0.76,
    );
  });
}

export async function renderPdfRotationThumbnails(file: File) {
  const documentProxy = await loadPdfRendererDocument(file);
  const thumbnails: PdfThumbnail[] = [];
  try {
    if (documentProxy.numPages > MAX_PDF_ROTATE_SOURCE_PAGES) {
      throw new PdfProcessingError(
        "too-many-source-pages",
        `This PDF exceeds the ${MAX_PDF_ROTATE_SOURCE_PAGES}-page rotation limit.`,
      );
    }
    const previewCount = Math.min(
      documentProxy.numPages,
      MAX_PDF_ROTATE_THUMBNAILS,
    );
    let totalPixels = 0;

    for (let pageNumber = 1; pageNumber <= previewCount; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      try {
        const natural = page.getViewport({ scale: 1 });
        const scale = Math.min(
          0.3,
          150 / natural.width,
          190 / natural.height,
        );
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        totalPixels += width * height;
        if (totalPixels > MAX_PDF_ROTATE_THUMBNAIL_PIXELS) {
          throw new PdfProcessingError(
            "thumbnail-failed",
            "The thumbnail preview exceeded the browser pixel safety limit.",
          );
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new PdfProcessingError(
            "renderer-unavailable",
            "This browser could not create the thumbnail canvas.",
          );
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        try {
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            background: "rgb(255,255,255)",
          }).promise;
          thumbnails.push({
            blob: await thumbnailBlob(canvas),
            pageNumber,
            width,
            height,
          });
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        page.cleanup();
      }
    }
    return thumbnails;
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "thumbnail-failed",
      "The browser could not finish the page thumbnails.",
    );
  } finally {
    await documentProxy.destroy();
  }
}
