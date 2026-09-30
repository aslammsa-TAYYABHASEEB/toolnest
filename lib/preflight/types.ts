import type { PrivacyInspection, PrivacyRemovalStatus } from "@/lib/pdf/privacy-types";

export type PreflightState = "pass" | "fail" | "can-fix" | "needs-decision" | "not-checked";
export type RequiredPageSize = "any" | "a4" | "letter";
export type PreflightRequirements = { maximumSizeMb?: number; maximumPages?: number; requiredPageSize: RequiredPageSize; disallowActiveActions: boolean };
export type PreflightCheck = { key: "file-size" | "page-count" | "page-size" | "encryption" | "active-actions"; label: string; state: PreflightState; summary: string };
export type PreflightPageSize = { page: number; widthPoints: number; heightPoints: number; rotation: number; matches: boolean };
export type PreflightSafetyKey = "signature" | "forms" | "metadata" | "attachments" | "external-links" | "comments" | "hidden-text";
export type PreflightSafetyItem = { key: PreflightSafetyKey; label: string; checked: boolean; count?: number; summary: string };
export type PreflightInspection = {
  filename: string; fileSize: number; pageCount?: number; pageSizes: PreflightPageSize[]; requirements: PreflightRequirements;
  checks: PreflightCheck[]; safety: PreflightSafetyItem[]; privacyInspection?: PrivacyInspection;
  privacyUnavailableReason?: string; signed: boolean | null;
};
export type PreflightApproval = {
  removeActiveActions: boolean; removeMetadata: boolean; removeAttachments: boolean;
  removeExternalLinks: boolean; removeComments: boolean; tryStructureOptimization: boolean;
};
export type PreflightChangeStep = {
  key: "privacy" | "compression"; label: string;
  status: PrivacyRemovalStatus | "applied" | "no-savings"; summary: string;
};
export type PreflightRunResult = {
  blob: Blob; filename: string; before: PreflightInspection; after: PreflightInspection;
  steps: PreflightChangeStep[]; changed: boolean;
  compression?: { inputBytes: number; outputBytes: number; savedBytes: number; savedPercentage: number; hasSavings: boolean; candidateInspection: PreflightInspection };
  furtherCompressionNeedsDecision: boolean;
};
