import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { inspectRedactionPdf, openRedactionDocument } from "./inspect";
import { outwardPixelRectangle, redactionSelectionKey, snapshotRedactionMarks } from "./geometry";
import { renderRedactionPage } from "./raster";
import { verifyRedactedPdf } from "./verify";
import { REDACTION_LIMITS, REDACTION_SCALE, RedactionError, assertRedactionCurrent, redactionBrowserSupport, redactionCheckpoint, type RedactionContext, type RedactionMark, type RedactionResult } from "./types";

const receipts = new WeakMap<RedactionResult, { source: File; selectionKey: string; blob: Blob }>();
export function redactionResultMatches(result: RedactionResult, source: File, marks: readonly RedactionMark[]) {
  const receipt = receipts.get(result);
  return Boolean(receipt && receipt.source === source && receipt.blob === result.blob && receipt.selectionKey === redactionSelectionKey(marks));
}

/** Whole-document reconstruction. No source PDF objects enter the fresh context. */
export async function runPdfRedaction(source: File, selections: readonly RedactionMark[], context: RedactionContext = {}): Promise<RedactionResult> {
  if (!redactionBrowserSupport()) throw new RedactionError("refused", "Desktop Chrome or Edge is required for redaction in this version.");
  assertRedactionCurrent(context);
  const inspection = await inspectRedactionPdf(source, context);
  const marks = snapshotRedactionMarks(selections, inspection.pages);
  if (!marks.length) throw new RedactionError("refused", "Mark at least one area before creating a redacted copy.");
  const key = redactionSelectionKey(marks);
  const current = () => {
    assertRedactionCurrent(context);
    if (redactionSelectionKey(selections) !== key) throw new RedactionError("stale", "The marks changed. Review them and run Redact & Verify again.");
  };
  current();
  const document = await openRedactionDocument(source);
  let candidate: Blob;
  try {
    current();
    const output = await PDFDocument.create({ updateMetadata: false });
    let compressedBytes = 0;
    for (let i = 0; i < document.numPages; i++) {
      await redactionCheckpoint(context, { phase: "render", page: i + 1, total: document.numPages }); current();
      const page = await document.getPage(i + 1);
      try {
        const raster = await renderRedactionPage(page, context), geometry = inspection.pages[i];
        for (const mark of marks.filter(mark => mark.page === i + 1)) {
          const [x0, y0, x1, y1] = outwardPixelRectangle(mark.rect);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) raster.rgba.set([0, 0, 0, 255], (y * raster.width + x) * 4);
        }
        const rgb = new Uint8Array(raster.width * raster.height * 3);
        for (let p = 0; p < raster.width * raster.height; p++) { rgb[p * 3] = raster.rgba[p * 4]; rgb[p * 3 + 1] = raster.rgba[p * 4 + 1]; rgb[p * 3 + 2] = raster.rgba[p * 4 + 2]; }
        current();
        const stream = output.context.flateStream(rgb, { Type: "XObject", Subtype: "Image", Width: raster.width, Height: raster.height, ColorSpace: "DeviceRGB", BitsPerComponent: 8 });
        compressedBytes += stream.getContents().length;
        if (compressedBytes > REDACTION_LIMITS.outputBytes) throw new RedactionError("limit", "The generated copy exceeds the 20 MiB output limit. No download is available.");
        const image = output.context.register(stream), resultPage = output.addPage([geometry.width, geometry.height]);
        resultPage.node.set(PDFName.of("Resources"), output.context.obj({ XObject: { PageImage: image } }));
        // Align the image to the export pixel grid instead of squeezing a ceil-rounded
        // raster into fractional page dimensions. The MediaBox remains exact.
        const imageWidth = raster.width / REDACTION_SCALE, imageHeight = raster.height / REDACTION_SCALE;
        // JavaScript may stringify a tiny grid offset as 1e-13, which is not a
        // valid PDF numeric operand. Preserve its value using PDF decimal syntax.
        const matrix = [imageWidth, 0, 0, imageHeight, 0, geometry.height - imageHeight]
          .map(value => PDFNumber.of(value).toString()).join(" ");
        resultPage.node.set(PDFName.of("Contents"), output.context.register(output.context.flateStream(`q\n${matrix} cm\n/PageImage Do\nQ\n`)));
      } finally { page.cleanup(); }
    }
    await redactionCheckpoint(context, { phase: "build", page: document.numPages, total: document.numPages }); current();
    const bytes = await output.save({ useObjectStreams: false, updateFieldAppearances: false });
    current();
    if (bytes.length > REDACTION_LIMITS.outputBytes) throw new RedactionError("limit", "The generated copy exceeds the 20 MiB output limit. No download is available.");
    candidate = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  } finally { await document.loadingTask.destroy(); }
  current();
  const outcome = await verifyRedactedPdf(source, candidate, marks, context);
  current();
  if (!outcome.ok || outcome.blob !== candidate) throw new RedactionError("verification", "The generated copy did not pass every supported redaction check. No download is available." + (!outcome.ok ? " " + outcome.reason : ""));
  const stem = source.name.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
  const result = Object.freeze({ blob: candidate, filename: stem + "-redacted.pdf", verification: outcome.verification });
  receipts.set(result, { source, selectionKey: key, blob: candidate });
  return result;
}
