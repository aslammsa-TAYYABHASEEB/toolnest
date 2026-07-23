import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfDocument } from "@/lib/pdf/loading";
import type { PdfFileMetadata } from "@/lib/pdf/types";

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
