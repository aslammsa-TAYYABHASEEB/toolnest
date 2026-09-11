import type { LoggerMessage, Worker } from "tesseract.js";

/** Shared worker/core/model configuration. Image contents stay in the worker;
 * only language assets are fetched from Tesseract's default CDN. */
export async function createBrowserOcrWorker(
  language: "eng" | "osd",
  logger: (message: Pick<LoggerMessage, "status" | "progress">) => void,
): Promise<Worker> {
  const { createWorker } = await import("tesseract.js");
  return new Promise<Worker>((resolve, reject) => {
    let finished = false;
    const fail = () => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      reject(new Error("OCR engine or language data could not load. Check your connection and retry."));
    };
    const timer = setTimeout(fail, 120_000);
    void createWorker(language, language === "osd" ? 0 : 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      ...(language === "osd" ? { legacyCore: true } : {}),
      logger,
      // The library otherwise throws worker errors outside the caller's promise.
      errorHandler: fail,
    }).then(worker => {
      clearTimeout(timer);
      if (finished) { void worker.terminate(); return; }
      finished = true; resolve(worker);
    }, fail);
  });
}
