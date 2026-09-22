import { inspectPdfPrivacy } from "./privacy-inspect";
import { REVIEW_ANNOTATION_SUBTYPES } from "./privacy-objects";
import {
  sanitizePdfActiveActions,
  sanitizePdfAttachments,
  sanitizePdfExternalLinks,
  sanitizePdfMetadata,
  sanitizePdfReviewAnnotations,
} from "./privacy-sanitize";
import type { PrivacyFinding, PrivacyInspection, PrivacyRemovalStatus } from "./privacy-types";

export type PrivacySelection = {
  metadata: boolean;
  attachments: boolean;
  activeContent: boolean;
  comments: boolean;
  externalLinks: boolean;
};

export type PrivacyGroupKey = keyof PrivacySelection | "forms" | "hiddenText" | "redactionRisk" | "layersOther";
export type PrivacyGroup = {
  key: PrivacyGroupKey;
  title: string;
  description: string;
  supported: boolean;
  findings: PrivacyFinding[];
};

export type PrivacyStepResult = {
  key: keyof PrivacySelection;
  title: string;
  status: PrivacyRemovalStatus;
  beforeCount: number;
  afterCount: number;
  warnings: string[];
};

export type PrivacyWorkflowResult = {
  blob: Blob;
  filename: string;
  inspection: PrivacyInspection;
  signed: boolean;
  steps: PrivacyStepResult[];
};

export const EMPTY_PRIVACY_SELECTION: PrivacySelection = {
  metadata: false,
  attachments: false,
  activeContent: false,
  comments: false,
  externalLinks: false,
};

const dangerousActionTitles = new Set(["JavaScript action", "Launch action"]);

function isReviewComment(finding: PrivacyFinding) {
  return finding.category === "annotation" && typeof finding.evidence?.subtype === "string" &&
    REVIEW_ANNOTATION_SUBTYPES.has(finding.evidence.subtype);
}

export function groupPrivacyFindings(inspection: PrivacyInspection): PrivacyGroup[] {
  const matching = (predicate: (finding: PrivacyFinding) => boolean) => inspection.findings.filter(predicate);
  return [
    { key: "metadata", title: "Metadata", description: "Document properties and XMP history or identity fields.", supported: true,
      findings: matching(finding => finding.category === "metadata" || finding.category === "xmp") },
    { key: "attachments", title: "Embedded files", description: "Files stored inside or associated with the PDF.", supported: true,
      findings: matching(finding => finding.category === "attachment") },
    { key: "activeContent", title: "Active actions", description: "JavaScript and Launch actions that can run in supporting viewers.", supported: true,
      findings: matching(finding => finding.category === "active-content" && dangerousActionTitles.has(finding.title)) },
    { key: "comments", title: "Comments and review marks", description: "Review annotations such as notes, highlights, ink, stamps, and replies.", supported: true,
      findings: matching(isReviewComment) },
    { key: "externalLinks", title: "External links", description: "External clickable links can be removed while internal page links are preserved.", supported: true,
      findings: matching(finding => finding.category === "external-link") },
    { key: "forms", title: "Forms", description: "Form structures and stored values are inspection-only in this version.", supported: false,
      findings: matching(finding => finding.category === "form" || (finding.category === "annotation" && finding.evidence?.subtype === "Widget")) },
    { key: "hiddenText", title: "Hidden text", description: "Invisible, OCR, or off-page text is reported without automatic removal.", supported: false,
      findings: matching(finding => finding.category === "hidden-text") },
    { key: "redactionRisk", title: "Redaction risks", description: "Evidence-based possible live text beneath dark covers; manual review is required.", supported: false,
      findings: matching(finding => finding.category === "redaction-risk") },
    { key: "layersOther", title: "Layers and other traces", description: "Optional layers, thumbnails, image metadata signals, and unsupported annotations.", supported: false,
      findings: matching(finding => ["optional-content", "thumbnail", "image-metadata"].includes(finding.category) ||
        (finding.category === "annotation" && !isReviewComment(finding) && finding.evidence?.subtype !== "Widget")) },
  ];
}

export function quickCleanSelection(inspection: PrivacyInspection): PrivacySelection {
  const groups = groupPrivacyFindings(inspection);
  const count = (key: PrivacyGroupKey) => groups.find(group => group.key === key)?.findings.length ?? 0;
  return { metadata: count("metadata") > 0, attachments: count("attachments") > 0,
    activeContent: count("activeContent") > 0, comments: false, externalLinks: false };
}

export function makeSanitizedPrivacyFilename(name: string) {
  const stem = name.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
  return `${stem}-sanitized.pdf`;
}

type WorkflowOperations = {
  metadata: typeof sanitizePdfMetadata;
  attachments: typeof sanitizePdfAttachments;
  activeContent: typeof sanitizePdfActiveActions;
  comments: typeof sanitizePdfReviewAnnotations;
  externalLinks: typeof sanitizePdfExternalLinks;
  inspect: typeof inspectPdfPrivacy;
};

const defaultOperations: WorkflowOperations = {
  metadata: sanitizePdfMetadata,
  attachments: sanitizePdfAttachments,
  activeContent: sanitizePdfActiveActions,
  comments: sanitizePdfReviewAnnotations,
  externalLinks: sanitizePdfExternalLinks,
  inspect: inspectPdfPrivacy,
};

function combinedStatus(statuses: PrivacyRemovalStatus[]): PrivacyRemovalStatus {
  if (statuses.includes("removal-failed")) return "removal-failed";
  if (statuses.includes("could-not-verify")) return "could-not-verify";
  return "verified-removed";
}

function groupCount(inspection: PrivacyInspection | undefined, key: keyof PrivacySelection) {
  return inspection ? groupPrivacyFindings(inspection).find(group => group.key === key)?.findings.length ?? 0 : 0;
}

export async function runPrivacySanitization(
  source: File,
  selection: PrivacySelection,
  onStage?: (key: keyof PrivacySelection | "verifying", completed: number, total: number) => void,
  operations: WorkflowOperations = defaultOperations,
): Promise<PrivacyWorkflowResult> {
  const queue = (Object.keys(selection) as Array<keyof PrivacySelection>).filter(key => selection[key]);
  if (!queue.length) throw new Error("Choose at least one supported item to remove.");
  let current = source;
  let signed = false;
  const steps: PrivacyStepResult[] = [];
  const titles: Record<keyof PrivacySelection, string> = {
    metadata: "Metadata & XMP", attachments: "Embedded files", activeContent: "JavaScript / Launch actions",
    comments: "Comments and review marks", externalLinks: "External links",
  };
  for (let index = 0; index < queue.length; index++) {
    const key = queue[index];
    onStage?.(key, index, queue.length + 1);
    const result = await operations[key](current);
    signed ||= result.signed;
    const verification = result.verification;
    const statuses: PrivacyRemovalStatus[] = "metadata" in verification
      ? [verification.metadata, verification.xmp]
      : "attachments" in verification ? [verification.attachments]
        : "activeContent" in verification ? [verification.activeContent]
          : "externalLinks" in verification ? [verification.externalLinks]
            : [verification.annotations];
    steps.push({ key, title: titles[key], status: combinedStatus(statuses),
      beforeCount: groupCount(result.before, key), afterCount: groupCount(result.after, key), warnings: verification.warnings });
    current = new File([result.blob], makeSanitizedPrivacyFilename(source.name), { type: "application/pdf" });
  }
  onStage?.("verifying", queue.length, queue.length + 1);
  const inspection = await operations.inspect(current);
  return { blob: current.slice(0, current.size, "application/pdf"), filename: makeSanitizedPrivacyFilename(source.name), inspection, signed, steps };
}
