import { compressPdfFile } from "@/lib/pdf/compress";
import { runPrivacySanitization, type PrivacySelection } from "@/lib/pdf/privacy-workflow";
import { inspectPdfPreflight } from "./inspect";
import type { PreflightApproval, PreflightInspection, PreflightRequirements, PreflightRunResult } from "./types";

type Dependencies = { inspect?: typeof inspectPdfPreflight; sanitize?: typeof runPrivacySanitization; compress?: typeof compressPdfFile };
function outputName(name: string) {
  const stem = name.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
  return stem + "-preflight.pdf";
}

export async function runApprovedPreflight(
  source: File, before: PreflightInspection, requirements: PreflightRequirements,
  approval: PreflightApproval, dependencies: Dependencies = {},
): Promise<PreflightRunResult> {
  const inspect = dependencies.inspect ?? inspectPdfPreflight;
  const sanitize = dependencies.sanitize ?? runPrivacySanitization;
  const compress = dependencies.compress ?? compressPdfFile;
  if (!Object.values(approval).some(Boolean)) throw new Error("Approve at least one supported change.");
  if (before.signed !== false) throw new Error(before.signed ? "Digital signature structure detected. Automatic rewriting is disabled." : "Signature status was not checked. Automatic rewriting is disabled.");
  let current = source;
  let changed = false;
  const steps: PreflightRunResult["steps"] = [];
  const selection: PrivacySelection = {
    metadata: approval.removeMetadata, attachments: approval.removeAttachments,
    activeContent: approval.removeActiveActions, comments: approval.removeComments,
    externalLinks: approval.removeExternalLinks,
  };
  if (Object.values(selection).some(Boolean)) {
    const result = await sanitize(current, selection);
    current = new File([result.blob], result.filename, { type: "application/pdf" });
    changed = true;
    for (const step of result.steps) steps.push({
      key: "privacy", label: step.title, status: step.status,
      summary: step.beforeCount + " before -> " + step.afterCount + " after",
    });
  }
  let compression: PreflightRunResult["compression"];
  if (approval.tryStructureOptimization) {
    const result = await compress({ file: current, level: "light" });
    const candidate = new File([result.blob], result.filename, { type: "application/pdf" });
    const candidateInspection = await inspect(candidate, requirements);
    compression = {
      inputBytes: result.originalSize, outputBytes: result.size, savedBytes: result.savedBytes,
      savedPercentage: result.savedPercentage, hasSavings: result.hasSavings, candidateInspection,
    };
    if (result.hasSavings) {
      current = candidate;
      changed = true;
      steps.push({ key: "compression", label: "Structure optimization", status: "applied", summary: "Saved " + result.savedBytes.toLocaleString() + " bytes (" + result.savedPercentage.toFixed(1) + "%)." });
    } else {
      steps.push({ key: "compression", label: "Structure optimization", status: "no-savings", summary: "No useful file-size savings occurred; the larger candidate was not adopted." });
    }
  }
  const after = await inspect(current, requirements);
  const sizeStillFails = requirements.maximumSizeMb !== undefined && after.checks.find(check => check.key === "file-size")?.state !== "pass";
  return {
    blob: current.slice(0, current.size, "application/pdf"), filename: outputName(source.name), before, after, steps, changed,
    compression, furtherCompressionNeedsDecision: Boolean(approval.tryStructureOptimization && (compression?.hasSavings === false || sizeStillFails)),
  };
}
