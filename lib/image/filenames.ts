import { IMAGE_FORMATS, type ImageFormat } from "@/lib/image/types";

export type ImageFilenameSuffix = "converted" | "compressed";

export function makeImageFilename(
  filename: string,
  suffix: ImageFilenameSuffix,
  format: ImageFormat,
) {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/-(converted|compressed)$/i, "")
    .trim() || "image";

  return `${base}-${suffix}.${IMAGE_FORMATS[format].extension}`;
}

export function makeOutputFilename(filename: string, format: ImageFormat) {
  return makeImageFilename(filename, "converted", format);
}
