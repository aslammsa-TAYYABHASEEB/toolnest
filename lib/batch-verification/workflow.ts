import { validatePdfFile } from "@/lib/pdf/validation";
import { isIdentifierLikeColumnHeading } from "@/lib/pdf/cell-semantics";
import { parseCsvSource } from "./csv-source";
import { decimalValue, normalizeText } from "./normalization";
import { extractBatchPdfEvidence } from "./pdf-evidence";
import { verifyBatch } from "./verify";
import { BATCH_LIMITS, type Configuration, type Source, type RendererOpener } from "./types";

export const BATCH_COPY = {
  pass: "Supported extracted-text checks passed under the configured verification rules.",
  disclosure: "PDF text extraction does not prove that every matching value is visibly rendered exactly as expected.",
  unsupported: "This version requires a searchable/native-text PDF.",
};

export function validateBatchSetup(source: Source, config: Configuration) {
  if (!normalizeText(config.keyAnchor ?? "").endsWith(":")) throw new Error("Enter a record-key label ending in a colon, for example Employee ID:");
  if (!config.fields.length || config.fields.length > 10) throw new Error("Select between 1 and 10 fields.");
  const anchors = new Set<string>(), columns = new Set<number>();
  for (const field of config.fields) {
    const anchor = normalizeText(field.anchor);
    if (!Number.isInteger(field.column) || field.column < 0 || field.column >= source.headers.length || field.column === source.keyColumn) throw new Error("Select a non-key source column for each field.");
    if (!anchor.endsWith(":")) throw new Error("Every field label must end in a colon.");
    if (anchors.has(anchor) || columns.has(field.column) || anchor === normalizeText(config.keyAnchor!)) throw new Error("Each key/field label and field column must be distinct.");
    anchors.add(anchor); columns.add(field.column);
    if (field.mode !== "exact" && field.mode !== "number") throw new Error("Unsupported comparison mode.");
    if (field.mode === "number") {
      if (isIdentifierLikeColumnHeading(source.headers[field.column])) throw new Error("Identifier columns must use Exact text.");
      if (!field.number || ![".",","].includes(field.number.decimal) || ![".",",",""].includes(field.number.grouping) || ![0,2,3,4].includes(field.number.maxFractionDigits)) throw new Error("Choose a supported explicit number format.");
      decimalValue("0",field.number);
      if (source.rows.some(row => decimalValue(row.cells[field.column],field.number!) === null)) throw new Error("A source value is not numeric under this rule. Use Exact text or correct the format settings.");
    }
  }
}

/** Replacement, configuration edits and reset all invalidate in-flight receipts. */
export function createBatchRunGate() {
  let generation = 0, controller: AbortController | null = null;
  const invalidate = () => { generation++; controller?.abort(); controller = null; };
  return { invalidate, begin() { invalidate(); controller = new AbortController(); const selected = generation, signal = controller.signal;
    return { signal, current: () => generation === selected && !signal.aborted }; } };
}

export async function runBatchVerification(bytes: Uint8Array, keyColumn: number, file: File, config: Configuration,
  context: { signal?: AbortSignal; onPage?: (page: number) => void } = {}, open?: RendererOpener) {
  const source = parseCsvSource(bytes,keyColumn);
  validateBatchSetup(source,config);
  if (file.size > BATCH_LIMITS.pdfBytes) throw new Error("PDF exceeds the 25 MiB limit.");
  await validatePdfFile(file);
  const pdf = await extractBatchPdfEvidence(file,open,context);
  if (pdf.pages.some(page => !page.blank && !page.items.some(item => item.text.trim()))) throw new Error(BATCH_COPY.unsupported + " Image-only pages cannot be checked without OCR; this tool does not run OCR.");
  if (context.signal?.aborted) throw new Error("Verification cancelled");
  // Matching is synchronous and bounded; the UI publishes only a current generation.
  const configuration = Object.freeze({ ...config, fields: Object.freeze(config.fields.map(field => Object.freeze({ ...field,
    ...(field.number ? { number: Object.freeze({ ...field.number }) } : {}) }))) });
  return Object.freeze({ source, pdf, configuration, result: verifyBatch(source,pdf,configuration), file });
}

export type BatchRun = Awaited<ReturnType<typeof runBatchVerification>>;
/** Display comparison values separately; never replace raw evidence. */
export function batchComparisonValue(text: string, rule: Configuration["fields"][number]) {
  if (rule.mode === "exact") return normalizeText(text);
  const value = decimalValue(text,rule.number!);
  if (value === null) return "Not numeric under this rule";
  const places = rule.number!.maxFractionDigits;
  const digits = (value < BigInt(0) ? -value : value).toString().padStart(places+1,"0");
  return (value < BigInt(0) ? "-" : "") + (places ? digits.slice(0,-places)+"."+digits.slice(-places) : digits);
}
export function batchSourceOutcome(run: BatchRun, key: string) {
  const row = run.result.rows.find(row => normalizeText(row.key) === key);
  if (!row) return "REVIEW";
  if (row.status !== "REVIEW") return row.status;
  const pages = run.result.pages.filter(page => page.key === key || page.candidates.includes(key));
  if (pages.some(page => page.status === "UNSUPPORTED VISIBILITY / REVIEW")) return "VISIBILITY REVIEW";
  if (pages.some(page => page.status === "AMBIGUOUS KEY")) return "AMBIGUOUS KEY";
  return pages.flatMap(page => page.fields).find(field => field.status !== "PASS")?.status ?? "REVIEW";
}
