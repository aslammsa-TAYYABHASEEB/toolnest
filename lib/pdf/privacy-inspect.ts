import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef, PDFStream, type PDFDocument } from "pdf-lib";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfProcessingError } from "./errors";
import { loadPdfDocument } from "./loading";
import { loadPdfRendererDocument } from "./renderer";
import { sourceTextPlacements } from "./searchable";
import { inspectPdfObjects, pdfEntry, pdfEntryText, PRIVACY_LIMITS } from "./privacy-objects";
import type { PrivacyCategory, PrivacyConcern, PrivacyCoverage, PrivacyFinding, PrivacyInspection } from "./privacy-types";

export type PrivacyRendererOpener = (file: File) => Promise<PDFDocumentProxy>;
const standardInfo = new Set(["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped"]);
const commentTypes = new Set(["Text", "FreeText", "Highlight", "Underline", "Squiggly", "StrikeOut", "Stamp", "Ink", "Popup", "Caret", "Circle", "Square", "Line", "Polygon", "PolyLine"]);
const allCategories: PrivacyCategory[] = ["metadata", "xmp", "attachment", "active-content", "annotation", "external-link", "form", "hidden-text", "redaction-risk", "optional-content", "thumbnail", "image-metadata"];
const inspectOnly = new Set<PrivacyCategory>(["form", "hidden-text", "redaction-risk", "optional-content", "thumbnail", "image-metadata"]);

function bounded(value: string | undefined, limit = 100) { return value?.slice(0, limit); }
function asDict(document: PDFDocument, value: unknown): PDFDict | undefined {
  const resolved = value instanceof PDFRef ? document.context.lookup(value) : value;
  return resolved instanceof PDFDict ? resolved : undefined;
}
function asStream(document: PDFDocument, value: unknown): PDFStream | undefined {
  const resolved = value instanceof PDFRef ? document.context.lookup(value) : value;
  return resolved instanceof PDFStream ? resolved : undefined;
}
function addFinding(findings: PrivacyFinding[], finding: Omit<PrivacyFinding, "id">) {
  findings.push({ id: `finding-${findings.length + 1}`, ...finding });
}

function offPageOperatorCount(operators: { fnArray: number[]; argsArray: unknown[][] }, ops: typeof import("pdfjs-dist").OPS, bounds: number[]) {
  type Matrix = [number, number, number, number, number, number];
  let transform: Matrix = [1, 0, 0, 1, 0, 0], text: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let count = 0;
  for (let index = 0; index < operators.fnArray.length; index++) {
    const fn = operators.fnArray[index], args = operators.argsArray[index] ?? [];
    if (fn === ops.save) stack.push([...transform]);
    else if (fn === ops.restore) transform = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === ops.transform && args.length >= 6) {
      const [a, b, c, d, e, f] = args.map(Number);
      transform = [transform[0] * a + transform[2] * b, transform[1] * a + transform[3] * b,
        transform[0] * c + transform[2] * d, transform[1] * c + transform[3] * d,
        transform[0] * e + transform[2] * f + transform[4], transform[1] * e + transform[3] * f + transform[5]];
    } else if (fn === ops.setTextMatrix && (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) &&
      Array.from(args[0] as ArrayLike<number>).length >= 6) text = Array.from(args[0] as ArrayLike<number>, Number) as Matrix;
    else if (fn === ops.showText || fn === ops.showSpacedText) {
      const x = transform[0] * text[4] + transform[2] * text[5] + transform[4];
      const y = transform[1] * text[4] + transform[3] * text[5] + transform[5];
      if (Number.isFinite(x + y) && (x < bounds[0] - 5 || x > bounds[2] + 5 || y < bounds[1] - 5 || y > bounds[3] + 5)) count++;
    }
  }
  return count;
}

function coveredTextCount(operators: { fnArray: number[]; argsArray: unknown[][] }, ops: typeof import("pdfjs-dist").OPS,
  placements: ReturnType<typeof sourceTextPlacements>) {
  type Matrix = [number, number, number, number, number, number];
  let transform: Matrix = [1, 0, 0, 1, 0, 0], fill = "";
  const stack: Array<{ transform: Matrix; fill: string }> = [];
  let textWasDrawn = false, covered = 0;
  for (let index = 0; index < operators.fnArray.length; index++) {
    const fn = operators.fnArray[index], args = operators.argsArray[index] ?? [];
    if (fn === ops.save) stack.push({ transform: [...transform], fill });
    else if (fn === ops.restore) { const previous = stack.pop(); transform = previous?.transform ?? [1, 0, 0, 1, 0, 0]; fill = previous?.fill ?? ""; }
    else if (fn === ops.setFillRGBColor) fill = String(args[0] ?? "").toLowerCase();
    else if (fn === ops.showText || fn === ops.showSpacedText) textWasDrawn = true;
    else if (fn === ops.transform && args.length >= 6) {
      const [a, b, c, d, e, f] = args.map(Number);
      transform = [transform[0] * a + transform[2] * b, transform[1] * a + transform[3] * b,
        transform[0] * c + transform[2] * d, transform[1] * c + transform[3] * d,
        transform[0] * e + transform[2] * f + transform[4], transform[1] * e + transform[3] * f + transform[5]];
    } else if (fn === ops.constructPath && textWasDrawn && fill === "#000000") {
      const raw = args[2];
      if (!raw || !(Array.isArray(raw) || ArrayBuffer.isView(raw))) continue;
      const box = Array.from(raw as ArrayLike<number>, Number);
      if (box.length !== 4 || box.some(value => !Number.isFinite(value))) continue;
      const corners = [[box[0], box[1]], [box[0], box[3]], [box[2], box[1]], [box[2], box[3]]]
        .map(([x, y]) => [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]]);
      const x0 = Math.min(...corners.map(point => point[0])), x1 = Math.max(...corners.map(point => point[0]));
      const y0 = Math.min(...corners.map(point => point[1])), y1 = Math.max(...corners.map(point => point[1]));
      if (x1 - x0 < 8 || y1 - y0 < 5) continue;
      covered += placements.filter(p => !p.hidden && p.x + p.width * .25 >= x0 && p.x + p.width * .75 <= x1 &&
        p.y - p.height * .1 >= y0 && p.y + p.height * .75 <= y1).length;
    }
  }
  return covered;
}

function structuralFindings(document: PDFDocument, findings: PrivacyFinding[], warnings: string[]) {
  const pageByAnnotation = new Map<string, number>();
  const pageByNode = new Map<PDFDict, number>();
  document.getPages().forEach((page, index) => {
    pageByNode.set(page.node, index + 1);
    const annots = page.node.Annots();
    if (annots) for (let n = 0; n < annots.size(); n++) {
      const entry = annots.get(n);
      if (entry instanceof PDFRef) pageByAnnotation.set(entry.toString(), index + 1);
    }
  });
  let imageCount = 0, imageMetadataCount = 0, oversizedStreams = 0;
  const seenFileSpecs = new Set<string>();
  const pagePaths: Array<{ path: string; page: number }> = [];
  const pageForPath = (path: string) => pagePaths.find(item => path.startsWith(`${item.path}/`))?.page;
  const objectCount = inspectPdfObjects(document, ({ object, path, ref }) => {
    const dict = object instanceof PDFStream ? object.dict : object;
    const pageNumber = pageByNode.get(dict);
    if (pageNumber) pagePaths.push({ path, page: pageNumber });
    if (object instanceof PDFStream && object.getContentsSize() > PRIVACY_LIMITS.streamBytes) oversizedStreams++;
    if (path === "trailer/Info") {
      for (const [key] of dict.entries()) {
        const name = key.asString().slice(1), value = pdfEntryText(dict, name, 100);
        if (!value) continue;
        addFinding(findings, { category: "metadata", title: standardInfo.has(name) ? `${name} metadata` : "Custom Info metadata",
          description: `The PDF stores ${name} in its document information dictionary.`, concern: name === "Author" ? "review" : "informational",
          rationale: name === "Author" ? "May reveal a person's identity." : "May reveal document history or origin.", confidence: "high",
          objectPath: `${path}/${name}`, objectRef: ref, evidence: { key: name, value }, removal: "supported-later",
          verificationMethod: "Reinspect Info dictionary and serialized bytes." });
      }
    }
    if (object instanceof PDFStream && path === "trailer/Root/Metadata" && pdfEntryText(dict, "Type") === "Metadata") {
      addFinding(findings, { category: "xmp", title: "XMP metadata stream", description: "An XMP metadata stream is present.",
        concern: "review", rationale: "XMP can contain authorship, history, identifiers or custom fields.", confidence: "high",
        objectPath: path, objectRef: ref, evidence: { encodedBytes: object.getContentsSize() }, removal: "supported-later",
        verificationMethod: "Reinspect metadata references, streams and serialized bytes." });
    }
    if (pdfEntryText(dict, "Type") === "Filespec" || pdfEntry(dict, "EF")) {
      const key = ref ?? path;
      if (!seenFileSpecs.has(key)) {
        seenFileSpecs.add(key);
        const ef = asDict(document, pdfEntry(dict, "EF"));
        const payload = ef && (asStream(document, pdfEntry(ef, "UF")) ?? asStream(document, pdfEntry(ef, "F")));
        const size = payload?.getContentsSize();
        if (size && size > PRIVACY_LIMITS.attachmentBytes) warnings.push("An embedded file exceeds the per-attachment inspection limit; its contents were not read.");
        addFinding(findings, { category: "attachment", title: "Embedded file reference", description: "The PDF contains a file specification or attachment.",
          concern: "high", rationale: "An attached file may disclose material beyond the visible pages.", confidence: "high",
          objectPath: path, objectRef: ref, page: (ref ? pageByAnnotation.get(ref) : undefined) ?? pageForPath(path),
          evidence: { filename: bounded(pdfEntryText(dict, "UF") ?? pdfEntryText(dict, "F")) ?? "Unnamed", ...(size ? { encodedBytes: size } : {}),
            ...(payload ? { mimeType: pdfEntryText(payload.dict, "Subtype") ?? "Unknown" } : {}) },
          removal: "supported-later", functionalityImpact: "Removing it would make the attached file unavailable.",
          verificationMethod: "Reinspect file specifications, associated-file references and payload objects." });
      }
    }
    const action = pdfEntryText(dict, "S");
    if (action === "JavaScript" || action === "Launch" || pdfEntry(dict, "JS")) {
      addFinding(findings, { category: "active-content", title: action === "Launch" ? "Launch action" : "JavaScript action",
        description: "An executable PDF action is reachable from the document structure.", concern: "high",
        rationale: "Active PDF behavior can execute script or launch an external program in supporting viewers.", confidence: "high",
        objectPath: path, objectRef: ref, page: pageForPath(path), evidence: { action: action ?? "JavaScript" }, removal: "supported-later",
        functionalityImpact: "Removal can disable interactive PDF behavior.", verificationMethod: "Reinspect all known action entry points and saved objects." });
    }
    if (path === "trailer/Root" && pdfEntry(dict, "OpenAction")) {
      addFinding(findings, { category: "active-content", title: "OpenAction entry", description: "The PDF specifies an action or destination when opened.",
        concern: "review", rationale: "An opening action may trigger behavior; a destination alone is not executable.", confidence: "high",
        objectPath: `${path}/OpenAction`, evidence: { kind: asDict(document, pdfEntry(dict, "OpenAction")) ? "action" : "destination or reference" },
        removal: "supported-later", functionalityImpact: "Removal may change the initial view.", verificationMethod: "Reinspect catalog OpenAction." });
    }
    if (pdfEntry(dict, "AA")) {
      addFinding(findings, { category: "active-content", title: "Additional action triggers", description: "Additional PDF actions are configured.",
        concern: "review", rationale: "Actions may run on document, page or field events.", confidence: "high",
        objectPath: `${path}/AA`, objectRef: ref, page: pageNumber ?? pageForPath(path), removal: "supported-later",
        functionalityImpact: "Removal may disable interactive behavior.", verificationMethod: "Reinspect AA dictionaries and targets." });
    }
    if (action === "URI") {
      addFinding(findings, { category: "external-link", title: "External URI action", description: "A link points outside this PDF.",
        concern: "review", rationale: "Opening it can disclose activity to an external destination.", confidence: "high",
        objectPath: path, objectRef: ref, page: pageForPath(path), evidence: { target: bounded(pdfEntryText(dict, "URI"), 160) ?? "Unspecified" },
        removal: "supported-later", functionalityImpact: "Removal would disable the link.", verificationMethod: "Reinspect URI actions." });
    }
    const subtype = pdfEntryText(dict, "Subtype");
    if (subtype === "Image") {
      imageCount++;
      if (pdfEntry(dict, "Metadata") || pdfEntry(dict, "ICCProfile") || String(pdfEntry(dict, "ColorSpace") ?? "").includes("ICCBased")) imageMetadataCount++;
    }
    if (subtype && (commentTypes.has(subtype) || subtype === "Link" || subtype === "FileAttachment" || subtype === "Widget") &&
      (pdfEntryText(dict, "Type") === "Annot" || (ref && pageByAnnotation.has(ref)))) {
      const annotationFlags = Number(pdfEntryText(dict, "F") ?? 0);
      addFinding(findings, { category: "annotation", title: subtype === "Widget" ? "Form widget" : `${subtype} annotation`,
        description: subtype === "Widget" ? "A form control annotation is present." : "A page annotation is present.",
        concern: subtype === "Widget" ? "informational" : "review", rationale: subtype === "Widget" ? "Part of a form, not an ordinary comment." : "May contain comments or links not obvious in the printed page.",
        confidence: "high", page: (ref ? pageByAnnotation.get(ref) : undefined) ?? pageForPath(path), objectPath: path, objectRef: ref,
        evidence: { subtype, ...(subtype === "Widget" ? { hidden: Boolean(annotationFlags & 2 || annotationFlags & 32) } : {}),
          ...(pdfEntryText(dict, "Contents") ? { summary: bounded(pdfEntryText(dict, "Contents"))! } : {}) },
        removal: subtype === "Widget" ? "inspect-only" : "supported-later", functionalityImpact: "Removing annotations may discard intended comments, links or attachments.",
        verificationMethod: "Reinspect page annotation arrays and saved objects." });
    }
    if (path === "trailer/Root" && pdfEntry(dict, "AcroForm")) {
      addFinding(findings, { category: "form", title: "AcroForm present", description: "The PDF contains an interactive form structure.",
        concern: "informational", rationale: "Field values and defaults may hold private information.", confidence: "high",
        objectPath: `${path}/AcroForm`, removal: "inspect-only", verificationMethod: "Reinspect form tree and appearance streams." });
    }
    if (path.includes("/Fields/") && (pdfEntry(dict, "T") || pdfEntry(dict, "FT"))) {
      const flags = Number(pdfEntryText(dict, "Ff") ?? 0);
      addFinding(findings, { category: "form", title: "Form field", description: "An interactive field is defined.",
        concern: pdfEntry(dict, "V") || pdfEntry(dict, "DV") ? "review" : "informational",
        rationale: "Current and default values may remain in the document.", confidence: "high", objectPath: path, objectRef: ref,
        evidence: { name: bounded(pdfEntryText(dict, "T")) ?? "Unnamed", type: pdfEntryText(dict, "FT") ?? "Inherited",
          hasValue: Boolean(pdfEntry(dict, "V")), hasDefaultValue: Boolean(pdfEntry(dict, "DV")), readOnly: Boolean(flags & 1) },
        removal: "inspect-only", functionalityImpact: "Changing form data may alter appearance or calculations.", verificationMethod: "Reinspect field, widget and appearance dictionaries." });
    }
    if (path === "trailer/Root" && pdfEntry(dict, "OCProperties")) {
      const oc = asDict(document, pdfEntry(dict, "OCProperties"));
      const defaults = oc && asDict(document, pdfEntry(oc, "D"));
      const off = defaults && pdfEntry(defaults, "OFF");
      addFinding(findings, { category: "optional-content", title: "Optional PDF layers", description: "Optional-content layers are configured.",
        concern: "review", rationale: "Some content may be hidden in the default view or visible only when printed.", confidence: "high",
        objectPath: `${path}/OCProperties`, evidence: { hasNonDefaultOffState: off instanceof PDFArray && off.size() > 0 },
        removal: "inspect-only", verificationMethod: "Compare layer configuration and page render states." });
    }
    if (pageByNode.has(dict) && pdfEntry(dict, "Thumb")) {
      addFinding(findings, { category: "thumbnail", title: "Embedded page thumbnail", description: "A page thumbnail object is present.",
        concern: "review", rationale: "A thumbnail may retain an auxiliary copy of page imagery.", confidence: "high", page: pageByNode.get(dict),
        objectPath: `${path}/Thumb`, removal: "inspect-only", verificationMethod: "Reinspect page Thumb entry and referenced image." });
    }
  });
  if (oversizedStreams) warnings.push(`${oversizedStreams} stream(s) exceeded the inspection stream limit; their contents were not decoded.`);
  if (imageCount) addFinding(findings, { category: "image-metadata", title: "Embedded images inventoried",
    description: "Image streams are present; image-level forensic metadata is not fully decoded.", concern: "informational",
    rationale: "Image profiles or private metadata can exist inside encoded image data.", confidence: "medium",
    evidence: { imageStreams: imageCount, imageStreamsWithMetadataReferences: imageMetadataCount }, removal: "inspect-only",
    verificationMethod: "Inspect image streams with format-aware tools in a later version." });
  return objectCount;
}

async function pageEvidence(renderer: PDFDocumentProxy, findings: PrivacyFinding[], warnings: string[]) {
  const pdfjs = await import("pdfjs-dist");
  for (let number = 1; number <= renderer.numPages; number++) {
    const page = await renderer.getPage(number);
    try {
      const text = await page.getTextContent(), operators = await page.getOperatorList();
      if (operators.fnArray.length > 50_000) { warnings.push(`Page ${number} has too many drawing operators for text-visibility analysis.`); continue; }
      const placements = sourceTextPlacements(text, operators, pdfjs.OPS);
      const covered = coveredTextCount(operators, pdfjs.OPS, placements);
      if (covered) addFinding(findings, { category: "redaction-risk", title: "Live text beneath a dark cover",
        description: "A dark rectangular drawing operation overlaps extractable text drawn earlier on this page.",
        concern: "high", rationale: "The underlying text is still extractable even though a later shape may conceal it visually.",
        confidence: "medium", page: number, evidence: { overlappedTextItems: covered }, removal: "inspect-only",
        verificationMethod: "Confirm overlap between rendered cover and extracted text; inspect the page visually.",
        technicalNotes: "Limited to opaque black rectangular paths identified in PDF.js drawing operators; other masking methods are not ruled out." });
      const viewport = page.getViewport({ scale: 1 });
      const offPage = placements.filter(p => p.x < -5 || p.y < -5 || p.x > viewport.width + 5 || p.y > viewport.height + 5);
      const offPageCount = Math.max(offPage.length, offPageOperatorCount(operators, pdfjs.OPS, page.view));
      if (offPageCount) addFinding(findings, { category: "hidden-text", title: "Off-page text drawing", description: "Text drawing operators are positioned outside the visible page.",
        concern: "review", rationale: "Off-page text can carry information that does not appear on the page.", confidence: "high", page: number,
        evidence: { items: offPageCount }, removal: "inspect-only", verificationMethod: "Compare text operators and extracted coordinates with page bounds." });
      const hidden = placements.filter(p => p.hidden && !offPage.includes(p));
      if (!hidden.length) continue;
      const imageOps = operators.fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject).length;
      const classification = imageOps && hidden.length >= 12 && hidden.length >= placements.length * .75 ? "legitimate OCR/search layer" :
        imageOps ? "uncertain" : "suspicious hidden text";
      addFinding(findings, { category: "hidden-text", title: classification === "legitimate OCR/search layer" ? "Searchable text layer" : "Invisible text present",
        description: classification === "legitimate OCR/search layer" ? "Invisible text appears to support search over scanned imagery." : "Invisible extractable text needs review.",
        concern: classification === "suspicious hidden text" ? "review" : "informational",
        rationale: classification === "legitimate OCR/search layer" ? "Invisible OCR text is normally useful for search and accessibility." : "Visibility and intent cannot be established from opacity alone.",
        confidence: "medium", page: number, evidence: { classification, items: hidden.length, imagePaintOperations: imageOps },
        removal: "inspect-only", functionalityImpact: "Removing legitimate OCR text would harm search and accessibility.",
        verificationMethod: "Compare text placement, visibility operators and page imagery." });
    } finally { page.cleanup(); }
  }
}

/** Read-only: neither the input File nor its PDF objects are saved or modified. */
export async function inspectPdfPrivacy(file: File, openRenderer: PrivacyRendererOpener = loadPdfRendererDocument): Promise<PrivacyInspection> {
  if (file.size > PRIVACY_LIMITS.fileBytes) throw new PdfProcessingError("workload-too-large", "Choose a PDF smaller than 25 MB for private browser inspection.");
  const document = await loadPdfDocument(file);
  const pageCount = document.getPageCount();
  if (!pageCount || pageCount > PRIVACY_LIMITS.pages) throw new PdfProcessingError("workload-too-large", "This inspector supports PDFs with 1–200 pages.");
  const findings: PrivacyFinding[] = [], warnings: string[] = [];
  const objects = structuralFindings(document, findings, warnings);
  const renderer = await openRenderer(file);
  try {
    try {
      const metadata = await renderer.getMetadata();
      const xmp = metadata?.metadata as { getAll?: () => Record<string, unknown> } | null;
      const values = xmp?.getAll?.();
      if (values && Object.keys(values).length) {
        const keys = Object.keys(values).slice(0, 20);
        addFinding(findings, { category: "xmp", title: "Readable XMP fields", description: "Identifiable XMP property names were parsed.",
          concern: "review", rationale: "XMP properties may reveal identity, software or document history.", confidence: "medium",
          evidence: { keys: keys.join(", ").slice(0, 200), fieldCount: Object.keys(values).length }, removal: "supported-later",
          verificationMethod: "Reinspect the saved metadata stream and object inventory." });
      }
    } catch { warnings.push("XMP field decoding was unavailable; structural metadata presence was still inspected."); }
    await pageEvidence(renderer, findings, warnings);
  } finally { await renderer.destroy(); }
  const coverage: PrivacyCoverage[] = allCategories.map(category => ({ category,
    state: category === "redaction-risk" || category === "image-metadata" || category === "xmp" ? "partial" : inspectOnly.has(category) ? "inspection-only" : "inspected",
    ...(category === "redaction-risk" ? { note: "Complex graphic masking cannot be ruled out; no absence-of-leak guarantee." } : {}),
    ...(category === "image-metadata" ? { note: "Encoded image payloads and EXIF are not decoded." } : {}) }));
  warnings.push("This is a structural inspection, not a forensic or verified-clean certificate. Encrypted and proprietary PDFs are not fully supported.");
  return { pageCount, findings, coverage, limits: { fileBytes: PRIVACY_LIMITS.fileBytes, objects, pages: PRIVACY_LIMITS.pages }, warnings };
}
