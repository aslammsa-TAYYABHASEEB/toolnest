import { StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeWatermarkedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

export const MAX_PDF_WATERMARK_SOURCE_PAGES = 500;
export const MAX_PDF_WATERMARK_OUTPUT_SIZE = 200 * 1024 * 1024;
export const MIN_WATERMARK_FONT_SIZE = 8;
export const MAX_WATERMARK_FONT_SIZE = 120;
export const MAX_WATERMARK_TEXT_LENGTH = 120;

export type PdfWatermarkPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type PdfWatermarkSource = {
  file: File;
  pageCount: number;
};

export type PdfWatermarkOptions = {
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  position: PdfWatermarkPosition;
  pages: number[];
};

export type PdfWatermarkResult = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  watermarkedPageCount: number;
};

type RotatedBounds = {
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
      `${filename} has more than ${MAX_PDF_WATERMARK_SOURCE_PAGES} pages. Select a smaller PDF to protect browser memory.`,
    );
  }
}

function normalizeWatermarkText(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) {
    throw new Error("Enter watermark text before creating the PDF.");
  }
  if (text.length > MAX_WATERMARK_TEXT_LENGTH) {
    throw new Error(
      `Keep watermark text to ${MAX_WATERMARK_TEXT_LENGTH} characters or fewer.`,
    );
  }
  return text;
}

function validateOptions(options: PdfWatermarkOptions, pageCount: number) {
  const text = normalizeWatermarkText(options.text);
  if (
    !Number.isFinite(options.fontSize)
    || options.fontSize < MIN_WATERMARK_FONT_SIZE
    || options.fontSize > MAX_WATERMARK_FONT_SIZE
  ) {
    throw new Error(
      `Choose a font size between ${MIN_WATERMARK_FONT_SIZE} and ${MAX_WATERMARK_FONT_SIZE}.`,
    );
  }
  if (!Number.isFinite(options.opacity) || options.opacity < 0.05 || options.opacity > 1) {
    throw new Error("Choose an opacity between 5% and 100%.");
  }
  if (!Number.isFinite(options.rotation)) {
    throw new Error("Choose a valid watermark angle.");
  }
  if (options.pages.length === 0) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Select at least one page to watermark.",
    );
  }
  const pages = Array.from(new Set(options.pages)).sort((a, b) => a - b);
  if (pages.some((page) => page < 1 || page > pageCount)) {
    throw new PdfProcessingError(
      "page-out-of-range",
      `Choose pages between 1 and ${pageCount}.`,
    );
  }
  return { text, pages };
}

function getRotatedBounds(width: number, height: number, angle: number): RotatedBounds {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const points = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => ({
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getWatermarkOrigin(
  page: PDFPage,
  bounds: RotatedBounds,
  position: PdfWatermarkPosition,
) {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const margin = Math.min(28, Math.max(12, Math.min(pageWidth, pageHeight) * 0.04));
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  if (bounds.width > usableWidth || bounds.height > usableHeight) {
    throw new Error(
      "The watermark is too large for one or more pages at this font size and angle. Shorten the text or reduce the font size.",
    );
  }

  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;
  if (position === "center") {
    return {
      x: centerX - (bounds.minX + bounds.maxX) / 2,
      y: centerY - (bounds.minY + bounds.maxY) / 2,
    };
  }

  if (position === "top-left") {
    return { x: margin - bounds.minX, y: pageHeight - margin - bounds.maxY };
  }
  if (position === "top-right") {
    return { x: pageWidth - margin - bounds.maxX, y: pageHeight - margin - bounds.maxY };
  }
  if (position === "bottom-left") {
    return { x: margin - bounds.minX, y: margin - bounds.minY };
  }
  return { x: pageWidth - margin - bounds.maxX, y: margin - bounds.minY };
}

function measureWatermark(font: PDFFont, text: string, fontSize: number, rotation: number) {
  try {
    const width = font.widthOfTextAtSize(text, fontSize);
    const height = font.heightAtSize(fontSize);
    return getRotatedBounds(width, height, rotation);
  } catch {
    throw new Error(
      "This version supports basic Latin letters, numbers, and common punctuation in watermark text. Remove unsupported characters and try again.",
    );
  }
}

export async function readPdfWatermarkMetadata(file: File): Promise<PdfWatermarkSource> {
  validatePdfTotalSize([file]);
  const document = await loadPdfDocument(file);
  const pageCount = document.getPageCount();
  assertPageCount(pageCount, file.name);
  return { file, pageCount };
}

export async function applyPdfTextWatermark(
  source: PdfWatermarkSource,
  options: PdfWatermarkOptions,
): Promise<PdfWatermarkResult> {
  try {
    const document = await loadPdfDocument(source.file);
    const pages = document.getPages();
    assertPageCount(pages.length, source.file.name);
    if (pages.length !== source.pageCount) {
      throw new Error("The PDF page count changed while it was being prepared. Select the file again.");
    }

    const { text, pages: selectedPages } = validateOptions(options, pages.length);
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bounds = measureWatermark(font, text, options.fontSize, options.rotation);

    for (const pageNumber of selectedPages) {
      const page = pages[pageNumber - 1];
      const origin = getWatermarkOrigin(page, bounds, options.position);
      try {
        page.drawText(text, {
          x: origin.x,
          y: origin.y,
          size: options.fontSize,
          font,
          rotate: degrees(options.rotation),
          opacity: options.opacity,
          color: rgb(0.2, 0.2, 0.2),
        });
      } catch {
        throw new Error(
          "The watermark text could not be drawn. Use basic Latin letters, numbers, and common punctuation and try again.",
        );
      }
    }

    const saved = await document.save();
    if (saved.byteLength > MAX_PDF_WATERMARK_OUTPUT_SIZE) {
      throw new Error(
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
    throw caught instanceof Error
      ? caught
      : new Error("The browser could not create the watermarked PDF.");
  }
}
