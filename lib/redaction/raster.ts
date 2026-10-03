import type { PDFPageProxy } from "pdfjs-dist";
import { REDACTION_SCALE, assertRedactionCurrent, type RedactionContext } from "./types";
import { redactionPageGeometry } from "./geometry";

/** Same display raster contract as the approved spike. Annotations are intentionally omitted. */
export async function renderRedactionPage(page: PDFPageProxy, context: RedactionContext = {}) {
  assertRedactionCurrent(context);
  const points = page.getViewport({ scale: 1 });
  const geometry = redactionPageGeometry(page.pageNumber, points.width, points.height, page.rotate);
  const viewport = page.getViewport({ scale: REDACTION_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = geometry.pixelWidth; canvas.height = geometry.pixelHeight;
  const drawing = canvas.getContext("2d", { willReadFrequently: true });
  if (!drawing) { canvas.width = 0; canvas.height = 0; throw new Error("The PDF page canvas could not be created."); }
  let task: ReturnType<PDFPageProxy["render"]> | undefined;
  const abort = () => task?.cancel();
  context.signal?.addEventListener("abort", abort, { once: true });
  try {
    drawing.fillStyle = "white"; drawing.fillRect(0, 0, canvas.width, canvas.height);
    task = page.render({ canvas, canvasContext: drawing, viewport, intent: "display", annotationMode: 0, background: "rgb(255,255,255)" });
    await task.promise;
    assertRedactionCurrent(context);
    return { width: canvas.width, height: canvas.height, rgba: drawing.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally {
    context.signal?.removeEventListener("abort", abort);
    canvas.width = 0; canvas.height = 0;
  }
}
