import type { PDFDocumentProxy } from "pdfjs-dist";

export const BATCH_LIMITS = Object.freeze({ csvBytes: 1024 * 1024, records: 200, columns: 50,
  cellCharacters: 4096, pdfBytes: 25 * 1024 * 1024, pages: 200, itemsPerPage: 20_000, textCharacters: 1_000_000 });
export type SourceRow = Readonly<{ physicalRow: number; cells: readonly string[]; key: string; normalizedKey: string }>;
export type Source = Readonly<{ headers: readonly string[]; keyColumn: number; rows: readonly SourceRow[] }>;
export type NumberRule = Readonly<{ decimal: "." | ","; grouping: "," | "." | ""; currency?: string; maxFractionDigits: number }>;
export type FieldRule = Readonly<{ column: number; anchor: string; mode: "exact" | "number"; number?: NumberRule }>;
export type Configuration = Readonly<{ fields: readonly FieldRule[]; keyAnchor?: string }>;
export type Box = Readonly<{ left: number; top: number; width: number; height: number }>;
export type Item = Readonly<{ index: number; text: string; transform: readonly number[]; width: number; height: number;
  x: number; y: number; advance: number; size: number; box: Box }>;
export type Span = Readonly<{ text: string; itemIndices: readonly number[]; boxes: readonly Box[];
  parts: readonly { index: number; start: number; end: number }[] }>;
export type PageEvidence = Readonly<{ page: number; width: number; height: number; rotation: number;
  rawItems: readonly unknown[]; items: readonly Item[]; spans: readonly Span[]; warnings: readonly string[]; visibilityReview: boolean; blank: boolean }>;
export type PdfEvidence = Readonly<{ pages: readonly PageEvidence[]; limitations: readonly string[] }>;
export type Evidence = Readonly<{ page: number; text: string; itemIndices: readonly number[]; boxes: readonly Box[] }>;
export type FieldFinding = Readonly<{ column: number; expected: string; observed: readonly string[];
  status: "PASS" | "FIELD MISSING" | "FIELD MISMATCH" | "AMBIGUOUS FIELD"; evidence: readonly Evidence[] }>;
export type PageFinding = Readonly<{ page: number; key: string | null; candidates: readonly string[];
  status: "PASS" | "FIELD REVIEW" | "AMBIGUOUS KEY" | "UNRESOLVED OUTPUT PAGE" | "UNSUPPORTED VISIBILITY / REVIEW";
  keyEvidence: readonly Evidence[]; fields: readonly FieldFinding[]; blank: boolean }>;
export type SourceFinding = Readonly<{ physicalRow: number; key: string; pages: readonly number[];
  status: "PASS" | "MISSING OUTPUT RECORD" | "DUPLICATE OUTPUT RECORD" | "REVIEW" }>;
export type Summary = Readonly<{ sourceRecordCount: number; passedSourceRecords: number; failedOrReviewSourceRecords: number;
  missingSourceRecords: number; duplicateOutputInstances: number; unresolvedOutputPages: number; blankPages: number;
  ambiguousPages: number; assignedOutputPages: number; outputPageCount: number; visibilityReviewPages: number }>;
export type RendererOpener = (file: File) => Promise<PDFDocumentProxy>;
