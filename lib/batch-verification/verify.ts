import { normalizeText, decimalValue } from "./normalization";
import { isIdentifierLikeColumnHeading } from "@/lib/pdf/cell-semantics";
import type { Configuration, Evidence, FieldFinding, PageFinding, PdfEvidence, Source, SourceFinding, Span, Summary } from "./types";

const evidence = (page: number, span: Span): Evidence => Object.freeze({ page, text: span.text, itemIndices: span.itemIndices, boxes: span.boxes });
// Conservatively retain common identifier/decimal separators inside tokens.
const tokenCharacter = (value: string) => /[\p{L}\p{N}\p{M}_.\/-]/u.test(value);
function occurrences(text: string, key: string) {
  const normalized = normalizeText(text); let count = 0, from = 0;
  while (from <= normalized.length) {
    const at = normalized.indexOf(key, from); if (at < 0) break;
    const before = Array.from(normalized.slice(0, at)).at(-1), after = Array.from(normalized.slice(at + key.length))[0];
    if ((!before || !tokenCharacter(before)) && (!after || !tokenCharacter(after))) count++;
    from = at + Math.max(1, key.length);
  }
  return count;
}
const anchored = (span: Span, anchor: string) => {
  const text = normalizeText(span.text), label = normalizeText(anchor);
  return text.startsWith(label) ? normalizeText(text.slice(label.length)) : null;
};

export function verifyBatch(source: Source, pdf: PdfEvidence, configuration: Configuration) {
  if (!configuration.fields.length || configuration.fields.length > 10 || configuration.fields.some(f =>
    !Number.isInteger(f.column) || f.column < 0 || f.column >= source.headers.length || !normalizeText(f.anchor).endsWith(":") ||
    (f.mode === "number" && (!f.number || f.column === source.keyColumn || isIdentifierLikeColumnHeading(source.headers[f.column]))))) throw new Error("Invalid explicit field configuration");
  if (new Set(configuration.fields.map(f => normalizeText(f.anchor))).size !== configuration.fields.length ||
    new Set(configuration.fields.map(f => f.column)).size !== configuration.fields.length) throw new Error("Duplicate field configuration");
  if (configuration.keyAnchor && !normalizeText(configuration.keyAnchor).endsWith(":")) throw new Error("Key anchor must end with colon");
  const pages: PageFinding[] = pdf.pages.map(page => {
    const hits = source.rows.map(row => ({ row, spans: page.spans.flatMap(span => {
      const count = occurrences(span.text, row.normalizedKey);
      return Array.from({length:count}, () => span);
    }) })).filter(hit => hit.spans.length);
    let selected = hits.length === 1 ? hits[0] : undefined;
    if (selected && configuration.keyAnchor) {
      const authoritative = page.spans.filter(span => anchored(span, configuration.keyAnchor!) === selected!.row.normalizedKey);
      selected = authoritative.length === 1 ? { ...selected, spans: authoritative } : undefined;
    } else if (selected && selected.spans.length !== 1) selected = undefined;
    const ambiguous = hits.length > 0 && !selected;
    const fields: FieldFinding[] = selected ? configuration.fields.map(rule => {
      const candidates = page.spans.map(span => ({ span, value: anchored(span, rule.anchor) })).filter(candidate => candidate.value !== null);
      const expected = selected!.row.cells[rule.column], observed = candidates.map(candidate => candidate.value!);
      let status: FieldFinding["status"] = "FIELD MISSING";
      if (candidates.length > 1) status = "AMBIGUOUS FIELD";
      else if (candidates.length === 1 && observed[0] !== "") {
        const same = rule.mode === "exact" ? normalizeText(expected) === normalizeText(observed[0]) :
          decimalValue(expected, rule.number!) !== null && decimalValue(expected, rule.number!) === decimalValue(observed[0], rule.number!);
        status = same ? "PASS" : "FIELD MISMATCH";
      }
      return Object.freeze({ column: rule.column, expected, observed: Object.freeze(observed), status,
        evidence: Object.freeze(candidates.map(candidate => evidence(page.page, candidate.span))) });
    }) : [];
    return Object.freeze({ page: page.page, key: selected?.row.normalizedKey ?? null, candidates: Object.freeze(hits.map(hit => hit.row.normalizedKey)),
      status: page.visibilityReview ? "UNSUPPORTED VISIBILITY / REVIEW" : ambiguous ? "AMBIGUOUS KEY" : !selected ? "UNRESOLVED OUTPUT PAGE" :
        fields.every(field => field.status === "PASS") ? "PASS" : "FIELD REVIEW",
      keyEvidence: Object.freeze((selected?.spans ?? hits.flatMap(hit => hit.spans)).map(span => evidence(page.page, span))), fields: Object.freeze(fields), blank: page.blank });
  });
  const rows: SourceFinding[] = source.rows.map(row => {
    const assigned = pages.filter(page => page.key === row.normalizedKey);
    const uncertain = pages.some(page => !page.key && page.candidates.includes(row.normalizedKey));
    return Object.freeze({ physicalRow: row.physicalRow, key: row.key, pages: Object.freeze(assigned.map(page => page.page)),
      status: assigned.length > 1 ? "DUPLICATE OUTPUT RECORD" : uncertain ? "REVIEW" : !assigned.length ? "MISSING OUTPUT RECORD" : assigned[0].status === "PASS" ? "PASS" : "REVIEW" });
  });
  const countRows = (status: SourceFinding["status"]) => rows.filter(row => row.status === status).length;
  const summary: Summary = Object.freeze({ sourceRecordCount: rows.length, passedSourceRecords: countRows("PASS"),
    failedOrReviewSourceRecords: countRows("REVIEW") + countRows("DUPLICATE OUTPUT RECORD"), missingSourceRecords: countRows("MISSING OUTPUT RECORD"),
    duplicateOutputInstances: rows.reduce((sum,row) => sum + Math.max(0,row.pages.length-1),0),
    unresolvedOutputPages: pages.filter(page => page.key === null && page.candidates.length === 0).length,
    blankPages: pages.filter(page => page.blank).length, ambiguousPages: pages.filter(page => page.key === null && page.candidates.length > 0).length,
    assignedOutputPages: pages.filter(page => page.key !== null).length, outputPageCount: pages.length,
    visibilityReviewPages: pages.filter(page => page.status === "UNSUPPORTED VISIBILITY / REVIEW").length });
  if (summary.sourceRecordCount !== summary.passedSourceRecords + summary.failedOrReviewSourceRecords + summary.missingSourceRecords ||
    summary.outputPageCount !== summary.assignedOutputPages + summary.unresolvedOutputPages + summary.ambiguousPages) throw new Error("Batch accounting invariant failed");
  return Object.freeze({ rows: Object.freeze(rows), pages: Object.freeze(pages), summary, limitations: pdf.limitations });
}
