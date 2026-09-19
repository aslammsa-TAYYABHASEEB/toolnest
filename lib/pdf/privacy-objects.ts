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

/** Traverses live objects without decoding streams, executing actions, or following URLs. */
export function inspectPdfObjects(document: PDFDocument, visit: (entry: ObjectVisit) => void) {
  const context = document.context;
  const count = context.enumerateIndirectObjects().length;
  if (count > PRIVACY_LIMITS.objects) throw new PdfProcessingError("workload-too-large", "This PDF has too many objects for private browser inspection.");
  const seenRefs = new Set<string>();
  const seenDirect = new WeakSet<object>();
  const stack: Array<{ value: unknown; path: string; depth: number; ref?: string }> = [];
  if (context.trailerInfo.Root) stack.push({ value: context.trailerInfo.Root, path: "trailer/Root", depth: 0 });
  if (context.trailerInfo.Info) stack.push({ value: context.trailerInfo.Info, path: "trailer/Info", depth: 0 });
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
    if (value instanceof PDFStream) {
      visit({ object: value, path: entry.path, ref });
      if (value.getContentsSize() > PRIVACY_LIMITS.streamBytes) continue;
      value = value.dict;
    } else if (value instanceof PDFDict) visit({ object: value, path: entry.path, ref });
    if (value instanceof PDFDict) {
      for (const [key, child] of value.entries()) stack.push({ value: child, path: `${entry.path}/${key.asString().slice(1)}`, depth: entry.depth + 1 });
    } else if (value instanceof PDFArray) {
      for (let index = 0; index < value.size(); index++) stack.push({ value: value.get(index), path: `${entry.path}/${index}`, depth: entry.depth + 1 });
    }
  }
  return count;
}

export function pdfValue(value: unknown, max = 160): string | undefined {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText().slice(0, max);
  if (value instanceof PDFName) return value.asString().slice(1, max + 1);
  if (value instanceof PDFNumber) return String(value.asNumber());
  return undefined;
}

export function pdfEntry(dict: PDFDict, key: string): unknown { return dict.get(PDFName.of(key)); }
export function pdfEntryText(dict: PDFDict, key: string, max = 160) { return pdfValue(pdfEntry(dict, key), max); }
