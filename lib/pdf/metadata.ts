import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfDocument } from "@/lib/pdf/loading";
import {
  MAX_PDF_SPLIT_SOURCE_PAGES,
  type PdfFileMetadata,
} from "@/lib/pdf/types";

export async function readPdfMetadata(
  file: File,
  id: string,
): Promise<PdfFileMetadata> {
  const document = await loadPdfDocument(file);
  try {
    return {
      id,
      file,
      pageCount: document.getPageCount(),
    };
  } catch {
    throw new PdfProcessingError(
      "corrupt-pdf",
      `${file.name} could not be opened. It may be corrupt or incomplete.`,
    );
  }
}

export async function readSplittablePdfMetadata(
  file: File,
  id: string,
): Promise<PdfFileMetadata> {
  const metadata = await readPdfMetadata(file, id);
  if (metadata.pageCount === 0) {
    throw new PdfProcessingError(
      "empty-document",
      `${file.name} does not contain any pages to split.`,
    );
  }
  if (metadata.pageCount > MAX_PDF_SPLIT_SOURCE_PAGES) {
    throw new PdfProcessingError(
      "too-many-source-pages",
      `${file.name} has more than ${MAX_PDF_SPLIT_SOURCE_PAGES.toLocaleString()} pages. This safety limit helps prevent browser memory exhaustion.`,
    );
  }
  return metadata;
}
