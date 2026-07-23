import { degrees } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeRotatedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  MAX_PDF_ROTATE_OUTPUT_SIZE,
  MAX_PDF_ROTATE_SOURCE_PAGES,
  type PdfPendingRotation,
  type PdfQuarterRotation,
  type PdfRotationResult,
  type PdfRotationSource,
} from "@/lib/pdf/types";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

export function normalizePdfRotation(angle: number): PdfQuarterRotation {
  const normalized = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return normalized as PdfQuarterRotation;
}

export function combinePdfRotations(
  original: PdfQuarterRotation,
  pending: PdfQuarterRotation = 0,
) {
  return normalizePdfRotation(original + pending);
}

export function updatePendingRotations(
  current: PdfPendingRotation,
  pages: number[],
  adjustment: PdfQuarterRotation,
) {
  const next = { ...current };
  for (const pageNumber of pages) {
    const combined = normalizePdfRotation((next[pageNumber] ?? 0) + adjustment);
    if (combined === 0) delete next[pageNumber];
    else next[pageNumber] = combined;
  }
  return next;
}

export function resetPendingRotations(
  current: PdfPendingRotation,
  pages: number[],
) {
  const next = { ...current };
  pages.forEach((pageNumber) => delete next[pageNumber]);
  return next;
}

export function countPendingRotations(pending: PdfPendingRotation) {
  return Object.values(pending).filter((rotation) => rotation !== 0).length;
}

export function getEffectivePdfRotations(
  originals: PdfQuarterRotation[],
  pending: PdfPendingRotation,
) {
  return originals.map((original, index) => (
    combinePdfRotations(original, pending[index + 1] ?? 0)
  ));
}

function assertRotationPageCount(pageCount: number, filename: string) {
  if (pageCount === 0) {
    throw new PdfProcessingError(
      "empty-document",
      `${filename} does not contain any pages to rotate.`,
    );
  }
  if (pageCount > MAX_PDF_ROTATE_SOURCE_PAGES) {
    throw new PdfProcessingError(
      "too-many-source-pages",
      `${filename} has more than ${MAX_PDF_ROTATE_SOURCE_PAGES} pages. This browser safety limit reduces parsing and memory failures.`,
    );
  }
}

export async function readPdfRotationMetadata(
  file: File,
  id: string,
): Promise<PdfRotationSource> {
  validatePdfTotalSize([file]);
  const document = await loadPdfDocument(file);
  const pages = document.getPages();
  assertRotationPageCount(pages.length, file.name);
  return {
    id,
    file,
    pageCount: pages.length,
    originalRotations: pages.map((page) => (
      normalizePdfRotation(page.getRotation().angle)
    )),
  };
}

export async function rotatePdfFile(
  source: PdfRotationSource,
  pending: PdfPendingRotation,
): Promise<PdfRotationResult> {
  const rotatedPageCount = countPendingRotations(pending);
  if (rotatedPageCount === 0) {
    throw new PdfProcessingError(
      "rotation-no-op",
      "Rotate at least one page before creating the output PDF.",
    );
  }

  try {
    const document = await loadPdfDocument(source.file);
    const pages = document.getPages();
    assertRotationPageCount(pages.length, source.file.name);
    if (pages.length !== source.pageCount) {
      throw new PdfProcessingError(
        "rotation-failed",
        "The PDF page count changed while it was being prepared. Select the file again.",
      );
    }

    const effectiveRotations = getEffectivePdfRotations(
      source.originalRotations,
      pending,
    );
    for (const [pageKey, adjustment] of Object.entries(pending)) {
      if (adjustment === 0) continue;
      const pageIndex = Number(pageKey) - 1;
      if (!pages[pageIndex]) {
        throw new PdfProcessingError(
          "page-out-of-range",
          `Page ${pageKey} is outside this document.`,
        );
      }
      pages[pageIndex].setRotation(degrees(effectiveRotations[pageIndex]));
    }

    const saved = await document.save();
    if (saved.byteLength > MAX_PDF_ROTATE_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "rotation-output-too-large",
        `The rotated PDF is larger than ${Math.round(MAX_PDF_ROTATE_OUTPUT_SIZE / 1024 / 1024)} MB and was not prepared for download.`,
      );
    }
    const bytes = new Uint8Array(saved.byteLength);
    bytes.set(saved);
    const blob = new Blob([bytes.buffer], { type: "application/pdf" });
    return {
      blob,
      filename: makeRotatedPdfFilename(source.file.name),
      size: blob.size,
      pageCount: pages.length,
      rotatedPageCount,
      effectiveRotations,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "rotation-failed",
      caught instanceof Error
        ? caught.message
        : "The browser could not create the rotated PDF.",
    );
  }
}
