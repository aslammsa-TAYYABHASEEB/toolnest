import type { QRCodeRenderersOptions } from "qrcode";
import type { QrAssets, QrSettings } from "@/lib/qr/types";

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("png-export-failed"));
    }, "image/png");
  });
}
function rendererOptions(settings: QrSettings): QRCodeRenderersOptions {
  return {
    errorCorrectionLevel: settings.errorCorrection,
    margin: settings.margin,
    width: settings.size,
    color: {
      dark: `${settings.foreground}ff`,
      light: `${settings.background}ff`,
    },
  };
}

export async function renderQrCode(
  payload: string,
  settings: QrSettings,
): Promise<QrAssets> {
  const qrCode = await import("qrcode");
  const options = rendererOptions(settings);
  const canvas = document.createElement("canvas");
  const [svg] = await Promise.all([
    qrCode.toString(payload, { ...options, type: "svg" }),
    qrCode.toCanvas(canvas, payload, options),
  ]);
  return { svg, png: await canvasToBlob(canvas) };
}

export function qrProcessingMessage(caught: unknown) {
  const message = caught instanceof Error ? caught.message.toLowerCase() : "";
  if (
    message.includes("amount of data")
    || message.includes("code length overflow")
    || message.includes("too big")
  ) {
    return "QR content is too long for the selected error correction level. Shorten the content or choose a lower level.";
  }
  return "The QR code could not be generated. Check the content and try again.";
}
