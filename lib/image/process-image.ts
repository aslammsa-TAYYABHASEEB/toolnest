import { createImageCanvas } from "@/lib/image/capabilities";
import { ImageProcessingError } from "@/lib/image/errors";
import {
  makeImageFilename,
  makeOutputFilename,
} from "@/lib/image/filenames";
import { loadImageBitmap } from "@/lib/image/load-image";
import {
  IMAGE_FORMATS,
  type CompressedImage,
  type CompressionOptions,
  type ConversionOptions,
  type ConvertedImage,
  type ImageFormat,
} from "@/lib/image/types";
import { validateImageFile } from "@/lib/image/validation";

export { makeImageFilename, makeOutputFilename } from "@/lib/image/filenames";
export { readImageMetadata } from "@/lib/image/load-image";
export { validateImageFile } from "@/lib/image/validation";

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 || value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new ImageProcessingError(
          "processing-failed",
          "Your browser could not create the converted image.",
        )),
      mimeType,
      quality,
    );
  });
}

async function encodeImage(
  file: File,
  format: ImageFormat,
  quality?: number,
) {
  await validateImageFile(file);
  const bitmap = await loadImageBitmap(file);

  try {
    const canvas = createImageCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new ImageProcessingError(
        "canvas-unavailable",
        "Image processing is not available in this browser.",
      );
    }

    if (format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(bitmap, 0, 0);

    const target = IMAGE_FORMATS[format];
    const blob = await canvasToBlob(
      canvas,
      target.mimeType,
      target.supportsQuality ? quality : undefined,
    );

    if (blob.type !== target.mimeType) {
      throw new ImageProcessingError(
        "export-unsupported",
        `${target.label} export is not supported by this browser.`,
      );
    }

    return { blob, width: bitmap.width, height: bitmap.height };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new ImageProcessingError(
      "processing-failed",
      "The image could not be converted. Please try another file.",
    );
  } finally {
    bitmap.close();
  }
}

export async function convertImage({
  file,
  format,
  quality = 0.9,
}: ConversionOptions): Promise<ConvertedImage> {
  const encoded = await encodeImage(file, format, quality);
  return {
    ...encoded,
    format,
    filename: makeOutputFilename(file.name, format),
    originalSize: file.size,
    outputSize: encoded.blob.size,
  };
}

export async function compressImage({
  file,
  format,
  quality,
}: CompressionOptions): Promise<CompressedImage> {
  const encoded = await encodeImage(file, format, quality);
  const savedBytes = Math.max(0, file.size - encoded.blob.size);
  const hasSavings = encoded.blob.size < file.size;

  return {
    ...encoded,
    format,
    filename: makeImageFilename(file.name, "compressed", format),
    originalSize: file.size,
    outputSize: encoded.blob.size,
    compressedSize: encoded.blob.size,
    savedBytes,
    savedPercentage: hasSavings ? (savedBytes / file.size) * 100 : 0,
    hasSavings,
  };
}
