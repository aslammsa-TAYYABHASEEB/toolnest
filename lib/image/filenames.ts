import { IMAGE_FORMATS, type ImageFormat } from "@/lib/image/types";

export type ImageFilenameSuffix = "converted" | "compressed" | "resized";

export function makeImageFilename(
  filename: string,
  suffix: ImageFilenameSuffix,
  format: ImageFormat,
  detail?: string,
) {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/-(converted|compressed|resized(?:-\d+x\d+)?)$/i, "")
    .trim() || "image";

  return `${base}-${suffix}${detail ? `-${detail}` : ""}.${IMAGE_FORMATS[format].extension}`;
}

export function makeOutputFilename(filename: string, format: ImageFormat) {
  return makeImageFilename(filename, "converted", format);
}

export function makeResizedFilename(
  filename: string,
  width: number,
  height: number,
  format: ImageFormat,
) {
  return makeImageFilename(filename, "resized", format, `${width}x${height}`);
}
