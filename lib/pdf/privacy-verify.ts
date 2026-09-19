import { PDFName } from "pdf-lib";
import { inspectPdfPrivacy, type PrivacyRendererOpener } from "./privacy-inspect";
import { loadPdfDocument } from "./loading";
import { activeActionStructureSummary, attachmentStructureSummary, pdfObjectReachability } from "./privacy-objects";
import type { ActiveActionSanitizationVerification, AttachmentSanitizationVerification, MetadataSanitizationVerification, PrivacyInspection } from "./privacy-types";

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
      .map(finding => finding.evidence?.value).filter((value): value is string => typeof value === "string" && value.length >= 4);
    const byteMatches = values.filter(value => serializedPdfContainsSecret(outputBytes, value)).length;
    if (reachability.unreachable.length) warnings.push(`${reachability.unreachable.length} unreachable output object(s) remain.`);
    if (byteMatches) warnings.push(`${byteMatches} prior metadata value(s) remain in common serialized encodings.`);
    const pageCountPreserved = parsed.getPageCount() === before.pageCount;
    if (!pageCountPreserved) warnings.push("The output page count differs from the input.");
    return { inspection, verification: {
      metadata: infoAbsent && metadataFindings === 0 && byteMatches === 0 && !reachability.unreachable.length ? "verified-removed" : "removal-failed",
      xmp: xmpAbsent && xmpFindings === 0 && !reachability.unreachable.length ? "verified-removed" : "removal-failed",
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
      !reachability.unreachable.length ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
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
      !reachability.unreachable.length ? "verified-removed" : "removal-failed", pageCountPreserved, parseable: true,
      remainingActiveContentFindings: findings, remainingActiveContentStructures: structureCount, warnings } };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "The saved PDF could not be verified.");
    return { verification: { activeContent: "could-not-verify", pageCountPreserved: false, parseable: false,
      remainingActiveContentFindings: -1, remainingActiveContentStructures: -1, warnings } };
  }
}
