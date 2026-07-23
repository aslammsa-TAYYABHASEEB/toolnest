export type PdfDownload = {
  url: string;
  filename: string;
};

export function createPdfDownload(
  blob: Blob,
  filename: string,
): PdfDownload {
  return {
    url: URL.createObjectURL(blob),
    filename,
  };
}

export function revokePdfDownload(download: PdfDownload | null) {
  if (download) URL.revokeObjectURL(download.url);
}
