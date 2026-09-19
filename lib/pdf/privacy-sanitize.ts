import { PDFArray, PDFDict, PDFName, PDFRef } from "pdf-lib";
import { PdfProcessingError } from "./errors";
import { inspectPdfPrivacy, type PrivacyRendererOpener } from "./privacy-inspect";
import { loadPdfDocument } from "./loading";
import { inspectPdfObjects, removeUnreachablePdfObjects } from "./privacy-objects";
import { verifyAttachmentSanitization, verifyMetadataSanitization } from "./privacy-verify";

export const MAX_PRIVACY_SANITIZED_OUTPUT_SIZE = 100 * 1024 * 1024;

function sanitizedFilename(name: string) {
  const stem = name.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
  return `${stem}-metadata-removed.pdf`;
}

function documentHasSignature(document: Awaited<ReturnType<typeof loadPdfDocument>>) {
  let signed = false;
  inspectPdfObjects(document, ({ object }) => {
    const dict = object instanceof PDFDict ? object : object.dict;
    if (dict.get(PDFName.of("ByteRange")) || dict.get(PDFName.of("FT"))?.toString() === "/Sig" ||
      dict.get(PDFName.of("Type"))?.toString() === "/Sig") signed = true;
  });
  return signed;
}

export async function sanitizePdfMetadata(file: File, openRenderer?: PrivacyRendererOpener) {
  const before = await inspectPdfPrivacy(file, openRenderer);
  const document = await loadPdfDocument(file);
  const signed = documentHasSignature(document);
  document.context.trailerInfo.Info = undefined;
  document.catalog.delete(PDFName.of("Metadata"));
  const cleanup = removeUnreachablePdfObjects(document);
  const saved = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  if (saved.length > MAX_PRIVACY_SANITIZED_OUTPUT_SIZE) throw new PdfProcessingError("workload-too-large", "The sanitized PDF exceeds the 100 MB output safety limit.");
  const bytes = new Uint8Array(saved);
  const verified = await verifyMetadataSanitization(file, bytes, before, openRenderer);
  const warnings = [...verified.verification.warnings];
  if (signed) warnings.unshift("This PDF contains a digital-signature structure. Creating a new sanitized file invalidates existing signatures.");
  return { blob: new Blob([bytes], { type: "application/pdf" }), bytes, filename: sanitizedFilename(file.name),
    before, after: verified.inspection, verification: { ...verified.verification, warnings }, cleanup, signed };
}

function removeAttachmentReferences(document: Awaited<ReturnType<typeof loadPdfDocument>>) {
  const names = document.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const removedNameTree = Boolean(names?.delete(PDFName.of("EmbeddedFiles")));
  let removedAssociatedEntries = 0, removedAnnotations = 0;
  inspectPdfObjects(document, ({ object }) => {
    const dict = object instanceof PDFDict ? object : object.dict;
    if (dict.delete(PDFName.of("AF"))) removedAssociatedEntries++;
  });
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = annots.size() - 1; index >= 0; index--) {
      const value = annots.get(index);
      const resolved = value instanceof PDFRef ? document.context.lookup(value) : value;
      if (resolved instanceof PDFDict && resolved.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() === "/FileAttachment") {
        annots.remove(index); removedAnnotations++;
      }
    }
  }
  return { removedNameTree, removedAssociatedEntries, removedAnnotations };
}

export async function sanitizePdfAttachments(file: File, openRenderer?: PrivacyRendererOpener) {
  const before = await inspectPdfPrivacy(file, openRenderer);
  const document = await loadPdfDocument(file);
  const signed = documentHasSignature(document);
  const references = removeAttachmentReferences(document);
  const cleanup = removeUnreachablePdfObjects(document);
  const saved = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  if (saved.length > MAX_PRIVACY_SANITIZED_OUTPUT_SIZE) throw new PdfProcessingError("workload-too-large", "The sanitized PDF exceeds the 100 MB output safety limit.");
  const bytes = new Uint8Array(saved);
  const verified = await verifyAttachmentSanitization(file, bytes, before, openRenderer);
  const warnings = [...verified.verification.warnings];
  if (signed) warnings.unshift("This PDF contains a digital-signature structure. Creating a new sanitized file invalidates existing signatures.");
  return { blob: new Blob([bytes], { type: "application/pdf" }), bytes,
    filename: sanitizedFilename(file.name).replace("-metadata-removed.pdf", "-attachments-removed.pdf"), before,
    after: verified.inspection, verification: { ...verified.verification, warnings }, references, cleanup, signed };
}
