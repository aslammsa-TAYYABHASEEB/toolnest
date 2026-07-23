import { assertImageLoadingSupport } from "@/lib/image/capabilities";
import { ImageProcessingError } from "@/lib/image/errors";
import type { ImageMetadata } from "@/lib/image/types";
import { validateImageFile } from "@/lib/image/validation";

export async function loadImageBitmap(file: File) {
  assertImageLoadingSupport();

  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImageProcessingError(
      "decode-failed",
      "This image could not be opened. It may be corrupt or unsupported by your browser.",
    );
  }
}

export async function readImageMetadata(file: File): Promise<ImageMetadata> {
  const format = await validateImageFile(file);
  const bitmap = await loadImageBitmap(file);
  const metadata = {
    file,
    format,
    width: bitmap.width,
    height: bitmap.height,
  };

  bitmap.close();

  if (!metadata.width || !metadata.height) {
    throw new ImageProcessingError(
      "invalid-dimensions",
      "This image has invalid dimensions.",
    );
  }

  return metadata;
}
