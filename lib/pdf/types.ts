export const PDF_MIME_TYPE = "application/pdf";
export const MAX_PDF_TOTAL_SIZE = 100 * 1024 * 1024;
export const MIN_PDFS_TO_MERGE = 2;
export const MAX_PDF_SPLIT_SOURCE_PAGES = 1000;
export const MAX_PDF_SPLIT_OUTPUT_FILES = 200;
export const MAX_PDF_SPLIT_WORK_PAGES = 500;

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

export type PdfSplitMode = "extract" | "every-page" | "ranges";

export type PdfSplitStatus =
  | "idle"
  | "loading"
  | "ready"
  | "splitting"
  | "success"
  | "error";

export type PdfPageGroup = {
  pages: number[];
  filenameLabel: string;
  summary: string;
};

export type SplitPdfFile = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  pages: number[];
};

export type PdfSplitResult = {
  files: SplitPdfFile[];
  pageCount: number;
  totalSize: number;
};
