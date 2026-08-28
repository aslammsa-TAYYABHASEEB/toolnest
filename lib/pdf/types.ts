export const PDF_MIME_TYPE = "application/pdf";
export const MAX_PDF_TOTAL_SIZE = 100 * 1024 * 1024;
export const MIN_PDFS_TO_MERGE = 2;
export const MAX_PDF_SPLIT_SOURCE_PAGES = 1000;
export const MAX_PDF_SPLIT_OUTPUT_FILES = 200;
export const MAX_PDF_SPLIT_WORK_PAGES = 500;
export const MAX_IMAGE_PDF_OUTPUT_SIZE = 200 * 1024 * 1024;
export const MAX_PDF_RENDER_SOURCE_PAGES = 1000;
export const MAX_PDF_RENDER_OUTPUTS = 100;
export const MAX_PDF_RENDER_DIMENSION = 8192;
export const MAX_PDF_RENDER_TOTAL_PIXELS = 120 * 1024 * 1024;
export const MAX_PDF_RENDER_MEMORY = 512 * 1024 * 1024;
export const MAX_PDF_ROTATE_SOURCE_PAGES = 500;
export const MAX_PDF_ROTATE_THUMBNAILS = 40;
export const MAX_PDF_ROTATE_THUMBNAIL_PIXELS = 6 * 1024 * 1024;
export const MAX_PDF_ROTATE_OUTPUT_SIZE = 200 * 1024 * 1024;

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

export type ImagePdfPageSize = "auto" | "a4" | "letter" | "legal";
export type ImagePdfOrientation = "auto" | "portrait" | "landscape";
export type ImagePdfFit = "fit" | "fill" | "original";
export type ImagePdfMargin = "none" | "small" | "medium" | "large";
export type ImagePdfBackground = "white" | "light-gray" | "black";

export type ImagePdfOptions = {
  pageSize: ImagePdfPageSize;
  orientation: ImagePdfOrientation;
  fit: ImagePdfFit;
  margin: ImagePdfMargin;
  background: ImagePdfBackground;
};

export type ImagePdfResult = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  imageCount: number;
  options: ImagePdfOptions;
};

export type PdfImageFormat = "jpeg" | "png";
export type PdfRenderScale = 1 | 1.5 | 2 | 3;
export type PdfPageSelectionMode = "all" | "selected" | "range";

export type PdfRenderOptions = {
  format: PdfImageFormat;
  quality: number;
  scale: PdfRenderScale;
};

export type PdfRenderSource = PdfFileMetadata & {
  firstPageWidth: number;
  firstPageHeight: number;
};

export type RenderedPdfPage = {
  blob: Blob;
  previewBlob: Blob;
  filename: string;
  pageNumber: number;
  width: number;
  height: number;
  size: number;
  format: PdfImageFormat;
};

export type PdfRenderResult = {
  images: RenderedPdfPage[];
  totalSize: number;
  pageCount: number;
  options: PdfRenderOptions;
};

export type PdfRenderEstimate = {
  pages: number[];
  dimensions: Array<{ pageNumber: number; width: number; height: number }>;
  totalPixels: number;
  estimatedMemory: number;
};

export type PdfQuarterRotation = 0 | 90 | 180 | 270;
export type PdfPendingRotation = Record<number, PdfQuarterRotation>;

export type PdfRotationSource = PdfFileMetadata & {
  originalRotations: PdfQuarterRotation[];
};

export type PdfThumbnail = {
  blob: Blob;
  pageNumber: number;
  width: number;
  height: number;
};

export type PdfRotationResult = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  rotatedPageCount: number;
  effectiveRotations: PdfQuarterRotation[];
};

export type CompressionLevel = "light" | "balanced" | "strong";

export type CompressedPdf = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  originalSize: number;
  savedBytes: number;
  savedPercentage: number;
  hasSavings: boolean;
  level: CompressionLevel;
};

// Compress PDF constants
export const MAX_PDF_COMPRESS_SOURCE_PAGES = 1000;
export const MAX_PDF_COMPRESS_RASTER_PAGES = 100;
export const MAX_PDF_COMPRESS_OUTPUT_SIZE = 200 * 1024 * 1024;

// Rasterized mode render presets (tunable after QA)
export const COMPRESS_BALANCED_SCALE = 1.5;
export const COMPRESS_BALANCED_JPEG_QUALITY = 0.80;
export const COMPRESS_STRONG_SCALE = 1.0;
export const COMPRESS_STRONG_JPEG_QUALITY = 0.60;
