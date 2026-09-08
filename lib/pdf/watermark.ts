import { degrees, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeWatermarkedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  MAX_PDF_WATERMARK_OUTPUT_SIZE,
  MAX_PDF_WATERMARK_SOURCE_PAGES,
  type PdfWatermarkOptions,
  type PdfWatermarkPosition,
  type PdfWatermarkResult,
  type PdfWatermarkSource,
} from "@/lib/pdf/types";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

const WATERMARK_MARGIN = 24;
const ALLOWED_ANGLES = new Set([0, 45, -45, 90]);
const ALLOWED_POSITIONS = new Set<PdfWatermarkPosition>([
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

function assertPageCount(pageCount: number, filename: string) {
  if (pageCount === 0) {
    throw new PdfProcessingError(
      "empty-document",
      `${filename} does not contain any pages to watermark.`,
    );
  }
  if (pageCount > MAX_PDF_WATERMARK_SOURCE_PAGES) {
    throw new PdfProcessingError(
      "too-many-source-pages",
      `${filename} has more than ${MAX_PDF_WATERMARK_SOURCE_PAGES.toLocaleString()} pages. This browser safety limit helps prevent memory exhaustion.`,
    );
  }
}

function rotatedBounds(width: number, height: number, angle: number): Bounds {
  const radians = angle * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => ({
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function fittedTextMetrics(
  font: PDFFont,
  text: string,
  requestedSize: number,
  angle: number,
  pageWidth: number,
  pageHeight: number,
) {
  const width = font.widthOfTextAtSize(text, requestedSize);
  const height = font.heightAtSize(requestedSize, { descender: false });
  const initialBounds = rotatedBounds(width, height, angle);
  const availableWidth = Math.max(1, pageWidth - WATERMARK_MARGIN * 2);
  const availableHeight = Math.max(1, pageHeight - WATERMARK_MARGIN * 2);
  const scale = Math.min(
    1,
    availableWidth / Math.max(1, initialBounds.width),
    availableHeight / Math.max(1, initialBounds.height),
  );
  const fontSize = requestedSize * scale;
  const fittedWidth = font.widthOfTextAtSize(text, fontSize);
  const fittedHeight = font.heightAtSize(fontSize, { descender: false });
  return {
    fontSize,
    bounds: rotatedBounds(fittedWidth, fittedHeight, angle),
  };
}

function placement(
  position: PdfWatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  bounds: Bounds,
) {
  const left = WATERMARK_MARGIN - bounds.minX;
  const right = pageWidth - WATERMARK_MARGIN - bounds.maxX;
  const bottom = WATERMARK_MARGIN - bounds.minY;
  const top = pageHeight - WATERMARK_MARGIN - bounds.maxY;
  const centerX = (pageWidth - bounds.width) / 2 - bounds.minX;
  const centerY = (pageHeight - bounds.height) / 2 - bounds.minY;

  switch (position) {
    case "top-left": return { x: left, y: top };
    case "top-right": return { x: right, y: top };
    case "bottom-left": return { x: left, y: bottom };
    case "bottom-right": return { x: right, y: bottom };
    default: return { x: centerX, y: centerY };
  }
}

function validateOptions(options: PdfWatermarkOptions, pageCount: number) {
  if (!options.text.trim()) {
    throw new PdfProcessingError(
      "watermark-empty-text",
      "Enter the text you want to add as a watermark.",
    );
  }
  if (
    !Number.isFinite(options.fontSize)
    || options.fontSize < 12
    || options.fontSize > 144
    || !Number.isFinite(options.opacity)
    || options.opacity < 0.05
    || options.opacity > 1
    || !ALLOWED_ANGLES.has(options.angle)
    || !ALLOWED_POSITIONS.has(options.position)
  ) {
    throw new PdfProcessingError(
      "watermark-invalid-options",
      "Check the watermark size, opacity, angle, and position.",
    );
  }
  if (options.pages.length === 0) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Choose at least one page to watermark.",
    );
  }
  if (options.pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new PdfProcessingError(
      "page-out-of-range",
      `Choose pages between 1 and ${pageCount}.`,
    );
  }
}

export async function readPdfWatermarkMetadata(
  file: File,
  id: string,
): Promise<PdfWatermarkSource> {
  validatePdfTotalSize([file]);
  const document = await loadPdfDocument(file);
  const pageCount = document.getPageCount();
  assertPageCount(pageCount, file.name);
  return { id, file, pageCount };
}

export async function applyPdfWatermark(
  source: PdfWatermarkSource,
  options: PdfWatermarkOptions,
): Promise<PdfWatermarkResult> {
  validateOptions(options, source.pageCount);

  try {
    const document = await loadPdfDocument(source.file);
    const pages = document.getPages();
    assertPageCount(pages.length, source.file.name);
    if (pages.length !== source.pageCount) {
      throw new PdfProcessingError(
        "watermark-failed",
        "The PDF page count changed while it was being prepared. Select the file again.",
      );
    }

    const font = await document.embedFont(StandardFonts.Helvetica);
    const text = options.text.trim();
    try {
      font.encodeText(text);
    } catch {
      throw new PdfProcessingError(
        "watermark-unsupported-text",
        "This version supports common Latin text and punctuation. Remove unsupported characters and try again.",
      );
    }

    const selectedPages = Array.from(new Set(options.pages));
    for (const pageNumber of selectedPages) {
      const page = pages[pageNumber - 1];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      const metrics = fittedTextMetrics(
        font,
        text,
        options.fontSize,
        options.angle,
        pageWidth,
        pageHeight,
      );
      const coordinates = placement(
        options.position,
        pageWidth,
        pageHeight,
        metrics.bounds,
      );
      page.drawText(text, {
        ...coordinates,
        font,
        size: metrics.fontSize,
        rotate: degrees(options.angle),
        opacity: options.opacity,
        color: rgb(0.18, 0.2, 0.24),
      });
    }

    const saved = await document.save();
    if (saved.byteLength > MAX_PDF_WATERMARK_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "watermark-output-too-large",
        `The watermarked PDF is larger than ${Math.round(MAX_PDF_WATERMARK_OUTPUT_SIZE / 1024 / 1024)} MB and was not prepared for download.`,
      );
    }
    const bytes = new Uint8Array(saved.byteLength);
    bytes.set(saved);
    const blob = new Blob([bytes.buffer], { type: "application/pdf" });
    return {
      blob,
      filename: makeWatermarkedPdfFilename(source.file.name),
      size: blob.size,
      pageCount: pages.length,
      watermarkedPageCount: selectedPages.length,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "watermark-failed",
      caught instanceof Error
        ? caught.message
        : "The browser could not create the watermarked PDF.",
    );
  }
}
