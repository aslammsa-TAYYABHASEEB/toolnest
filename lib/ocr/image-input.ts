import { validateImageFile } from "@/lib/image/validation";
import { loadImageBitmap } from "@/lib/image/load-image";
import type { ImageFormat } from "@/lib/image/types";

export const OCR_MAX_PIXELS = 24_000_000;
export const OCR_MAX_EDGE = 10_000;
export function assertOcrDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("This image has invalid dimensions.");
  if (width > OCR_MAX_EDGE || height > OCR_MAX_EDGE || width * height > OCR_MAX_PIXELS) throw new Error("Choose an image up to 24 megapixels and 10,000 pixels per side. Resize it before using OCR.");
}

/** Reject oversized containers before asking the browser to decode pixels. */
export function imageHeaderDimensions(bytes: Uint8Array, format: ImageFormat): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "png" && bytes.length >= 24) return [view.getUint32(16), view.getUint32(20)];
  if (format === "jpeg") {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 7) return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      offset += size;
    }
  }
  if (format === "webp" && bytes.length >= 30) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    const u24 = (at: number) => bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16;
    if (kind === "VP8X") return [u24(24) + 1, u24(27) + 1];
    if (kind === "VP8 ") return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (kind === "VP8L" && bytes[20] === 0x2f) return [1 + (view.getUint32(21, true) & 0x3fff), 1 + ((view.getUint32(21, true) >>> 14) & 0x3fff)];
  }
  return null;
}

export async function prepareOcrImage(file: File) {
  const format = await validateImageFile(file);
  const header = imageHeaderDimensions(new Uint8Array(await file.arrayBuffer()), format);
  if (!header) throw new Error("This image header could not be read. Choose a valid JPG, PNG, or WebP image.");
  assertOcrDimensions(...header);
  const bitmap = await loadImageBitmap(file);
  try {
    assertOcrDimensions(bitmap.width, bitmap.height);
    return { file, format, width: bitmap.width, height: bitmap.height };
  } finally { bitmap.close(); }
}

export function ocrCanvasSize(width: number, height: number) {
  assertOcrDimensions(width, height);
  const longEdge = Math.max(width, height);
  const scale = Math.min(longEdge < 1400 ? 2 : 1, 3200 / longEdge, Math.sqrt(8_000_000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
