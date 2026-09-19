export type PrivacyCategory =
  | "metadata" | "xmp" | "attachment" | "active-content" | "annotation"
  | "external-link" | "form" | "hidden-text" | "redaction-risk"
  | "optional-content" | "thumbnail" | "image-metadata";

export type PrivacyConcern = "high" | "review" | "informational";
export type PrivacyConfidence = "high" | "medium" | "low";
export type PrivacyRemoval = "supported-later" | "inspect-only" | "unsupported";
export type PrivacyCoverageState = "inspected" | "inspection-only" | "partial" | "unsupported";

export type PrivacyFinding = {
  id: string;
  category: PrivacyCategory;
  title: string;
  description: string;
  concern: PrivacyConcern;
  rationale: string;
  confidence: PrivacyConfidence;
  page?: number;
  objectPath?: string;
  objectRef?: string;
  evidence?: Record<string, string | number | boolean>;
  removal: PrivacyRemoval;
  functionalityImpact?: string;
  verificationMethod?: string;
  technicalNotes?: string;
};

export type PrivacyCoverage = { category: PrivacyCategory; state: PrivacyCoverageState; note?: string };
export type PrivacyInspection = {
  pageCount: number;
  signed: boolean;
  findings: PrivacyFinding[];
  coverage: PrivacyCoverage[];
  limits: { fileBytes: number; objects: number; pages: number };
  warnings: string[];
};

export type PrivacyRemovalStatus = "verified-removed" | "removal-failed" | "could-not-verify";
export type MetadataSanitizationVerification = {
  metadata: PrivacyRemovalStatus;
  xmp: PrivacyRemovalStatus;
  pageCountPreserved: boolean;
  parseable: boolean;
  remainingMetadataFindings: number;
  warnings: string[];
};

export type AttachmentSanitizationVerification = {
  attachments: PrivacyRemovalStatus;
  pageCountPreserved: boolean;
  parseable: boolean;
  remainingAttachmentFindings: number;
  remainingAttachmentStructures: number;
  warnings: string[];
};

export type ActiveActionSanitizationVerification = {
  activeContent: PrivacyRemovalStatus;
  pageCountPreserved: boolean;
  parseable: boolean;
  remainingActiveContentFindings: number;
  remainingActiveContentStructures: number;
  warnings: string[];
};

export type AnnotationSanitizationVerification = {
  annotations: PrivacyRemovalStatus;
  pageCountPreserved: boolean;
  parseable: boolean;
  remainingCommentFindings: number;
  remainingCommentStructures: number;
  warnings: string[];
};
