export type ImageProcessingErrorCode =
  | "empty-file"
  | "file-too-large"
  | "unsupported-type"
  | "invalid-signature"
  | "type-mismatch"
  | "decode-failed"
  | "invalid-dimensions"
  | "dimensions-too-large"
  | "total-too-large"
  | "too-many-images"
  | "workload-too-large"
  | "browser-unsupported"
  | "canvas-unavailable"
  | "export-unsupported"
  | "processing-failed";

export class ImageProcessingError extends Error {
  constructor(
    public readonly code: ImageProcessingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

export function toImageProcessingError(
  caught: unknown,
  fallbackMessage: string,
): ImageProcessingError {
  if (caught instanceof ImageProcessingError) return caught;
  if (caught instanceof Error) {
    return new ImageProcessingError("processing-failed", caught.message);
  }
  return new ImageProcessingError("processing-failed", fallbackMessage);
}
