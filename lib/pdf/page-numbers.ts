import { degrees, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makePageNumberedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  MAX_PDF_PAGE_NUMBER_OUTPUT_SIZE,
  MAX_PDF_PAGE_NUMBER_SOURCE_PAGES,
  type PdfPageNumberFormat,
  type PdfPageNumberMargin,
  type PdfPageNumberOptions,
  type PdfPageNumberPosition,
  type PdfPageNumberResult,
  type PdfPageNumberSource,
} from "@/lib/pdf/types";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

export const MIN_PAGE_NUMBER = 1;
export const MAX_PAGE_NUMBER = 1_000_000;
export const MIN_PAGE_NUMBER_FONT_SIZE = 8;
export const MAX_PAGE_NUMBER_FONT_SIZE = 48;
export const MAX_PAGE_NUMBER_AFFIX_LENGTH = 40;

const MARGIN_POINTS: Record<PdfPageNumberMargin, number> = {
  small: 18,
  medium: 36,
  large: 54,
};

const POSITIONS = new Set<PdfPageNumberPosition>([
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

const FORMATS = new Set<PdfPageNumberFormat>([
  "number",
  "page-number",
  "number-of-total",
  "page-number-of-total",
]);

const MARGINS = new Set<PdfPageNumberMargin>(["small", "medium", "large"]);

function assertPageCount(pageCount: number, filename: string) {
  if (pageCount === 0) {
    throw new PdfProcessingError(
      "empty-document",
      `${filename} does not contain any pages to number.`,
    );
  }
  if (pageCount > MAX_PDF_PAGE_NUMBER_SOURCE_PAGES) {
    throw new PdfProcessingError(
      "too-many-source-pages",
      `${filename} has more than ${MAX_PDF_PAGE_NUMBER_SOURCE_PAGES.toLocaleString()} pages. This browser safety limit helps prevent memory exhaustion.`,
    );
  }
}

export function formatPdfPageNumber(
  value: number,
  total: number,
  format: PdfPageNumberFormat,
  prefix = "",
  suffix = "",
) {
  let core: string;
  switch (format) {
    case "page-number":
      core = `Page ${value}`;
      break;
    case "number-of-total":
      core = `${value} of ${total}`;
      break;
    case "page-number-of-total":
      core = `Page ${value} of ${total}`;
      break;
    default:
      core = `${value}`;
  }
  return `${prefix}${core}${suffix}`;
}

function validateOptions(options: PdfPageNumberOptions, pageCount: number) {
  if (
    !POSITIONS.has(options.position)
    || !FORMATS.has(options.format)
    || !MARGINS.has(options.margin)
    || !Number.isInteger(options.startingNumber)
    || options.startingNumber < MIN_PAGE_NUMBER
    || options.startingNumber > MAX_PAGE_NUMBER
    || !Number.isFinite(options.fontSize)
    || options.fontSize < MIN_PAGE_NUMBER_FONT_SIZE
    || options.fontSize > MAX_PAGE_NUMBER_FONT_SIZE
    || options.prefix.length > MAX_PAGE_NUMBER_AFFIX_LENGTH
    || options.suffix.length > MAX_PAGE_NUMBER_AFFIX_LENGTH
  ) {
    throw new PdfProcessingError(
      "page-numbers-invalid-options",
      "Check the position, starting number, font size, margin, format, prefix, and suffix.",
    );
  }
  if (options.pages.length === 0) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Choose at least one page to number.",
    );
  }
  if (options.pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new PdfProcessingError(
      "page-out-of-range",
      `Choose pages between 1 and ${pageCount}.`,
    );
  }
}

function normalizedRotation(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function displayedDimensions(width: number, height: number, rotation: number) {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

function toPageCoordinates(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  rotation: number,
) {
  switch (rotation) {
    case 90: return { x: pageWidth - y, y: x };
    case 180: return { x: pageWidth - x, y: pageHeight - y };
    case 270: return { x: y, y: pageHeight - x };
    default: return { x, y };
  }
}

function displayedPlacement(
  position: PdfPageNumberPosition,
  displayWidth: number,
  displayHeight: number,
  textWidth: number,
  textHeight: number,
  requestedMargin: number,
) {
  const horizontalMargin = Math.min(
    requestedMargin,
    Math.max(2, displayWidth - textWidth - 2),
  );
  const verticalMargin = Math.min(
    requestedMargin,
    Math.max(2, displayHeight - textHeight - 2),
  );
  const x = position.endsWith("left")
    ? horizontalMargin
    : position.endsWith("right")
      ? displayWidth - horizontalMargin - textWidth
      : (displayWidth - textWidth) / 2;
  const y = position.startsWith("top")
    ? displayHeight - verticalMargin - textHeight
    : verticalMargin;
  return { x: Math.max(2, x), y: Math.max(2, y) };
}

function fittedTextMetrics(
  font: PDFFont,
  text: string,
  requestedSize: number,
  displayWidth: number,
) {
  const initialWidth = font.widthOfTextAtSize(text, requestedSize);
  const scale = Math.min(1, Math.max(0.1, (displayWidth - 4) / Math.max(1, initialWidth)));
  const fontSize = requestedSize * scale;
  return {
    fontSize,
    width: font.widthOfTextAtSize(text, fontSize),
    height: font.heightAtSize(fontSize, { descender: false }),
  };
}

export async function readPdfPageNumberMetadata(
  file: File,
  id: string,
): Promise<PdfPageNumberSource> {
  validatePdfTotalSize([file]);
  const document = await loadPdfDocument(file);
  const pageCount = document.getPageCount();
  assertPageCount(pageCount, file.name);
  return { id, file, pageCount };
}

export async function applyPdfPageNumbers(
  source: PdfPageNumberSource,
  options: PdfPageNumberOptions,
): Promise<PdfPageNumberResult> {
  validateOptions(options, source.pageCount);

  try {
    const document = await loadPdfDocument(source.file);
    const pages = document.getPages();
    assertPageCount(pages.length, source.file.name);
    if (pages.length !== source.pageCount) {
      throw new PdfProcessingError(
        "page-numbers-failed",
        "The PDF page count changed while it was being prepared. Select the file again.",
      );
    }

    const font = await document.embedFont(StandardFonts.Helvetica);
    const selectedPages = Array.from(new Set(options.pages)).sort((a, b) => a - b);
    const total = selectedPages.length;

    selectedPages.forEach((pageNumber, sequenceIndex) => {
      const page = pages[pageNumber - 1];
      const value = options.startingNumber + sequenceIndex;
      const text = formatPdfPageNumber(
        value,
        total,
        options.format,
        options.prefix,
        options.suffix,
      );
      try {
        font.encodeText(text);
      } catch {
        throw new PdfProcessingError(
          "page-numbers-unsupported-text",
          "Prefix and suffix support common Latin text and punctuation. Remove unsupported characters and try again.",
        );
      }

      const { width: pageWidth, height: pageHeight } = page.getSize();
      const rotation = normalizedRotation(page.getRotation().angle);
      const display = displayedDimensions(pageWidth, pageHeight, rotation);
      const metrics = fittedTextMetrics(font, text, options.fontSize, display.width);
      const shownAt = displayedPlacement(
        options.position,
        display.width,
        display.height,
        metrics.width,
        metrics.height,
        MARGIN_POINTS[options.margin],
      );
      const coordinates = toPageCoordinates(
        shownAt.x,
        shownAt.y,
        pageWidth,
        pageHeight,
        rotation,
      );

      page.drawText(text, {
        ...coordinates,
        font,
        size: metrics.fontSize,
        rotate: degrees(rotation),
        color: rgb(0.15, 0.17, 0.2),
      });
    });

    const saved = await document.save();
    if (saved.byteLength > MAX_PDF_PAGE_NUMBER_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "page-numbers-output-too-large",
        `The numbered PDF is larger than ${Math.round(MAX_PDF_PAGE_NUMBER_OUTPUT_SIZE / 1024 / 1024)} MB and was not prepared for download.`,
      );
    }
    const bytes = new Uint8Array(saved.byteLength);
    bytes.set(saved);
    const blob = new Blob([bytes.buffer], { type: "application/pdf" });
    return {
      blob,
      filename: makePageNumberedPdfFilename(source.file.name),
      size: blob.size,
      pageCount: pages.length,
      numberedPageCount: selectedPages.length,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "page-numbers-failed",
      caught instanceof Error
        ? caught.message
        : "The browser could not create the numbered PDF.",
    );
  }
}
