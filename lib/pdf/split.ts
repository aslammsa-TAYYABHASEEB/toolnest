import { PDFDocument } from "pdf-lib";
import { assertPdfBrowserSupport } from "@/lib/pdf/capabilities";
import { PdfProcessingError } from "@/lib/pdf/errors";
import {
  makeExtractedPdfFilename,
  makeRangePdfFilename,
  makeSinglePagePdfFilename,
} from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  PDF_MIME_TYPE,
  type PdfPageGroup,
  type PdfSplitMode,
  type PdfSplitResult,
  type SplitPdfFile,
} from "@/lib/pdf/types";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

function filenameForGroup(
  sourceName: string,
  mode: PdfSplitMode,
  group: PdfPageGroup,
) {
  if (mode === "every-page") {
    return makeSinglePagePdfFilename(sourceName, group.pages[0]);
  }
  if (mode === "ranges") {
    return makeRangePdfFilename(sourceName, group.filenameLabel);
  }
  return makeExtractedPdfFilename(sourceName, group.filenameLabel);
}

export async function splitPdfFile(
  file: File,
  mode: PdfSplitMode,
  groups: PdfPageGroup[],
): Promise<PdfSplitResult> {
  assertPdfBrowserSupport();
  validatePdfTotalSize([file]);
  if (groups.length === 0 || groups.some((group) => group.pages.length === 0)) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Choose at least one valid page before splitting.",
    );
  }

  try {
    const source = await loadPdfDocument(file);
    const sourcePageCount = source.getPageCount();
    const files: SplitPdfFile[] = [];

    for (const group of groups) {
      if (group.pages.some((page) => page < 1 || page > sourcePageCount)) {
        throw new PdfProcessingError(
          "page-out-of-range",
          `Choose pages between 1 and ${sourcePageCount}.`,
        );
      }
      const output = await PDFDocument.create();
      const copied = await output.copyPages(
        source,
        group.pages.map((page) => page - 1),
      );
      copied.forEach((page) => output.addPage(page));
      const bytes = await output.save({ useObjectStreams: true });
      const buffer = new Uint8Array(bytes.length);
      buffer.set(bytes);
      const blob = new Blob([buffer.buffer], { type: PDF_MIME_TYPE });
      files.push({
        blob,
        filename: filenameForGroup(file.name, mode, group),
        size: blob.size,
        pageCount: group.pages.length,
        pages: group.pages,
      });
    }

    return {
      files,
      pageCount: files.reduce((total, output) => total + output.pageCount, 0),
      totalSize: files.reduce((total, output) => total + output.size, 0),
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    if (caught instanceof RangeError) {
      throw new PdfProcessingError(
        "split-failed",
        "Your browser ran out of memory while splitting this PDF. Try fewer pages or a smaller document.",
      );
    }
    throw new PdfProcessingError(
      "split-failed",
      "The PDF could not be split. It may contain an unsupported or unusually complex structure.",
    );
  }
}
