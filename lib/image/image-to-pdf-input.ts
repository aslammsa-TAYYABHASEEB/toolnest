import { ImageProcessingError } from "@/lib/image/errors";
import { readImageMetadata } from "@/lib/image/load-image";
import { createImagePreviewUrl } from "@/lib/image/preview";
import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXEL_AREA,
  MAX_IMAGE_TO_PDF_FILES,
  MAX_IMAGE_TO_PDF_TOTAL_PIXELS,
  MAX_IMAGE_TO_PDF_TOTAL_SIZE,
  type PdfImageItem,
} from "@/lib/image/types";

export function getImageCollectionSize(items: Array<File | PdfImageItem>) {
  return items.reduce(
    (total, item) => total + ("file" in item ? item.file.size : item.size),
    0,
  );
}

export function getImageCollectionPixels(items: PdfImageItem[]) {
  return items.reduce(
    (total, item) => total + item.width * item.height,
    0,
  );
}

export function validateImageCollection(
  current: PdfImageItem[],
  incoming: File[],
) {
  if (current.length + incoming.length > MAX_IMAGE_TO_PDF_FILES) {
    throw new ImageProcessingError(
      "too-many-images",
      `Choose no more than ${MAX_IMAGE_TO_PDF_FILES} images per PDF.`,
    );
  }
  const totalSize = getImageCollectionSize([...current, ...incoming]);
  if (totalSize > MAX_IMAGE_TO_PDF_TOTAL_SIZE) {
    throw new ImageProcessingError(
      "total-too-large",
      "The selected images are over the 100 MB combined limit.",
    );
  }
}

export async function preparePdfImage(
  file: File,
  id: string,
): Promise<PdfImageItem> {
  const metadata = await readImageMetadata(file);
  const pixels = metadata.width * metadata.height;
  if (
    metadata.width > MAX_IMAGE_DIMENSION
    || metadata.height > MAX_IMAGE_DIMENSION
    || pixels > MAX_IMAGE_PIXEL_AREA
  ) {
    throw new ImageProcessingError(
      "dimensions-too-large",
      `Choose images no larger than ${MAX_IMAGE_DIMENSION.toLocaleString()} pixels per side or 64 megapixels each.`,
    );
  }
  return {
    ...metadata,
    id,
    previewUrl: createImagePreviewUrl(file),
  };
}

export function validateDecodedWorkload(items: PdfImageItem[]) {
  const pixels = getImageCollectionPixels(items);
  if (pixels > MAX_IMAGE_TO_PDF_TOTAL_PIXELS) {
    throw new ImageProcessingError(
      "workload-too-large",
      "These images exceed the 160-megapixel combined decoding limit. Remove some large images and try again.",
    );
  }
  return pixels;
}
