export type PdfProcessingErrorCode =
  | "browser-unsupported"
  | "empty-file"
  | "unsupported-type"
  | "invalid-signature"
  | "corrupt-pdf"
  | "encrypted-pdf"
  | "total-too-large"
  | "not-enough-files"
  | "merge-failed"
  | "empty-document"
  | "too-many-source-pages"
  | "invalid-page-selection"
  | "page-out-of-range"
  | "overlapping-ranges"
  | "too-many-output-files"
  | "workload-too-large"
  | "split-failed"
  | "zip-failed";

export class PdfProcessingError extends Error {
  constructor(
    public readonly code: PdfProcessingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfProcessingError";
  }
}

export function toPdfProcessingError(
  caught: unknown,
  fallbackMessage: string,
) {
  if (caught instanceof PdfProcessingError) return caught;
  if (caught instanceof Error) {
    return new PdfProcessingError("merge-failed", caught.message);
  }
  return new PdfProcessingError("merge-failed", fallbackMessage);
}
