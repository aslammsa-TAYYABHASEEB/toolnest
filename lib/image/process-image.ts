import {
  IMAGE_FORMATS,
  MAX_IMAGE_FILE_SIZE,
  type CompressedImage,
  type CompressionOptions,
  type ConversionOptions,
  type ConvertedImage,
  type ImageFormat,
  type ImageMetadata,
} from "@/lib/image/types";

const SUPPORTED_MIME_TYPES = new Set<string>([...Object.values(IMAGE_FORMATS).map(({ mimeType }) => mimeType), "image/jpg"]);

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 || value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export function makeOutputFilename(filename: string, format: ImageFormat) {
  return makeImageFilename(filename, "converted", format);
}

export function makeImageFilename(filename: string, suffix: "converted" | "compressed", format: ImageFormat) {
  const base = filename.replace(/\.[^.]+$/, "").replace(/-(converted|compressed)$/i, "").trim() || "image";
  return `${base}-${suffix}.${IMAGE_FORMATS[format].extension}`;
}

function detectSignature(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

export async function validateImageFile(file: File): Promise<ImageFormat> {
  if (file.size > MAX_IMAGE_FILE_SIZE) throw new Error("This image is larger than the 20 MB limit. Choose a smaller file.");
  if (file.size === 0) throw new Error("This file is empty. Choose a valid JPG, PNG, or WebP image.");
  if (file.type && !SUPPORTED_MIME_TYPES.has(file.type)) throw new Error("Unsupported file type. Choose a JPG, PNG, or WebP image.");

  const signature = detectSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!signature) throw new Error("This file is not a valid JPG, PNG, or WebP image.");
  const claimedTypeMatches = file.type === IMAGE_FORMATS[signature].mimeType || (signature === "jpeg" && file.type === "image/jpg");
  if (file.type && !claimedTypeMatches) throw new Error("The file content does not match its image type.");
  return signature;
}

async function decodeImage(file: File) {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be opened. It may be corrupt or unsupported by your browser.");
  }
}

export async function readImageMetadata(file: File): Promise<ImageMetadata> {
  const format = await validateImageFile(file);
  const bitmap = await decodeImage(file);
  const metadata = { file, format, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (!metadata.width || !metadata.height) throw new Error("This image has invalid dimensions.");
  return metadata;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Your browser could not create the converted image.")),
      mimeType,
      quality,
    );
  });
}

async function encodeImage(file: File, format: ImageFormat, quality?: number) {
  await validateImageFile(file);
  const bitmap = await decodeImage(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is not available in this browser.");

    if (format === "jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0);

    const target = IMAGE_FORMATS[format];
    const blob = await canvasToBlob(canvas, target.mimeType, target.supportsQuality ? quality : undefined);
    if (blob.type !== target.mimeType) throw new Error(`${target.label} export is not supported by this browser.`);

    return { blob, width: bitmap.width, height: bitmap.height };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("The image could not be converted. Please try another file.");
  } finally {
    bitmap.close();
  }
}

export async function convertImage({ file, format, quality = 0.9 }: ConversionOptions): Promise<ConvertedImage> {
  const encoded = await encodeImage(file, format, quality);
  return { ...encoded, format, filename: makeOutputFilename(file.name, format) };
}

export async function compressImage({ file, format, quality }: CompressionOptions): Promise<CompressedImage> {
  const encoded = await encodeImage(file, format, quality);
  const savedBytes = Math.max(0, file.size - encoded.blob.size);
  const hasSavings = encoded.blob.size < file.size;

  return {
    ...encoded,
    blob: encoded.blob,
    format,
    filename: makeImageFilename(file.name, "compressed", format),
    originalSize: file.size,
    compressedSize: encoded.blob.size,
    savedBytes,
    savedPercentage: hasSavings ? (savedBytes / file.size) * 100 : 0,
    hasSavings,
  };
}
