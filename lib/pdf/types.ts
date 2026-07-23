export const PDF_MIME_TYPE = "application/pdf";
export const MAX_PDF_TOTAL_SIZE = 100 * 1024 * 1024;
export const MIN_PDFS_TO_MERGE = 2;

export type PdfMergeStatus =
  | "idle"
  | "preparing"
  | "ready-to-merge"
  | "merging"
  | "ready"
  | "error";

export type PdfFileMetadata = {
  id: string;
  file: File;
  pageCount: number;
};

export type MergedPdf = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
};

export type PdfMergeOptions = {
  files: PdfFileMetadata[];
  onMerging?: () => void;
};
