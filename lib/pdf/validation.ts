import { PdfProcessingError } from "@/lib/pdf/errors";
import {
  MAX_PDF_TOTAL_SIZE,
  PDF_MIME_TYPE,
  type PdfFileMetadata,
} from "@/lib/pdf/types";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function formatPdfBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 || value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export function getPdfTotalSize(
  files: Array<File | PdfFileMetadata>,
) {
  return files.reduce(
    (total, item) => total + ("file" in item ? item.file.size : item.size),
    0,
  );
}

export function validatePdfTotalSize(
  files: Array<File | PdfFileMetadata>,
) {
  const totalSize = getPdfTotalSize(files);
  if (totalSize > MAX_PDF_TOTAL_SIZE) {
    throw new PdfProcessingError(
      "total-too-large",
      `The combined PDF size is over the ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} limit. Remove one or more files and try again.`,
    );
  }
  return totalSize;
}

export async function validatePdfFile(file: File) {
  if (file.size === 0) {
    throw new PdfProcessingError(
      "empty-file",
      `${file.name || "This file"} is empty.`,
    );
  }

  const hasPdfExtension = /\.pdf$/i.test(file.name);
  const hasAllowedType = file.type === "" || file.type === PDF_MIME_TYPE;
  if (!hasPdfExtension || !hasAllowedType) {
    throw new PdfProcessingError(
      "unsupported-type",
      `${file.name || "This file"} is not a PDF. Choose files ending in .pdf.`,
    );
  }

  const header = new Uint8Array(
    await file.slice(0, Math.min(file.size, 1024)).arrayBuffer(),
  );
  const signatureIndex = header.findIndex((byte, index) => (
    PDF_SIGNATURE.every((signatureByte, offset) => (
      header[index + offset] === signatureByte
    ))
  ));

  if (signatureIndex === -1) {
    throw new PdfProcessingError(
      "invalid-signature",
      `${file.name} does not contain a valid PDF header.`,
    );
  }
}
