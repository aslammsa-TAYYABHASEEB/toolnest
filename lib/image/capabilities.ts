import { ImageProcessingError } from "@/lib/image/errors";

export type ImageBrowserCapabilities = {
  canCreateImageBitmap: boolean;
  canCreateCanvas: boolean;
  canExportCanvas: boolean;
};

export function getImageBrowserCapabilities(): ImageBrowserCapabilities {
  const canCreateCanvas = typeof document !== "undefined"
    && typeof document.createElement === "function";
  const canvas = canCreateCanvas ? document.createElement("canvas") : null;

  return {
    canCreateImageBitmap: typeof createImageBitmap === "function",
    canCreateCanvas,
    canExportCanvas: typeof canvas?.toBlob === "function",
  };
}

export function assertImageLoadingSupport() {
  if (!getImageBrowserCapabilities().canCreateImageBitmap) {
    throw new ImageProcessingError(
      "browser-unsupported",
      "Image processing is not available in this browser.",
    );
  }
}

export function createImageCanvas(width: number, height: number) {
  const capabilities = getImageBrowserCapabilities();
  if (!capabilities.canCreateCanvas || !capabilities.canExportCanvas) {
    throw new ImageProcessingError(
      "browser-unsupported",
      "Image processing is not available in this browser.",
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
