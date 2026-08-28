import { PDFDocument } from "pdf-lib";
import {
  assertPdfBrowserSupport,
  assertPdfRenderingSupport,
} from "@/lib/pdf/capabilities";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeCompressedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  assertPdfRendererPageCount,
  loadPdfRendererDocument,
} from "@/lib/pdf/renderer";
import { estimatePdfRender } from "@/lib/pdf/render-selection";
import {
  COMPRESS_BALANCED_JPEG_QUALITY,
  COMPRESS_BALANCED_SCALE,
  COMPRESS_STRONG_JPEG_QUALITY,
  COMPRESS_STRONG_SCALE,
  MAX_PDF_COMPRESS_OUTPUT_SIZE,
  MAX_PDF_COMPRESS_RASTER_PAGES,
  MAX_PDF_COMPRESS_SOURCE_PAGES,
  PDF_MIME_TYPE,
  type CompressedPdf,
  type CompressionLevel,
} from "@/lib/pdf/types";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";

export type CompressPdfOptions = {
  file: File;
  level: CompressionLevel;
  signal?: AbortSignal;
  onProgress?: (page: number, total: number) => void;
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
      "image/jpeg",
      quality,
    );
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new PdfProcessingError(
      "compress-failed",
      "Compression was cancelled.",
    );
  }
}

function buildResult(
  blob: Blob,
  file: File,
  pageCount: number,
  level: CompressionLevel,
): CompressedPdf {
  const originalSize = file.size;
  const savedBytes = Math.max(0, originalSize - blob.size);
  const hasSavings = blob.size < originalSize;
  return {
    blob,
    filename: makeCompressedPdfFilename(file.name),
    size: blob.size,
    pageCount,
    originalSize,
    savedBytes,
    savedPercentage: hasSavings ? (savedBytes / originalSize) * 100 : 0,
    hasSavings,
    level,
  };
}

// Fixed: Added explicit return type annotation to avoid TypeScript ambiguity
export async function compressPdfFile({
  file,
  level,
  signal,
  onProgress,
}: CompressPdfOptions): Promise<CompressedPdf> {
  if (level === "light") {
    return compressLight(file, signal);
  }
  return compressRasterized(file, level, signal, onProgress);
}

async function compressLight(
  file: File,
  signal?: AbortSignal,
): Promise<CompressedPdf> {
  assertPdfBrowserSupport();
  validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotAborted(signal);

  const pdfDoc = await loadPdfDocument(file);
  try {
    const pageCount = pdfDoc.getPageCount();
    if (pageCount > MAX_PDF_COMPRESS_SOURCE_PAGES) {
      throw new PdfProcessingError(
        "too-many-source-pages",
        `${file.name} has more than ${MAX_PDF_COMPRESS_SOURCE_PAGES.toLocaleString()} pages. This safety limit helps prevent browser memory exhaustion.`,
      );
    }

    assertNotAborted(signal);

    const bytes = await pdfDoc.save({ useObjectStreams: true });
    const outputBuffer = new Uint8Array(bytes.length);
    outputBuffer.set(bytes);
    const blob = new Blob([outputBuffer.buffer], { type: PDF_MIME_TYPE });

    assertNotAborted(signal);

    if (blob.size > MAX_PDF_COMPRESS_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "compression-output-too-large",
        "The compressed PDF is over the 200 MB browser safety limit.",
      );
    }

    return buildResult(blob, file, pageCount, "light");
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "compress-failed",
      "The PDF could not be compressed. Try another file.",
    );
  }
}

async function compressRasterized(
  file: File,
  level: "balanced" | "strong",
  signal?: AbortSignal,
  onProgress?: (page: number, total: number) => void,
): Promise<CompressedPdf> {
  assertPdfRenderingSupport();
  validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotAborted(signal);

  const scale = level === "balanced"
    ? COMPRESS_BALANCED_SCALE
    : COMPRESS_STRONG_SCALE;
  const quality = level === "balanced"
    ? COMPRESS_BALANCED_JPEG_QUALITY
    : COMPRESS_STRONG_JPEG_QUALITY;

  const documentProxy = await loadPdfRendererDocument(file);
  try {
    assertPdfRendererPageCount(documentProxy, file.name);

    const pageCount = documentProxy.numPages;
    if (pageCount > MAX_PDF_COMPRESS_RASTER_PAGES) {
      throw new PdfProcessingError(
        "too-many-source-pages",
        `${file.name} has ${pageCount} pages. Rasterized compression supports up to ${MAX_PDF_COMPRESS_RASTER_PAGES} pages to protect browser memory. Use Structure optimization for larger PDFs.`,
      );
    }

    assertNotAborted(signal);

    const allPages = Array.from({ length: pageCount }, (_, i) => i + 1);
    await estimatePdfRender(documentProxy, allPages, scale);

    assertNotAborted(signal);

    const output = await PDFDocument.create();

    for (let i = 0; i < pageCount; i++) {
      const pageNumber = i + 1;

      assertNotAborted(signal);
      onProgress?.(pageNumber, pageCount);

      const page = await documentProxy.getPage(pageNumber);
      let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
      let aborted = false;
      let canvas: HTMLCanvasElement | null = null;

      const onAbort = () => {
        aborted = true;
        if (renderTask) {
          renderTask.cancel();
        }
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const viewport = page.getViewport({ scale });
        const width = Math.ceil(viewport.width);
        const height = Math.ceil(viewport.height);

        canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new PdfProcessingError(
            "renderer-unavailable",
            "This browser could not create the canvas needed to render a PDF page.",
          );
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "rgb(255,255,255)",
        });

        try {
          await renderTask!.promise;
        } catch {
          if (aborted || signal?.aborted) {
            throw new PdfProcessingError(
              "compress-failed",
              "Compression was cancelled.",
            );
          }
          throw new PdfProcessingError(
            "render-failed",
            "The browser could not finish rendering a page.",
          );
        }

        if (aborted || signal?.aborted) {
          throw new PdfProcessingError(
            "compress-failed",
            "Compression was cancelled.",
          );
        }

        const blob = await canvasToBlob(canvas, quality);
        const imageData = await output.embedJpg(await blob.arrayBuffer());
        const newPage = output.addPage([width, height]);
        newPage.drawImage(imageData, {
          x: 0,
          y: 0,
          width,
          height,
        });
      } finally {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        page.cleanup();
      }
    }

    assertNotAborted(signal);

    const bytes = await output.save({ useObjectStreams: true });
    const outputBuffer = new Uint8Array(bytes.length);
    outputBuffer.set(bytes);
    const blob = new Blob([outputBuffer.buffer], { type: PDF_MIME_TYPE });

    assertNotAborted(signal);

    if (blob.size > MAX_PDF_COMPRESS_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "compression-output-too-large",
        "The compressed PDF is over the 200 MB browser safety limit.",
      );
    }

    return buildResult(blob, file, pageCount, level);
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    if (caught instanceof RangeError) {
      throw new PdfProcessingError(
        "render-failed",
        "Your browser ran out of memory. Try Structure optimization or a smaller PDF.",
      );
    }
    throw new PdfProcessingError(
      "render-failed",
      "The PDF could not be compressed. Try another file.",
    );
  } finally {
    await documentProxy.destroy();
  }
}
