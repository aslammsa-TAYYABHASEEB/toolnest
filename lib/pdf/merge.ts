import { PDFDocument } from "pdf-lib";
import { assertPdfBrowserSupport } from "@/lib/pdf/capabilities";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeMergedPdfFilename } from "@/lib/pdf/filenames";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  MIN_PDFS_TO_MERGE,
  PDF_MIME_TYPE,
  type MergedPdf,
  type PdfMergeOptions,
} from "@/lib/pdf/types";
import { validatePdfTotalSize } from "@/lib/pdf/validation";

export async function mergePdfFiles({
  files,
  onMerging,
}: PdfMergeOptions): Promise<MergedPdf> {
  assertPdfBrowserSupport();
  if (files.length < MIN_PDFS_TO_MERGE) {
    throw new PdfProcessingError(
      "not-enough-files",
      "Add at least two PDF files before merging.",
    );
  }
  validatePdfTotalSize(files);

  const sources: PDFDocument[] = [];
  for (const item of files) {
    sources.push(await loadPdfDocument(item.file));
  }

  onMerging?.();

  try {
    const output = await PDFDocument.create();
    let pageCount = 0;

    for (const source of sources) {
      const pageIndexes = source.getPageIndices();
      const pages = await output.copyPages(source, pageIndexes);
      pages.forEach((page) => output.addPage(page));
      pageCount += pages.length;
    }

    const bytes = await output.save({ useObjectStreams: true });
    const outputBuffer = new Uint8Array(bytes.length);
    outputBuffer.set(bytes);
    const blob = new Blob([outputBuffer.buffer], { type: PDF_MIME_TYPE });
    return {
      blob,
      filename: makeMergedPdfFilename(),
      size: blob.size,
      pageCount,
    };
  } catch {
    throw new PdfProcessingError(
      "merge-failed",
      "The PDFs could not be merged. Try removing the file that may be causing the problem.",
    );
  }
}
