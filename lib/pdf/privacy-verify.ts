import { PDFDict, PDFName, PDFRef, PDFStream, type PDFDocument } from "pdf-lib";
import { inspectPdfPrivacy, type PrivacyRendererOpener } from "./privacy-inspect";
import { loadPdfDocument } from "./loading";
import { activeActionStructureSummary, annotationStructureSummary, attachmentStructureSummary,
  externalLinkStructureSummary, pdfObjectReachability, REVIEW_ANNOTATION_SUBTYPES } from "./privacy-objects";
import type { ActiveActionSanitizationVerification, AnnotationSanitizationVerification,
  AttachmentSanitizationVerification, ExternalLinkSanitizationVerification,
  MetadataSanitizationVerification, PrivacyInspection } from "./privacy-types";

const encoder = new TextEncoder();
function includesBytes(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let index = 0; index < needle.length; index++) if (haystack[start + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

/** QA/verification helper: checks common literal encodings without exposing content. */
export function serializedPdfContainsSecret(bytes: Uint8Array, secret: string) {
  if (!secret) return false;
  const utf8 = encoder.encode(secret);
  const utf16 = new Uint8Array(2 + secret.length * 2); utf16.set([0xfe, 0xff]);
  for (let index = 0; index < secret.length; index++) { utf16[2 + index * 2] = secret.charCodeAt(index) >> 8; utf16[3 + index * 2] = secret.charCodeAt(index) & 255; }
  const hex = encoder.encode(Array.from(utf8, byte => byte.toString(16).padStart(2, "0")).join(""));
  const utf16Hex = encoder.encode(Array.from(utf16, byte => byte.toString(16).padStart(2, "0")).join(""));
  const lower = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) lower[index] = bytes[index] >= 65 && bytes[index] <= 90 ? bytes[index] + 32 : bytes[index];
  return includesBytes(bytes, utf8) || includesBytes(bytes, utf16) || includesBytes(lower, hex) || includesBytes(lower, utf16Hex);
}

type MetadataValue = { key: string; value: string };

function latin1Text(bytes: Uint8Array) {
  let text = "";
  for (let start = 0; start < bytes.length; start += 16_384)
    text += String.fromCharCode(...bytes.subarray(start, Math.min(start + 16_384, bytes.length)));
  return text;
}

/** Restricts residual checks to serialized PDF object dictionaries, never page/content stream payloads. */
export function serializedPdfMetadataResiduals(bytes: Uint8Array, values: MetadataValue[], preservedImageXmpRefs = new Set<string>()) {
  const text = latin1Text(bytes);
  const blocks: Array<{ ref: string; start: number; dictionaryEnd: number; dictionary: string }> = [];
  const objectStart = /\b(\d+)\s+(\d+)\s+obj\b/g;
  for (let match = objectStart.exec(text); match; match = objectStart.exec(text)) {
    const end = text.indexOf("endobj", objectStart.lastIndex);
    if (end < 0) break;
    const objectText = text.slice(match.index, end);
    const stream = objectText.search(/\bstream(?:\r\n|\r|\n)/);
    const dictionaryEnd = match.index + (stream < 0 ? objectText.length : stream);
    blocks.push({ ref: `${match[1]} ${match[2]} R`, start: match.index, dictionaryEnd, dictionary: text.slice(match.index, dictionaryEnd) });
    objectStart.lastIndex = end + 6;
  }
  let infoValues = 0;
  for (const { key, value } of values) {
    const keyToken = PDFName.of(key).toString();
    if (blocks.some(block => block.dictionary.includes(keyToken) &&
      serializedPdfContainsSecret(bytes.subarray(block.start, block.dictionaryEnd), value))) infoValues++;
  }
  const latestOffsets = new Map<string, number>();
  for (const block of blocks) latestOffsets.set(block.ref, block.start);
  const xmpContainers = blocks.filter(block => (/\/Type\s*\/Metadata\b/.test(block.dictionary) ||
    (/\/Subtype\s*\/XML\b/.test(block.dictionary) && /\/Metadata\b/.test(block.dictionary))) &&
    !(preservedImageXmpRefs.has(block.ref) && latestOffsets.get(block.ref) === block.start)).length;
  return { infoValues, xmpContainers };
}

function reachableImageXmpReferences(document: PDFDocument, unreachable: string[]) {
  const references = new Set<string>(), unreachableSet = new Set(unreachable);
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (unreachableSet.has(ref.toString())) continue;
    const dict = object instanceof PDFStream ? object.dict : object instanceof PDFDict ? object : undefined;
    if (dict?.lookupMaybe(PDFName.of("Subtype"), PDFName)?.asString() !== "/Image") continue;
    const metadata = dict.get(PDFName.of("Metadata"));
    if (metadata instanceof PDFRef) references.add(metadata.toString());
  }
  return references;
}

export async function verifyMetadataSanitization(
  source: File,
  outputBytes: Uint8Array,
  before: PrivacyInspection,
  openRenderer?: PrivacyRendererOpener,
): Promise<{ inspection?: PrivacyInspection; verification: MetadataSanitizationVerification }> {
  const warnings: string[] = [];
  try {
    const output = new File([outputBytes.slice().buffer as ArrayBuffer], source.name, { type: "application/pdf" });
    const inspection = await inspectPdfPrivacy(output, openRenderer);
    const parsed = await loadPdfDocument(output);
    const reachability = pdfObjectReachability(parsed);
    const infoAbsent = !parsed.context.trailerInfo.Info;
    const xmpAbsent = !parsed.catalog.has(PDFName.of("Metadata"));
    const metadataFindings = inspection.findings.filter(finding => finding.category === "metadata").length;
    const xmpFindings = inspection.findings.filter(finding => finding.category === "xmp").length;
    const values = before.findings.filter(finding => finding.category === "metadata")
      .map(finding => ({ key: finding.evidence?.key, value: finding.evidence?.value }))
      .filter((entry): entry is MetadataValue => typeof entry.key === "string" && typeof entry.value === "string" && entry.value.length >= 4);
    const residuals = serializedPdfMetadataResiduals(outputBytes, values,
      reachableImageXmpReferences(parsed, reachability.unreachable));
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (residuals.infoValues) warnings.push(`${residuals.infoValues} prior metadata value(s) remain in serialized Info context.`);
    if (residuals.xmpContainers) warnings.push(`${residuals.xmpContainers} serialized document-XMP metadata container(s) remain.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: {
      metadata: infoAbsent && metadataFindings === 0 && residuals.infoValues === 0 && !reachability.unreachable.length &&
        pageCountPreserved ? "verified-removed" : "removal-failed",
      xmp: xmpAbsent && xmpFindings === 0 && residuals.xmpContainers === 0 && !reachability.unreachable.length &&
        pageCountPreserved ? "verified-removed" : "removal-failed",
      pageCountPreserved, parseable: true, remainingMetadataFindings: metadataFindings + xmpFindings, warnings,
    } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { metadata: "could-not-verify", xmp: "could-not-verify", pageCountPreserved: false,
      parseable: false, remainingMetadataFindings: -1, warnings } };
  }
}

export async function verifyAttachmentSanitization(
  source: File,
  outputBytes: Uint8Array,
  before: PrivacyInspection,
  openRenderer?: PrivacyRendererOpener,
): Promise<{ inspection?: PrivacyInspection; verification: AttachmentSanitizationVerification }> {
  const warnings: string[] = [];
  try {
    const output = new File([outputBytes.slice().buffer as ArrayBuffer], source.name, { type: "application/pdf" });
    const inspection = await inspectPdfPrivacy(output, openRenderer);
    const parsed = await loadPdfDocument(output);
    const reachability = pdfObjectReachability(parsed);
    const structures = attachmentStructureSummary(parsed);
    const structureCount = Object.values(structures).reduce((total, count) => total + count, 0);
    const findings = inspection.findings.filter(finding => finding.category === "attachment").length;
    const filenames = before.findings.filter(finding => finding.category === "attachment")
      .map(finding => finding.evidence?.filename).filter((value): value is string => typeof value === "string" && value !== "Unnamed");
    const byteMatches = filenames.filter(value => serializedPdfContainsSecret(outputBytes, value)).length;
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (structureCount) warnings.push(`${structureCount} supported attachment structure(s) remain.`);
    if (byteMatches) warnings.push(`${byteMatches} prior attachment filename(s) remain in common serialized encodings.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: { attachments: findings === 0 && structureCount === 0 && byteMatches === 0 &&
      !reachability.unreachable.length && pageCountPreserved ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
      remainingAttachmentFindings: findings, remainingAttachmentStructures: structureCount, warnings } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { attachments: "could-not-verify", pageCountPreserved: false, parseable: false,
      remainingAttachmentFindings: -1, remainingAttachmentStructures: -1, warnings } };
  }
}

export async function verifyActiveActionSanitization(
  source: File,
  outputBytes: Uint8Array,
  before: PrivacyInspection,
  secrets: string[],
  openRenderer?: PrivacyRendererOpener,
): Promise<{ inspection?: PrivacyInspection; verification: ActiveActionSanitizationVerification }> {
  const warnings: string[] = [];
  try {
    const output = new File([outputBytes.slice().buffer as ArrayBuffer], source.name, { type: "application/pdf" });
    const inspection = await inspectPdfPrivacy(output, openRenderer);
    const parsed = await loadPdfDocument(output);
    const reachability = pdfObjectReachability(parsed);
    const structures = activeActionStructureSummary(parsed);
    const structureCount = Object.values(structures).reduce((total, count) => total + count, 0);
    const findings = inspection.findings.filter(finding => finding.category === "active-content" &&
      (finding.title === "JavaScript action" || finding.title === "Launch action")).length;
    const byteMatches = secrets.filter(value => serializedPdfContainsSecret(outputBytes, value)).length;
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (structureCount) warnings.push(`${structureCount} supported active-content structure(s) remain.`);
    if (byteMatches) warnings.push(`${byteMatches} prior active-action value(s) remain in common serialized encodings.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: { activeContent: findings === 0 && structureCount === 0 && byteMatches === 0 &&
      !reachability.unreachable.length && pageCountPreserved ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
      remainingActiveContentFindings: findings, remainingActiveContentStructures: structureCount, warnings } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { activeContent: "could-not-verify", pageCountPreserved: false, parseable: false,
      remainingActiveContentFindings: -1, remainingActiveContentStructures: -1, warnings } };
  }
}

export function serializedPdfUriResiduals(bytes: Uint8Array, secrets: string[]) {
  const text = latin1Text(bytes);
  const blocks: Array<{ start: number; dictionaryEnd: number; dictionary: string }> = [];
  const objectStart = /\b\d+\s+\d+\s+obj\b/g;
  for (let match = objectStart.exec(text); match; match = objectStart.exec(text)) {
    const end = text.indexOf("endobj", objectStart.lastIndex);
    if (end < 0) break;
    const objectText = text.slice(match.index, end);
    const stream = objectText.search(/\bstream(?:\r\n|\r|\n)/);
    const dictionaryEnd = match.index + (stream < 0 ? objectText.length : stream);
    blocks.push({ start: match.index, dictionaryEnd, dictionary: text.slice(match.index, dictionaryEnd) });
    objectStart.lastIndex = end + 6;
  }
  return secrets.filter(secret => blocks.some(block => /\/S\s*\/URI\b/.test(block.dictionary) &&
    serializedPdfContainsSecret(bytes.subarray(block.start, block.dictionaryEnd), secret))).length;
}

export async function verifyExternalLinkSanitization(
  source: File,
  outputBytes: Uint8Array,
  before: PrivacyInspection,
  secrets: string[],
  openRenderer?: PrivacyRendererOpener,
): Promise<{ inspection?: PrivacyInspection; verification: ExternalLinkSanitizationVerification }> {
  const warnings: string[] = [];
  try {
    const output = new File([outputBytes.slice().buffer as ArrayBuffer], source.name, { type: "application/pdf" });
    const inspection = await inspectPdfPrivacy(output, openRenderer);
    const parsed = await loadPdfDocument(output);
    const reachability = pdfObjectReachability(parsed);
    const structures = externalLinkStructureSummary(parsed);
    const structureCount = Object.values(structures).reduce((total, count) => total + count, 0);
    const findings = inspection.findings.filter(finding => finding.category === "external-link").length;
    const byteMatches = serializedPdfUriResiduals(outputBytes, secrets);
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (structureCount) warnings.push(`${structureCount} reachable external-URI structure(s) remain.`);
    if (byteMatches) warnings.push(`${byteMatches} prior URI target(s) remain in serialized URI-action context.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: { externalLinks: findings === 0 && structureCount === 0 && byteMatches === 0 &&
      !reachability.unreachable.length && pageCountPreserved ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
      remainingExternalLinkFindings: findings, remainingExternalLinkStructures: structureCount, warnings } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { externalLinks: "could-not-verify", pageCountPreserved: false, parseable: false,
      remainingExternalLinkFindings: -1, remainingExternalLinkStructures: -1, warnings } };
  }
}

export async function verifyAnnotationSanitization(
  source: File,
  outputBytes: Uint8Array,
  before: PrivacyInspection,
  secrets: string[],
  openRenderer?: PrivacyRendererOpener,
): Promise<{ inspection?: PrivacyInspection; verification: AnnotationSanitizationVerification }> {
  const warnings: string[] = [];
  try {
    const output = new File([outputBytes.slice().buffer as ArrayBuffer], source.name, { type: "application/pdf" });
    const inspection = await inspectPdfPrivacy(output, openRenderer);
    const parsed = await loadPdfDocument(output);
    const reachability = pdfObjectReachability(parsed);
    const structures = annotationStructureSummary(parsed);
    const structureCount = structures.reviewAnnotations + structures.ambiguousAnnotations + structures.malformedAnnotationArrays;
    const findings = inspection.findings.filter(finding => finding.category === "annotation" &&
      typeof finding.evidence?.subtype === "string" && REVIEW_ANNOTATION_SUBTYPES.has(finding.evidence.subtype)).length;
    const byteMatches = secrets.filter(value => serializedPdfContainsSecret(outputBytes, value)).length;
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (structures.reviewAnnotations) warnings.push(`${structures.reviewAnnotations} supported review annotation(s) remain.`);
    if (structures.ambiguousAnnotations || structures.malformedAnnotationArrays)
      warnings.push("Unsupported or malformed annotation structures remain; comment removal could not be fully verified.");
    if (byteMatches) warnings.push(`${byteMatches} prior comment/review value(s) remain in common serialized encodings.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: { annotations: findings === 0 && structureCount === 0 && byteMatches === 0 &&
      !reachability.unreachable.length && pageCountPreserved ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
      remainingCommentFindings: findings, remainingCommentStructures: structureCount, warnings } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { annotations: "could-not-verify", pageCountPreserved: false, parseable: false,
      remainingCommentFindings: -1, remainingCommentStructures: -1, warnings } };
  }
}
