import { PDFDict, PDFName, PDFStream } from "pdf-lib";
import { loadPdfDocument } from "@/lib/pdf/loading";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { inspectPdfPrivacy } from "@/lib/pdf/privacy-inspect";
import { assertRedactionDocumentLimits, redactionPageGeometry } from "./geometry";
import { REDACTION_LIMITS, RedactionError, assertRedactionCurrent, redactionCheckpoint, type RedactionContext, type RedactionInspection } from "./types";

export const openRedactionDocument = (file: File) => loadPdfRendererDocument(file, { stopAtErrors: true });

/** No source document or renderer is retained after this bounded safety gate. */
export async function inspectRedactionPdf(file: File, context: RedactionContext = {}): Promise<RedactionInspection> {
  assertRedactionCurrent(context);
  if (!file.size || file.size > REDACTION_LIMITS.inputBytes) throw new RedactionError("limit", "Choose a PDF no larger than 20 MiB.");
  // Bound pages/pixels before the more detailed existing privacy inspection.
  const structure = await loadPdfDocument(file);
  if (!structure.getPageCount() || structure.getPageCount() > REDACTION_LIMITS.pages) throw new RedactionError("limit", "Choose a PDF with 1 to 10 pages.");
  if (structure.context.enumerateIndirectObjects().length > 15_000) throw new RedactionError("limit", "This PDF exceeds the document inspection limit.");
  // Conservative refusal also covers unsupported orphaned signature/form/layer dictionaries.
  for (const [, object] of structure.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) continue;
    const type = dict.get(PDFName.of("Type"))?.toString(), field = dict.get(PDFName.of("FT"))?.toString();
    if (dict.has(PDFName.of("ByteRange")) || type === "/Sig" || field === "/Sig") throw new RedactionError("refused", "Digital signature structure detected. This version will not rewrite the PDF; it does not validate the signature cryptographically.");
    if (dict.has(PDFName.of("AcroForm")) || dict.has(PDFName.of("XFA")) || field || dict.get(PDFName.of("Subtype"))?.toString() === "/Widget") throw new RedactionError("refused", "This PDF contains a form. AcroForm and XFA forms are not supported in this version.");
    if (dict.has(PDFName.of("OCProperties")) || type === "/OCG" || type === "/OCMD") throw new RedactionError("refused", "This PDF contains optional content or layers, which are not supported in this version.");
  }
  const renderer = await openRedactionDocument(file), pages = [];
  try {
    if (renderer.numPages !== structure.getPageCount()) throw new RedactionError("refused", "PDF readers disagree on the page count. This version cannot process it.");
    for (let number = 1; number <= renderer.numPages; number++) {
      await redactionCheckpoint(context, { phase: "inspect", page: number, total: renderer.numPages });
      const page = await renderer.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 });
        pages.push(redactionPageGeometry(number, viewport.width, viewport.height, page.rotate));
      } finally { page.cleanup(); }
    }
  } finally { await renderer.loadingTask.destroy(); }
  assertRedactionDocumentLimits(pages);
  let privacy;
  try { privacy = await inspectPdfPrivacy(file, openRedactionDocument); }
  catch (error) {
    assertRedactionCurrent(context);
    throw new RedactionError("refused", "Rewrite safety could not be checked, so ToolNest will not modify this PDF. " + (error instanceof Error ? error.message : ""));
  }
  assertRedactionCurrent(context);
  if (privacy.signed !== false) throw new RedactionError("refused", privacy.signed === true
    ? "Digital signature structure detected. This version will not rewrite the PDF."
    : "Rewrite safety could not be checked, so ToolNest will not modify this PDF.");
  if (privacy.findings.some(f => f.category === "form" || f.category === "optional-content")) throw new RedactionError("refused", "Forms and optional PDF layers are not supported in this version.");
  return Object.freeze({ source: file, pages: Object.freeze(pages), signed: false });
}
