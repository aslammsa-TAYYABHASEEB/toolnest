import type { Page, Worker } from "tesseract.js";
import { createBrowserOcrWorker } from "./worker";
import { ocrCanvasSize, prepareOcrImage } from "./image-input";
import { loadImageBitmap } from "@/lib/image/load-image";
import { rotateCanvas } from "@/lib/pdf/ocr-render";

export type ImageOcrProgress = { phase: "preparing" | "reading" | "orientation"; progress?: number };
export type ImageOcrOptions = { rotation: 0 | 90 | 180 | 270; autoRotate: boolean };

/** Keep Tesseract block/paragraph reading order rather than globally sorting
 * lines across columns. Never spell-check or fabricate missing words. */
export function recognizedText(data: Pick<Page, "blocks" | "text">) {
  const paragraphs = (data.blocks ?? []).flatMap(block => block.paragraphs.map(paragraph =>
    paragraph.lines.map(line => line.text.replace(/[\t ]+/g, " ").trim()).filter(Boolean).join("\n"),
  )).filter(Boolean);
  return (paragraphs.length ? paragraphs.join("\n\n") : data.text ?? "").replace(/\r\n?/g, "\n").trim();
}
export function textMetrics(text: string) {
  return { characters: Array.from(text).length, words: (text.match(/\S+/gu) ?? []).length };
}
function score(data: Page) {
  return Math.min((data.text.match(/[A-Za-z]{3,}/g) ?? []).length, 100) * Math.max(0, data.confidence) / 100;
}

export async function extractImageText(file: File, options: ImageOcrOptions, onProgress: (state: ImageOcrProgress) => void, signal?: AbortSignal) {
  const workers: Worker[] = [];
  const canvases: HTMLCanvasElement[] = [];
  const check = () => { if (signal?.aborted) throw new Error("OCR cancelled."); };
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => { cancel = () => { workers.forEach(w => void w.terminate()); reject(new Error("OCR cancelled.")); }; });
  signal?.addEventListener("abort", cancel, { once: true });
  let phase: ImageOcrProgress["phase"] = "preparing";
  const logger = (message: { status: string; progress: number }) => {
    if (signal?.aborted) return;
    onProgress({ phase: message.status === "recognizing text" ? phase : "preparing", progress: Number.isFinite(message.progress) ? Math.max(0, Math.min(1, message.progress)) : undefined });
  };
  const run = async () => {
    check(); onProgress({ phase: "preparing" });
    await prepareOcrImage(file); check();
    const bitmap = await loadImageBitmap(file);
    if (signal?.aborted) { bitmap.close(); check(); }
    const canvas = document.createElement("canvas"); canvases.push(canvas);
    const size = ocrCanvasSize(bitmap.width, bitmap.height);
    canvas.width = size.width; canvas.height = size.height;
    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Your browser could not prepare this image for OCR.");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally { bitmap.close(); }
    check();
    const worker = await createBrowserOcrWorker("eng", logger); workers.push(worker);
    if (signal?.aborted) { await worker.terminate(); check(); }
    const rotate = (degrees: 0 | 90 | 180 | 270) => {
      const result = rotateCanvas(canvas, degrees);
      if (result !== canvas) canvases.push(result);
      return result;
    };
    const read = async (rotation: 0 | 90 | 180 | 270) => {
      check(); onProgress({ phase });
      const image = rotate(rotation);
      try {
        const result = await worker.recognize(image, {}, { blocks: true, text: true });
        check(); return result.data;
      } finally {
        if (image !== canvas) { image.width = 0; image.height = 0; }
      }
    };
    phase = "reading";
    let rotation = options.rotation;
    let best = await read(rotation);
    let orientationWarning = "";
    if (options.autoRotate && options.rotation === 0 && (best.confidence < 70 || score(best) < 3)) {
      phase = "orientation"; onProgress({ phase });
      let candidates: (0 | 90 | 180 | 270)[] = [90, 180, 270];
      try {
        const osd = await createBrowserOcrWorker("osd", logger); workers.push(osd);
        if (signal?.aborted) { await osd.terminate(); check(); }
        const { data } = await osd.detect(canvas);
        const angle = ((Math.round((data.orientation_degrees ?? 0) / 90) * 90 + 360) % 360) as 0 | 90 | 180 | 270;
        if (angle && (data.orientation_confidence ?? 0) >= 5) candidates = [angle, ((angle + 180) % 360) as 0 | 90 | 180 | 270];
      } catch { check(); orientationWarning = "Automatic orientation was uncertain. Use the rotation control if the result looks sideways."; }
      for (const candidate of candidates) {
        const result = await read(candidate);
        if (score(result) > score(best) + 1) { best = result; rotation = candidate; }
      }
    }
    const text = recognizedText(best);
    return { text, rotation, scaled: size.scale !== 1, warning: orientationWarning,
      empty: !/[\p{L}\p{N}]/u.test(text), lowConfidence: best.confidence < 60 };
  };
  try { return await Promise.race([run(), cancelled]); }
  finally {
    signal?.removeEventListener("abort", cancel);
    await Promise.allSettled(workers.map(worker => worker.terminate()));
    canvases.forEach(canvas => { canvas.width = 0; canvas.height = 0; });
  }
}
