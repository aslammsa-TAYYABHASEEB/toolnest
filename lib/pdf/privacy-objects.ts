import { PDFArray, PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef, PDFStream, PDFString, type PDFDocument } from "pdf-lib";
import { PdfProcessingError } from "./errors";

export const PRIVACY_LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  pages: 200,
  objects: 15_000,
  depth: 32,
  streamBytes: 4 * 1024 * 1024,
  attachmentBytes: 10 * 1024 * 1024,
} as const;

export type ObjectVisit = { object: PDFDict | PDFStream; path: string; ref?: string };

function walkPdfGraph(document: PDFDocument, roots: Array<{ value: unknown; path: string }>, visit: (entry: ObjectVisit) => void) {
  const context = document.context;
  const seenRefs = new Set<string>();
  const seenDirect = new WeakSet<object>();
  const stack = roots.map(root => ({ ...root, depth: 0, ref: undefined as string | undefined }));
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.depth > PRIVACY_LIMITS.depth) throw new PdfProcessingError("workload-too-large", "This PDF's object nesting exceeds the inspection safety limit.");
    let value = entry.value, ref = entry.ref;
    if (value instanceof PDFRef) {
      ref = value.toString();
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
      value = context.lookup(value);
      if (!value) continue;
    } else if (value && typeof value === "object") {
      if (seenDirect.has(value)) continue;
      seenDirect.add(value);
    }
    if (++visited > PRIVACY_LIMITS.objects) throw new PdfProcessingError("workload-too-large", "This PDF exceeds the object inspection safety limit.");
    if (value instanceof PDFStream) { visit({ object: value, path: entry.path, ref }); value = value.dict; }
    else if (value instanceof PDFDict) visit({ object: value, path: entry.path, ref });
    if (value instanceof PDFDict) {
      for (const [key, child] of value.entries()) stack.push({ value: child, path: `${entry.path}/${key.asString().slice(1)}`, depth: entry.depth + 1, ref: undefined });
    } else if (value instanceof PDFArray) {
      for (let index = 0; index < value.size(); index++) stack.push({ value: value.get(index), path: `${entry.path}/${index}`, depth: entry.depth + 1, ref: undefined });
    }
  }
  return { seenRefs, visited };
}

/** Traverses live objects without decoding streams, executing actions, or following URLs. */
export function inspectPdfObjects(document: PDFDocument, visit: (entry: ObjectVisit) => void) {
  const context = document.context;
  const count = context.enumerateIndirectObjects().length;
  if (count > PRIVACY_LIMITS.objects) throw new PdfProcessingError("workload-too-large", "This PDF has too many objects for private browser inspection.");
  const roots: Array<{ value: unknown; path: string }> = [];
  if (context.trailerInfo.Root) roots.push({ value: context.trailerInfo.Root, path: "trailer/Root" });
  if (context.trailerInfo.Info) roots.push({ value: context.trailerInfo.Info, path: "trailer/Info" });
  walkPdfGraph(document, roots, visit);
  return count;
}

/** Deletes parsed objects unreachable from the output trailer roots. pdf-lib
 * otherwise serializes every object still present in its context. */
export function removeUnreachablePdfObjects(document: PDFDocument) {
  const context = document.context;
  const all = context.enumerateIndirectObjects();
  if (all.length > PRIVACY_LIMITS.objects) throw new PdfProcessingError("workload-too-large", "This PDF has too many objects for private browser sanitization.");
  const roots: Array<{ value: unknown; path: string }> = [];
  if (context.trailerInfo.Root) roots.push({ value: context.trailerInfo.Root, path: "trailer/Root" });
  if (context.trailerInfo.Info) roots.push({ value: context.trailerInfo.Info, path: "trailer/Info" });
  if (context.trailerInfo.Encrypt) roots.push({ value: context.trailerInfo.Encrypt, path: "trailer/Encrypt" });
  const { seenRefs } = walkPdfGraph(document, roots, () => undefined);
  let removed = 0;
  for (const [ref] of all) if (!seenRefs.has(ref.toString())) { context.delete(ref); removed++; }
  return { before: all.length, reachable: seenRefs.size, removed };
}

export function pdfObjectReachability(document: PDFDocument) {
  const context = document.context;
  const all = context.enumerateIndirectObjects();
  if (all.length > PRIVACY_LIMITS.objects) throw new PdfProcessingError("workload-too-large", "This PDF has too many objects for private browser verification.");
  const roots: Array<{ value: unknown; path: string }> = [];
  if (context.trailerInfo.Root) roots.push({ value: context.trailerInfo.Root, path: "trailer/Root" });
  if (context.trailerInfo.Info) roots.push({ value: context.trailerInfo.Info, path: "trailer/Info" });
  if (context.trailerInfo.Encrypt) roots.push({ value: context.trailerInfo.Encrypt, path: "trailer/Encrypt" });
  const { seenRefs } = walkPdfGraph(document, roots, () => undefined);
  return { objects: all.length, reachable: seenRefs.size,
    unreachable: all.filter(([ref]) => !seenRefs.has(ref.toString())).map(([ref]) => ref.toString()) };
}

export function attachmentStructureSummary(document: PDFDocument) {
  const summary = { fileSpecs: 0, efDictionaries: 0, associatedFileEntries: 0,
    embeddedFileNameTrees: 0, fileAttachmentAnnotations: 0 };
  inspectPdfObjects(document, ({ object }) => {
    const dict = object instanceof PDFStream ? object.dict : object;
    if (pdfEntryText(dict, "Type") === "Filespec") summary.fileSpecs++;
    if (dict.has(PDFName.of("EF"))) summary.efDictionaries++;
    if (dict.has(PDFName.of("AF"))) summary.associatedFileEntries++;
    if (dict.has(PDFName.of("EmbeddedFiles"))) summary.embeddedFileNameTrees++;
    if (pdfEntryText(dict, "Subtype") === "FileAttachment") summary.fileAttachmentAnnotations++;
  });
  return summary;
}

function resolvedObject(document: PDFDocument, value: unknown) {
  return value instanceof PDFRef ? document.context.lookup(value) : value;
}

export type DangerousActionKind = "JavaScript" | "Launch";
export function dangerousActionKind(document: PDFDocument, value: unknown): DangerousActionKind | undefined {
  const resolved = resolvedObject(document, value);
  if (!(resolved instanceof PDFDict)) return undefined;
  const kind = pdfEntryText(resolved, "S");
  if (kind === "Launch") return "Launch";
  if (kind === "JavaScript" || resolved.has(PDFName.of("JS"))) return "JavaScript";
  return undefined;
}

function actionValueContainsDangerous(document: PDFDocument, value: unknown, seenRefs = new Set<string>(), seenDirect = new WeakSet<object>()): boolean {
  if (value instanceof PDFRef) {
    const key = value.toString();
    if (seenRefs.has(key)) return false;
    seenRefs.add(key);
    value = document.context.lookup(value);
  } else if (value && typeof value === "object") {
    if (seenDirect.has(value)) return false;
    seenDirect.add(value);
  }
  if (value instanceof PDFArray) {
    for (let index = 0; index < value.size(); index++) if (actionValueContainsDangerous(document, value.get(index), seenRefs, seenDirect)) return true;
    return false;
  }
  if (!(value instanceof PDFDict)) return false;
  if (dangerousActionKind(document, value)) return true;
  const next = value.get(PDFName.of("Next"));
  return next ? actionValueContainsDangerous(document, next, seenRefs, seenDirect) : false;
}

export function activeActionStructureSummary(document: PDFDocument) {
  const summary = { dangerousActions: 0, javaScriptNameTrees: 0, dangerousOpenActions: 0,
    dangerousActionEntries: 0, dangerousAdditionalActions: 0, dangerousNextBranches: 0 };
  inspectPdfObjects(document, ({ object, path }) => {
    const dict = object instanceof PDFStream ? object.dict : object;
    if (dangerousActionKind(document, dict)) summary.dangerousActions++;
    if (path === "trailer/Root/Names" && dict.has(PDFName.of("JavaScript"))) summary.javaScriptNameTrees++;
    const openAction = path === "trailer/Root" ? dict.get(PDFName.of("OpenAction")) : undefined;
    if (openAction && actionValueContainsDangerous(document, openAction)) summary.dangerousOpenActions++;
    const action = dict.get(PDFName.of("A"));
    if (action && actionValueContainsDangerous(document, action)) summary.dangerousActionEntries++;
    const additional = resolvedObject(document, dict.get(PDFName.of("AA")));
    if (additional instanceof PDFDict) for (const [, value] of additional.entries())
      if (actionValueContainsDangerous(document, value)) summary.dangerousAdditionalActions++;
    const next = dict.get(PDFName.of("Next"));
    if (next && actionValueContainsDangerous(document, next)) summary.dangerousNextBranches++;
  });
  return summary;
}

export function activeActionSecretValues(document: PDFDocument) {
  const values = new Set<string>();
  const collect = (value: unknown, depth = 0) => {
    if (depth > 2) return;
    const resolved = resolvedObject(document, value);
    const text = resolved instanceof PDFString || resolved instanceof PDFHexString ? resolved.decodeText().slice(0, 512) : undefined;
    if (text && text.length >= 4) values.add(text);
    else if (resolved instanceof PDFDict) for (const [key, child] of resolved.entries()) {
      if (key.asString() === "/Next") continue;
      collect(child, depth + 1);
    }
  };
  const collectAction = (object: PDFDict | PDFStream) => {
    const dict = object instanceof PDFStream ? object.dict : object;
    if (!dangerousActionKind(document, dict)) return;
    for (const [key, value] of dict.entries())
      if (!new Set(["/Type", "/S", "/Next"]).has(key.asString())) collect(value);
  };
  inspectPdfObjects(document, ({ object }) => collectAction(object));
  for (const [, object] of document.context.enumerateIndirectObjects())
    if (object instanceof PDFDict || object instanceof PDFStream) collectAction(object);
  return [...values];
}

export function pdfValue(value: unknown, max = 160): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText().slice(0, max);
  if (value instanceof PDFName) return value.asString().slice(1, max + 1);
  if (value instanceof PDFNumber) return String(value.asNumber());
  return undefined;
}

export function pdfEntry(dict: PDFDict, key: string): unknown { return dict.get(PDFName.of(key)); }
export function pdfEntryText(dict: PDFDict, key: string, max = 160) { return pdfValue(pdfEntry(dict, key), max); }
