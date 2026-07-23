import { PdfProcessingError } from "@/lib/pdf/errors";

export type PdfBrowserCapabilities = {
  canReadFiles: boolean;
  canCreateDownloads: boolean;
  canCreateTypedArrays: boolean;
};

export function getPdfBrowserCapabilities(): PdfBrowserCapabilities {
  return {
    canReadFiles: typeof File !== "undefined"
      && typeof Blob !== "undefined"
      && typeof Blob.prototype.arrayBuffer === "function",
    canCreateDownloads: typeof URL !== "undefined"
      && typeof URL.createObjectURL === "function"
      && typeof URL.revokeObjectURL === "function",
    canCreateTypedArrays: typeof Uint8Array !== "undefined",
  };
}

export function assertPdfBrowserSupport() {
  const capabilities = getPdfBrowserCapabilities();
  if (
    !capabilities.canReadFiles
    || !capabilities.canCreateDownloads
    || !capabilities.canCreateTypedArrays
  ) {
    throw new PdfProcessingError(
      "browser-unsupported",
      "PDF processing is not available in this browser.",
    );
  }
}
