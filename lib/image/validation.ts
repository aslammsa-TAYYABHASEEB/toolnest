import { ImageProcessingError } from "@/lib/image/errors";
import {
  IMAGE_FORMATS,
  MAX_IMAGE_FILE_SIZE,
  type ImageFormat,
} from "@/lib/image/types";

const SUPPORTED_MIME_TYPES = new Set<string>([
  ...Object.values(IMAGE_FORMATS).map(({ mimeType }) => mimeType),
  "image/jpg",
]);

function detectSignature(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
  ) return "jpeg";

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "png";

  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "webp";

  return null;
}

export async function validateImageFile(file: File): Promise<ImageFormat> {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new ImageProcessingError(
      "file-too-large",
      "This image is larger than the 20 MB limit. Choose a smaller file.",
    );
  }

  if (file.size === 0) {
    throw new ImageProcessingError(
      "empty-file",
      "This file is empty. Choose a valid JPG, PNG, or WebP image.",
    );
  }

  if (file.type && !SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new ImageProcessingError(
      "unsupported-type",
      "Unsupported file type. Choose a JPG, PNG, or WebP image.",
    );
  }

  const signature = detectSignature(
    new Uint8Array(await file.slice(0, 16).arrayBuffer()),
  );

  if (!signature) {
    throw new ImageProcessingError(
      "invalid-signature",
      "This file is not a valid JPG, PNG, or WebP image.",
    );
  }

  const claimedTypeMatches =
    file.type === IMAGE_FORMATS[signature].mimeType
    || (signature === "jpeg" && file.type === "image/jpg");

  if (file.type && !claimedTypeMatches) {
    throw new ImageProcessingError(
      "type-mismatch",
      "The file content does not match its image type.",
    );
  }

  return signature;
}
