import { PDFDocument, PDFDict, PDFArray, PDFName, PDFNumber, PDFRef, PDFRawStream } from "pdf-lib";
import { pdfObjectReachability } from "@/lib/pdf/privacy-objects";
import { inspectPdfPrivacy } from "@/lib/pdf/privacy-inspect";
import { openRedactionDocument } from "./inspect";
import { snapshotRedactionMarks, redactionPageGeometry, assertRedactionDocumentLimits } from "./geometry";
import { renderRedactionPage } from "./raster";
import { REDACTION_LIMITS, REDACTION_SCALE, RedactionError, assertRedactionCurrent, redactionCheckpoint, type RedactionContext, type RedactionMark, type RedactionVerification } from "./types";

const N = PDFName.of;
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function same(actual: unknown, expected: unknown, label: string) { check(JSON.stringify(actual) === JSON.stringify(expected), label); }
function exactBytes(a: Uint8Array, b: Uint8Array) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function latin1(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return value;
}
function dictionaryKeys(dict: PDFDict, allowed: string[], label: string) {
  check(dict instanceof PDFDict, label + ": not a dictionary");
  same(dict.keys().map(key => key.asString().slice(1)).sort(), [...allowed].sort(), label + ": unexpected structures");
}

/** Strict native zlib decoder: unlike permissive inflate helpers, trailing bytes,
 * concatenated members and bad checksums fail. Reads are bounded independently
 * of the stream's advertised image size. Chromium behavior is regression-tested. */
async function decode(stream: PDFRawStream, limit: number, context: RedactionContext) {
  check(stream instanceof PDFRawStream, "Unexpected output stream");
  check(stream.dict.get(N("Filter"))?.toString() === "/FlateDecode", "Unexpected stream encoding");
  const compressed = stream.getContents();
  check(stream.dict.get(N("Length"))?.toString() === String(compressed.length), "Stream length differs");
  const reader = new Blob([Uint8Array.from(compressed)]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  const pieces: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  context.signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      assertRedactionCurrent(context);
      const { value, done } = await reader.read();
      assertRedactionCurrent(context);
      if (done) break;
      size += value.length;
      check(size <= limit, "Decoded image exceeds its pixel budget");
      pieces.push(value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const piece of pieces) { bytes.set(piece, at); at += piece.length; }
    return bytes;
  } finally {
    context.signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined); reader.releaseLock();
  }
}

/** Writer-specific envelope. Every serialized byte/object must be accounted for:
 * one header, consecutive canonical objects, one classic xref and one trailer.
 * A parser alone would silently ignore trailing data and incremental history. */
function envelope(bytes: Uint8Array, document: PDFDocument) {
  const text = latin1(bytes), footer = /startxref\n(\d+)\n%%EOF$/.exec(text);
  check(footer, "Unexpected serialized trailing data or footer");
  const offset = Number(footer[1]), section = text.slice(offset), head = /^xref\n0 (\d+)\n/.exec(section);
  check(head, "Expected a single classic xref");
  const size = Number(head[1]), objects = document.context.enumerateIndirectObjects();
  check(size === objects.length + 1, "Unaccounted xref objects");
  const entries = section.slice(head[0].length).split("\n");
  check(entries[0] === "0000000000 65535 f ", "Unexpected free objects");
  let previousEnd = 0;
  for (let i = 0; i < objects.length; i++) {
    const [ref, object] = objects[i];
    check(ref.objectNumber === i + 1 && ref.generationNumber === 0, "Unexpected object identity");
    check(/^\d{10} 00000 n $/.test(entries[i + 1]), "Unexpected xref entry");
    const start = Number(entries[i + 1].slice(0, 10));
    if (i === 0) check(/^%PDF-1\.7\n%[\x80-\xff]{4}\n\n$/.test(text.slice(0, start)), "Unexpected serialized prefix");
    else check(start === previousEnd, "Unexplained bytes between objects");
    const body = new Uint8Array(object.sizeInBytes()); object.copyBytesInto(body, 0);
    const prefix = new TextEncoder().encode(`${ref.objectNumber} 0 obj\n`), suffix = new TextEncoder().encode("\nendobj\n\n");
    const expected = new Uint8Array(prefix.length + body.length + suffix.length);
    expected.set(prefix); expected.set(body, prefix.length); expected.set(suffix, prefix.length + body.length);
    check(exactBytes(bytes.subarray(start, start + expected.length), expected), "Noncanonical or hidden serialized object bytes");
    previousEnd = start + expected.length;
  }
  check(previousEnd === offset, "Unexplained bytes before xref");
  check(entries.slice(size).join("\n") === `\ntrailer\n<<\n/Size ${size}\n/Root ${document.context.trailerInfo.Root}\n>>\n\nstartxref\n${offset}\n%%EOF`, "Unexpected trailer or revision history");
}

export type RedactionVerificationOutcome = { ok: true; blob: Blob; verification: RedactionVerification } | { ok: false; reason: string };

/** Reopens the actual Blob and original source. No writer-provided raster,
 * checksum, dimensions or manifest is accepted as verification evidence. */
export async function verifyRedactedPdf(source: File, blob: Blob, selections: readonly RedactionMark[], context: RedactionContext = {}): Promise<RedactionVerificationOutcome> {
  let originalDocument: Awaited<ReturnType<typeof openRedactionDocument>> | undefined;
  let finalDocument: Awaited<ReturnType<typeof openRedactionDocument>> | undefined;
  try {
    assertRedactionCurrent(context);
    check(blob.size > 0 && blob.size <= REDACTION_LIMITS.outputBytes, "Output exceeds the 20 MiB limit");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Bound the restricted format before invoking a general PDF parser.
    const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 2048)));
    check(/trailer\n<<\n\/Size ([1-9]\d*)\n\/Root/.test(tail), "Unexpected output envelope");
    const size = Number(/trailer\n<<\n\/Size (\d+)/.exec(tail)?.[1]);
    check(size <= 3 * REDACTION_LIMITS.pages + 3, "Too many output objects");
    const document = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true });
    envelope(bytes, document);
    dictionaryKeys(document.catalog, ["Type", "Pages"], "Catalog");
    const treeRef = document.catalog.get(N("Pages")), tree = document.context.lookup(treeRef);
    check(treeRef instanceof PDFRef && tree instanceof PDFDict, "Unexpected page tree");
    dictionaryKeys(tree, ["Type", "Kids", "Count"], "Page tree");
    check(tree.get(N("Type"))?.toString() === "/Pages" && document.catalog.get(N("Type"))?.toString() === "/Catalog", "Unexpected PDF types");
    check(pdfObjectReachability(document).unreachable.length === 0, "Unreachable output objects");
    originalDocument = await openRedactionDocument(source);
    finalDocument = await openRedactionDocument(new File([blob], "redaction-verification.pdf", { type: "application/pdf" }));
    check(document.getPageCount() === originalDocument.numPages && finalDocument.numPages === originalDocument.numPages, "Output page count changed");
    const geometries = [];
    for (let i = 1; i <= originalDocument.numPages; i++) {
      const page = await originalDocument.getPage(i);
      try { const view = page.getViewport({ scale: 1 }); geometries.push(redactionPageGeometry(i, view.width, view.height, page.rotate)); }
      finally { page.cleanup(); }
    }
    assertRedactionDocumentLimits(geometries);
    const marks = snapshotRedactionMarks(selections, geometries);
    const expectedObjects = new Set([String(document.context.trailerInfo.Root), String(treeRef)]);
    let maskedPixels = 0, preservedPixels = 0;
    for (let i = 0; i < originalDocument.numPages; i++) {
      await redactionCheckpoint(context, { phase: "verify", page: i + 1, total: originalDocument.numPages });
      const original = await originalDocument.getPage(i + 1), final = await finalDocument.getPage(i + 1);
      try {
        const view = original.getViewport({ scale: 1 }), finalView = final.getViewport({ scale: 1 });
        same([finalView.width, finalView.height], [view.width, view.height], "Displayed page dimensions changed");
        check(final.rotate === 0, "Output rotation was not normalized");
        const page = document.getPage(i);
        check(String(tree.lookup(N("Kids"), PDFArray).get(i)) === String(page.ref), "Output page order changed");
        expectedObjects.add(String(page.ref));
        dictionaryKeys(page.node, ["Type", "Parent", "MediaBox", "Resources", "Contents"], "Page");
        check(page.node.get(N("Type"))?.toString() === "/Page" && String(page.node.get(N("Parent"))) === String(treeRef), "Unexpected page type or parent");
        same(page.node.lookup(N("MediaBox"), PDFArray).asArray().map(n => Number(n.toString())), [0, 0, view.width, view.height], "Page box changed");
        const resources = page.node.lookup(N("Resources"), PDFDict); dictionaryKeys(resources, ["XObject"], "Page resources");
        const images = resources.lookup(N("XObject"), PDFDict); dictionaryKeys(images, ["PageImage"], "Image resources");
        const imageRef = images.get(N("PageImage")), contentRef = page.node.get(N("Contents"));
        check(imageRef instanceof PDFRef && contentRef instanceof PDFRef, "Unexpected direct image or contents");
        expectedObjects.add(String(imageRef)); expectedObjects.add(String(contentRef));
        const content = document.context.lookup(contentRef);
        check(content instanceof PDFRawStream, "Unexpected page content");
        dictionaryKeys(content.dict, ["Length", "Filter"], "Drawing stream");
        // Derive pixel-grid placement independently from the original page geometry.
        const gridWidth = Math.ceil(view.width * REDACTION_SCALE) / REDACTION_SCALE;
        const gridHeight = Math.ceil(view.height * REDACTION_SCALE) / REDACTION_SCALE;
        const expectedMatrix = [gridWidth, 0, 0, gridHeight, 0, view.height - gridHeight]
          .map(value => PDFNumber.of(value).toString()).join(" ");
        check(new TextDecoder().decode(await decode(content, 2048, context)) === `q\n${expectedMatrix} cm\n/PageImage Do\nQ\n`, "Unexpected drawing or text operators");
        const image = document.context.lookup(imageRef);
        check(image instanceof PDFRawStream, "Unexpected image object");
        dictionaryKeys(image.dict, ["Type", "Subtype", "Width", "Height", "ColorSpace", "BitsPerComponent", "Length", "Filter"], "Image");
        check(image.dict.get(N("Type"))?.toString() === "/XObject" && image.dict.get(N("Subtype"))?.toString() === "/Image"
          && image.dict.get(N("ColorSpace"))?.toString() === "/DeviceRGB" && image.dict.get(N("BitsPerComponent"))?.toString() === "8", "Unexpected image representation");
        const base = await renderRedactionPage(original, context), rendered = await renderRedactionPage(final, context);
        same([image.dict.get(N("Width"))?.toString(), image.dict.get(N("Height"))?.toString()], [String(base.width), String(base.height)], "Image dimensions changed");
        const rgb = await decode(image, base.width * base.height * 3, context);
        check(rgb.length === base.width * base.height * 3, "Unexpected image samples");
        const pageMarks = marks.filter(mark => mark.page === i + 1);
        // Independent intersection oracle. Does not call the writer's rounding/painting helper.
        for (let y = 0; y < base.height; y++) {
          if (y % 128 === 0) assertRedactionCurrent(context);
          for (let x = 0; x < base.width; x++) {
            const inMask = pageMarks.some(({ rect: b }) => x < b[2] * REDACTION_SCALE && x + 1 > b[0] * REDACTION_SCALE && y < b[3] * REDACTION_SCALE && y + 1 > b[1] * REDACTION_SCALE);
            if (inMask) maskedPixels++; else preservedPixels++;
            const pixel = y * base.width + x;
            for (let c = 0; c < 3; c++) {
              const expected = inMask ? 0 : base.rgba[pixel * 4 + c];
              check(rgb[pixel * 3 + c] === expected, inMask ? "Marked pixels remain exposed" : "Unmarked image pixels changed");
              check(rendered.rgba[pixel * 4 + c] === expected, `Saved output rendering changed expected pixels on page ${i + 1} at ${x},${y}`);
            }
          }
        }
        check((await final.getTextContent()).items.every(item => !("str" in item) || !item.str.trim()), "Output contains searchable text");
        check((await final.getAnnotations()).length === 0, "Output contains annotations");
      } finally { original.cleanup(); final.cleanup(); }
    }
    same(document.context.enumerateIndirectObjects().map(([ref]) => String(ref)).sort(), [...expectedObjects].sort(), "Unexpected additional output objects");
    const after = await inspectPdfPrivacy(new File([blob], "redacted.pdf", { type: "application/pdf" }), openRedactionDocument);
    check(after.signed === false && after.findings.every(f => f.category === "image-metadata" && f.evidence?.imageStreamsWithMetadataReferences === 0), "Inherited private or interactive structures");
    assertRedactionCurrent(context);
    return { ok: true, blob, verification: Object.freeze({ status: "passed", pageCount: document.getPageCount(), maskedPixels, preservedPixels, objects: expectedObjects.size,
      checks: Object.freeze(["Output parsed", "Page count and displayed geometry preserved", "Fresh image-only structure", "No inherited text or interactive structures", "All serialized objects and bytes accounted for", "Marked pixels replaced", "Unmarked raster pixels preserved", "Saved output rendering matched"]) }) };
  } catch (error) {
    if (error instanceof RedactionError && (error.code === "cancelled" || error.code === "stale")) throw error;
    assertRedactionCurrent(context);
    return { ok: false, reason: error instanceof Error ? error.message : "Verification did not finish" };
  } finally {
    if (originalDocument) await originalDocument.loadingTask.destroy();
    if (finalDocument) await finalDocument.loadingTask.destroy();
  }
}
