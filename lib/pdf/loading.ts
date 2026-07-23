import { PDFDocument } from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { validatePdfFile } from "@/lib/pdf/validation";

export async function loadPdfDocument(file: File) {
  await validatePdfFile(file);

  try {
    const bytes = await file.arrayBuffer();
    return await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message.toLowerCase() : "";
    if (message.includes("encrypt")) {
      throw new PdfProcessingError(
        "encrypted-pdf",
        `${file.name} is password-protected or encrypted and cannot be merged.`,
      );
    }
    throw new PdfProcessingError(
      "corrupt-pdf",
      `${file.name} could not be opened. It may be corrupt or incomplete.`,
    );
  }
}
