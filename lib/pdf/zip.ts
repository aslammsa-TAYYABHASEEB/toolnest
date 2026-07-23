import { zip } from "fflate";
import { PdfProcessingError } from "@/lib/pdf/errors";
import type { SplitPdfFile } from "@/lib/pdf/types";

const ZIP_MIME_TYPE = "application/zip";

export async function createPdfZip(files: SplitPdfFile[]) {
  try {
    const entries: Record<string, Uint8Array> = {};
    for (const file of files) {
      entries[file.filename] = new Uint8Array(await file.blob.arrayBuffer());
    }

    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      zip(entries, { level: 0 }, (error, data) => {
        if (error) reject(error);
        else resolve(data);
      });
    });
    const buffer = new Uint8Array(bytes.length);
    buffer.set(bytes);
    return new Blob([buffer.buffer], { type: ZIP_MIME_TYPE });
  } catch {
    throw new PdfProcessingError(
      "zip-failed",
      "The split PDFs were created, but the ZIP download could not be prepared.",
    );
  }
}
