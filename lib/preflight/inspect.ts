import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfDocument } from "@/lib/pdf/loading";
import { inspectPdfPrivacy } from "@/lib/pdf/privacy-inspect";
import { groupPrivacyFindings } from "@/lib/pdf/privacy-workflow";
import type { PrivacyInspection } from "@/lib/pdf/privacy-types";
import type { PreflightCheck, PreflightInspection, PreflightRequirements, PreflightSafetyItem, RequiredPageSize } from "./types";

type Dependencies = { load?: typeof loadPdfDocument; inspectPrivacy?: typeof inspectPdfPrivacy };
const sizes: Record<Exclude<RequiredPageSize, "any">, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

function pageMatches(width: number, height: number, required: RequiredPageSize) {
  if (required === "any") return true;
  const [targetWidth, targetHeight] = sizes[required];
  return Math.abs(Math.min(width, height) - targetWidth) <= 3 && Math.abs(Math.max(width, height) - targetHeight) <= 3;
}
function notCheckedSafety(reason: string): PreflightSafetyItem[] {
  const items: Array<[PreflightSafetyItem["key"], string]> = [
    ["signature", "Digital signature structure"], ["forms", "AcroForm fields"], ["metadata", "Metadata and XMP"],
    ["attachments", "Embedded files"], ["external-links", "External URI links"],
    ["comments", "Comments and review marks"], ["hidden-text", "Searchable or invisible text signals"],
  ];
  return items.map(([key, label]) => ({ key, label, checked: false, summary: "Not checked - " + reason }));
}
function safetyFromPrivacy(inspection: PrivacyInspection): PreflightSafetyItem[] {
  const groups = groupPrivacyFindings(inspection);
  const count = (key: string) => groups.find(group => group.key === key)?.findings.length ?? 0;
  return [
    { key: "signature", label: "Digital signature structure", checked: true, count: inspection.signed ? 1 : 0,
      summary: inspection.signed ? "Digital signature structure detected. Rewriting can invalidate an existing signature." : "No digital signature structure detected by the bounded inspection." },
    { key: "forms", label: "AcroForm fields", checked: true, count: count("forms"), summary: count("forms") + " form-related finding(s). Forms are review-only." },
    { key: "metadata", label: "Metadata and XMP", checked: true, count: count("metadata"), summary: count("metadata") + " metadata finding(s). Removal is optional." },
    { key: "attachments", label: "Embedded files", checked: true, count: count("attachments"), summary: count("attachments") + " embedded-file finding(s). Removal requires approval." },
    { key: "external-links", label: "External URI links", checked: true, count: count("externalLinks"), summary: count("externalLinks") + " external-link finding(s). Removal requires approval." },
    { key: "comments", label: "Comments and review marks", checked: true, count: count("comments"), summary: count("comments") + " review annotation finding(s). Removal can change visible review markup." },
    { key: "hidden-text", label: "Searchable or invisible text signals", checked: true, count: count("hiddenText"), summary: count("hiddenText") + " text-layer finding(s). Reported for review only." },
  ];
}
function encryptedResult(file: File, requirements: PreflightRequirements): PreflightInspection {
  const reason = "password protection prevented structural inspection";
  const maximumBytes = requirements.maximumSizeMb ? requirements.maximumSizeMb * 1024 * 1024 : undefined;
  const checks: PreflightCheck[] = [
    { key: "file-size", label: "Maximum file size", state: maximumBytes ? (file.size <= maximumBytes ? "pass" : "fail") : "not-checked",
      summary: maximumBytes ? (file.size / 1024 / 1024).toFixed(2) + " MB against " + requirements.maximumSizeMb + " MB." : "No maximum selected." },
    { key: "page-count", label: "Maximum page count", state: "not-checked", summary: "Not checked - the encrypted PDF could not be opened." },
    { key: "page-size", label: "Required page size", state: "not-checked", summary: "Not checked - the encrypted PDF could not be opened." },
    { key: "encryption", label: "No encryption/password protection", state: "fail", summary: "Password protection or encryption detected." },
    { key: "active-actions", label: "No JavaScript or dangerous actions", state: "not-checked", summary: "Not checked - the encrypted PDF could not receive privacy inspection." },
  ];
  return { filename: file.name, fileSize: file.size, pageSizes: [], requirements, checks, safety: notCheckedSafety(reason), privacyUnavailableReason: reason, signed: null };
}

export async function inspectPdfPreflight(file: File, requirements: PreflightRequirements, dependencies: Dependencies = {}): Promise<PreflightInspection> {
  const load = dependencies.load ?? loadPdfDocument;
  const inspectPrivacy = dependencies.inspectPrivacy ?? inspectPdfPrivacy;
  let document;
  try { document = await load(file); }
  catch (caught) {
    if (caught instanceof PdfProcessingError && caught.code === "encrypted-pdf") return encryptedResult(file, requirements);
    throw caught;
  }
  const pages = document.getPages();
  const pageSizes = pages.map((page, index) => {
    const { width, height } = page.getSize();
    return { page: index + 1, widthPoints: width, heightPoints: height, rotation: page.getRotation().angle, matches: pageMatches(width, height, requirements.requiredPageSize) };
  });
  let privacyInspection: PrivacyInspection | undefined;
  let privacyUnavailableReason: string | undefined;
  try { privacyInspection = await inspectPrivacy(file); }
  catch (caught) { privacyUnavailableReason = caught instanceof Error ? caught.message : "privacy inspection was unavailable"; }
  const signed = privacyInspection ? privacyInspection.signed : null;
  const maximumBytes = requirements.maximumSizeMb ? requirements.maximumSizeMb * 1024 * 1024 : undefined;
  const sizePasses = maximumBytes ? file.size <= maximumBytes : true;
  const activeCount = privacyInspection ? groupPrivacyFindings(privacyInspection).find(group => group.key === "activeContent")?.findings.length ?? 0 : undefined;
  const mismatches = pageSizes.filter(page => !page.matches);
  const checks: PreflightCheck[] = [
    { key: "file-size", label: "Maximum file size",
      state: !maximumBytes ? "not-checked" : sizePasses ? "pass" : signed === false ? "can-fix" : "needs-decision",
      summary: !maximumBytes ? "No maximum selected." : (file.size / 1024 / 1024).toFixed(2) + " MB against " + requirements.maximumSizeMb + " MB." + (sizePasses ? "" : signed ? " Signed PDFs are not rewritten automatically." : privacyInspection ? " Structure optimization can be tried." : " Signature status was not checked, so automatic rewriting is unavailable.") },
    { key: "page-count", label: "Maximum page count",
      state: requirements.maximumPages === undefined ? "not-checked" : pages.length <= requirements.maximumPages ? "pass" : "fail",
      summary: requirements.maximumPages === undefined ? "No maximum selected." : pages.length + " page(s) against " + requirements.maximumPages + "." },
    { key: "page-size", label: "Required page size",
      state: requirements.requiredPageSize === "any" ? "not-checked" : mismatches.length ? "fail" : "pass",
      summary: requirements.requiredPageSize === "any" ? "Any page size allowed." : mismatches.length ? mismatches.length + " page(s) do not match " + requirements.requiredPageSize.toUpperCase() + ". Pages are not resized automatically." : "All pages match " + requirements.requiredPageSize.toUpperCase() + " within 3 points." },
    { key: "encryption", label: "No encryption/password protection", state: "pass", summary: "The PDF opened without a password." },
    { key: "active-actions", label: "No JavaScript or dangerous actions",
      state: !requirements.disallowActiveActions ? "not-checked" : activeCount === undefined ? "not-checked" : activeCount ? (signed ? "needs-decision" : "can-fix") : "pass",
      summary: !requirements.disallowActiveActions ? "This requirement is turned off." : activeCount === undefined ? "Not checked - " + privacyUnavailableReason + "." : activeCount ? activeCount + " dangerous active-action finding(s)." + (signed ? " Signed PDFs are not rewritten automatically." : " Existing sanitization can remove and verify them.") : "No dangerous active actions detected by the bounded inspection." },
  ];
  return {
    filename: file.name, fileSize: file.size, pageCount: pages.length, pageSizes, requirements, checks,
    safety: privacyInspection ? safetyFromPrivacy(privacyInspection) : notCheckedSafety(privacyUnavailableReason ?? "privacy inspection was unavailable"),
    privacyInspection, privacyUnavailableReason, signed,
  };
}
