import { createImageCanvas } from "@/lib/image/capabilities";
import { ImageProcessingError } from "@/lib/image/errors";
import { loadImageBitmap } from "@/lib/image/load-image";

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new ImageProcessingError(
          "processing-failed",
          "Your browser could not prepare this WebP image for the PDF.",
        ));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

export async function convertWebpToPngBytes(file: File) {
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
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return await canvasToPng(canvas);
  } finally {
    bitmap.close();
  }
}
