import type { QrType } from "@/lib/qr/types";

export type QrDownloadFormat = "png" | "svg";

export function makeQrFilename(type: QrType, format: QrDownloadFormat) {
  return `toolnest-${type}-qr.${format}`;
}
export function downloadQrBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createSvgBlob(svg: string) {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

export function canCopyQrImage() {
  return (
    typeof window !== "undefined"
    && window.isSecureContext
    && typeof navigator.clipboard?.write === "function"
    && typeof ClipboardItem !== "undefined"
  );
}

export async function copyQrPng(blob: Blob) {
  if (!canCopyQrImage()) throw new Error("clipboard-unsupported");
  await navigator.clipboard.write([
    new ClipboardItem({ "image/png": blob }),
  ]);
}
