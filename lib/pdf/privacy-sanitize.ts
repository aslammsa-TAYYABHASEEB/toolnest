import { PDFArray, PDFDict, PDFName, PDFRef } from "pdf-lib";
import { PdfProcessingError } from "./errors";
import { inspectPdfPrivacy, type PrivacyRendererOpener } from "./privacy-inspect";
import { loadPdfDocument } from "./loading";
import { activeActionSecretValues, annotationSecretValues, dangerousActionKind, inspectPdfObjects,
  removeUnreachablePdfObjects, REVIEW_ANNOTATION_SUBTYPES } from "./privacy-objects";
import { verifyActiveActionSanitization, verifyAnnotationSanitization, verifyAttachmentSanitization, verifyMetadataSanitization } from "./privacy-verify";

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
  const removedEmptyNames = Boolean(names && !names.keys().length && document.catalog.delete(PDFName.of("Names")));
  const resetPageMode = document.catalog.lookupMaybe(PDFName.of("PageMode"), PDFName)?.asString() === "/UseAttachments";
  if (resetPageMode) document.catalog.delete(PDFName.of("PageMode"));
  let removedAssociatedEntries = 0, removedAnnotations = 0, removedDependentPopups = 0, removedStaleAnnotationLinks = 0;
  inspectPdfObjects(document, ({ object }) => {
    const dict = object instanceof PDFDict ? object : object.dict;
    if (dict.delete(PDFName.of("AF"))) removedAssociatedEntries++;
  });
  const resolve = (value: unknown) => value instanceof PDFRef ? document.context.lookup(value) : value;
  const entries: Array<{ array: PDFArray; dict: PDFDict }> = [];
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = 0; index < annots.size(); index++) {
      const resolved = resolve(annots.get(index));
      if (resolved instanceof PDFDict) entries.push({ array: annots, dict: resolved });
    }
  }
  const remove = new Set<PDFDict>();
  for (const { dict } of entries)
    if (dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() === "/FileAttachment") remove.add(dict);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { dict } of entries) {
      if (remove.has(dict) || dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Popup") continue;
      const parent = resolve(dict.get(PDFName.of("Parent")));
      const ownedByRemoved = parent instanceof PDFDict && remove.has(parent);
      const linkedFromRemoved = [...remove].some(owner => resolve(owner.get(PDFName.of("Popup"))) === dict);
      const sharedBySurvivor = entries.some(entry => entry.dict !== dict && !remove.has(entry.dict) &&
        entry.dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Popup" &&
        resolve(entry.dict.get(PDFName.of("Popup"))) === dict);
      if ((ownedByRemoved || linkedFromRemoved) && !sharedBySurvivor) {
        remove.add(dict); removedDependentPopups++; changed = true;
      }
    }
  }
  for (const page of document.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let index = annots.size() - 1; index >= 0; index--) {
      const resolved = resolve(annots.get(index));
      if (resolved instanceof PDFDict && remove.has(resolved)) { annots.remove(index); removedAnnotations++; }
    }
    if (!annots.size()) page.node.delete(PDFName.of("Annots"));
  }
  for (const { dict } of entries) {
    if (remove.has(dict)) continue;
    for (const key of [PDFName.of("Parent"), PDFName.of("Popup"), PDFName.of("IRT")]) {
      const linked = resolve(dict.get(key));
      if (linked instanceof PDFDict && remove.has(linked) && dict.delete(key)) removedStaleAnnotationLinks++;
    }
  }
  return { removedNameTree, removedEmptyNames, resetPageMode, removedAssociatedEntries, removedAnnotations,
    removedDependentPopups, removedStaleAnnotationLinks };
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

function resolvedActionValue(document: Awaited<ReturnType<typeof loadPdfDocument>>, value: unknown) {
  return value instanceof PDFRef ? document.context.lookup(value) : value;
}

function removeActiveActionReferences(document: Awaited<ReturnType<typeof loadPdfDocument>>) {
  const names = document.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const removedJavaScriptNameTree = Boolean(names?.delete(PDFName.of("JavaScript")));
  const seen = new WeakSet<object>();
  let removedDangerousBranches = 0, removedEmptyAdditionalActions = 0, removedEmptyNextEntries = 0;
  const retainActionValue = (value: unknown): boolean => {
    const resolved = resolvedActionValue(document, value);
    if (resolved instanceof PDFArray) {
      if (seen.has(resolved)) return true;
      seen.add(resolved);
      for (let index = resolved.size() - 1; index >= 0; index--) if (!retainActionValue(resolved.get(index))) resolved.remove(index);
      return resolved.size() > 0;
    }
    if (!(resolved instanceof PDFDict)) return true;
    if (dangerousActionKind(document, resolved)) { removedDangerousBranches++; return false; }
    if (seen.has(resolved)) return true;
    seen.add(resolved);
    const next = resolved.get(PDFName.of("Next"));
    if (next && !retainActionValue(next)) { resolved.delete(PDFName.of("Next")); removedEmptyNextEntries++; }
    return true;
  };
  const openAction = document.catalog.get(PDFName.of("OpenAction"));
  if (openAction && !retainActionValue(openAction)) document.catalog.delete(PDFName.of("OpenAction"));
  inspectPdfObjects(document, ({ object }) => {
    const dict = object instanceof PDFDict ? object : object.dict;
    const action = dict.get(PDFName.of("A"));
    if (action && !retainActionValue(action)) dict.delete(PDFName.of("A"));
    const additional = resolvedActionValue(document, dict.get(PDFName.of("AA")));
    if (!(additional instanceof PDFDict)) return;
    for (const [event, value] of [...additional.entries()]) if (!retainActionValue(value)) additional.delete(event);
    if (!additional.keys().length) { dict.delete(PDFName.of("AA")); removedEmptyAdditionalActions++; }
  });
  return { removedJavaScriptNameTree, removedDangerousBranches, removedEmptyAdditionalActions, removedEmptyNextEntries };
}

export async function sanitizePdfActiveActions(file: File, openRenderer?: PrivacyRendererOpener) {
  const before = await inspectPdfPrivacy(file, openRenderer);
  const document = await loadPdfDocument(file);
  const signed = documentHasSignature(document);
  const secrets = activeActionSecretValues(document);
  const references = removeActiveActionReferences(document);
  const cleanup = removeUnreachablePdfObjects(document);
  const saved = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  if (saved.length > MAX_PRIVACY_SANITIZED_OUTPUT_SIZE) throw new PdfProcessingError("workload-too-large", "The sanitized PDF exceeds the 100 MB output safety limit.");
  const bytes = new Uint8Array(saved);
  const verified = await verifyActiveActionSanitization(file, bytes, before, secrets, openRenderer);
  const warnings = [...verified.verification.warnings];
  if (references.removedDangerousBranches) warnings.unshift("Removing active actions can disable document, page, annotation, or form behavior that depended on them.");
  if (signed) warnings.unshift("This PDF contains a digital-signature structure. Creating a new sanitized file invalidates existing signatures.");
  return { blob: new Blob([bytes], { type: "application/pdf" }), bytes,
    filename: sanitizedFilename(file.name).replace("-metadata-removed.pdf", "-active-content-removed.pdf"), before,
    after: verified.inspection, verification: { ...verified.verification, warnings }, references, cleanup, signed };
}

function removeReviewAnnotationReferences(document: Awaited<ReturnType<typeof loadPdfDocument>>) {
  const entries: Array<{ array: PDFArray; value: unknown; dict: PDFDict }> = [];
  let malformedArrays = 0;
  for (const page of document.getPages()) {
    const raw = page.node.get(PDFName.of("Annots"));
    if (!raw) continue;
    const array = resolvedActionValue(document, raw);
    if (!(array instanceof PDFArray)) { malformedArrays++; continue; }
    for (let index = 0; index < array.size(); index++) {
      const value = array.get(index), dict = resolvedActionValue(document, value);
      if (dict instanceof PDFDict) entries.push({ array, value, dict });
    }
  }
  const known = new Set(entries.map(entry => entry.dict)), remove = new Set<PDFDict>();
  for (const { dict } of entries) {
    const subtype = dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString().slice(1);
    if (subtype && REVIEW_ANNOTATION_SUBTYPES.has(subtype)) remove.add(dict);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const { dict } of entries) {
      if (remove.has(dict)) {
        const popup = resolvedActionValue(document, dict.get(PDFName.of("Popup")));
        if (popup instanceof PDFDict && known.has(popup) && !remove.has(popup)) { remove.add(popup); changed = true; }
        continue;
      }
      const parent = resolvedActionValue(document, dict.get(PDFName.of("Parent")));
      const replyTo = resolvedActionValue(document, dict.get(PDFName.of("IRT")));
      if ((parent instanceof PDFDict && remove.has(parent)) || (replyTo instanceof PDFDict && remove.has(replyTo))) {
        remove.add(dict); changed = true;
      }
    }
  }
  let removedAnnotations = 0, emptiedArrays = 0;
  for (const page of document.getPages()) {
    const raw = page.node.get(PDFName.of("Annots")), array = raw && resolvedActionValue(document, raw);
    if (!(array instanceof PDFArray)) continue;
    for (let index = array.size() - 1; index >= 0; index--) {
      const dict = resolvedActionValue(document, array.get(index));
      if (dict instanceof PDFDict && remove.has(dict)) { array.remove(index); removedAnnotations++; }
    }
    if (!array.size()) { page.node.delete(PDFName.of("Annots")); emptiedArrays++; }
  }
  return { removedAnnotations, associatedAnnotationObjects: remove.size, emptiedArrays, malformedArrays };
}

export async function sanitizePdfReviewAnnotations(file: File, openRenderer?: PrivacyRendererOpener) {
  const before = await inspectPdfPrivacy(file, openRenderer);
  const document = await loadPdfDocument(file);
  const signed = documentHasSignature(document);
  const secrets = annotationSecretValues(document);
  const references = removeReviewAnnotationReferences(document);
  const cleanup = removeUnreachablePdfObjects(document);
  const saved = await document.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
  if (saved.length > MAX_PRIVACY_SANITIZED_OUTPUT_SIZE) throw new PdfProcessingError("workload-too-large", "The sanitized PDF exceeds the 100 MB output safety limit.");
  const bytes = new Uint8Array(saved);
  const verified = await verifyAnnotationSanitization(file, bytes, before, secrets, openRenderer);
  const warnings = [...verified.verification.warnings];
  if (references.removedAnnotations) warnings.unshift("Removing comments and markup can change visible page appearance and discards review history.");
  if (signed) warnings.unshift("This PDF contains a digital-signature structure. Creating a new sanitized file invalidates existing signatures.");
  return { blob: new Blob([bytes], { type: "application/pdf" }), bytes,
    filename: sanitizedFilename(file.name).replace("-metadata-removed.pdf", "-comments-removed.pdf"), before,
    after: verified.inspection, verification: { ...verified.verification, warnings }, references, cleanup, signed };
}
