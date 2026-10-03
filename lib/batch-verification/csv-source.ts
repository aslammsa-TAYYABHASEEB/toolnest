import { BATCH_LIMITS, type Source } from "./types";
import { normalizeText } from "./normalization";

/** RFC-style comma/quote grammar. Physical start lines survive multiline cells. */
export function parseCsvSource(bytes: Uint8Array, keyColumn: number): Source {
  if (!bytes.length || bytes.length > BATCH_LIMITS.csvBytes) throw new Error("CSV byte limit");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const rows: { physicalRow: number; cells: string[] }[] = [];
  let cells: string[] = [], value = "", state: "start" | "plain" | "quoted" | "closed" = "start", line = 1, startLine = 1;
  const cell = () => { cells.push(value); value = ""; state = "start"; if (cells.length > BATCH_LIMITS.columns) throw new Error("CSV column limit"); };
  const row = () => { cell(); rows.push({ physicalRow: startLine, cells }); cells = []; if (rows.length > BATCH_LIMITS.records + 1) throw new Error("CSV record limit"); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else state = "closed"; }
      else if (char === "\r" || char === "\n") { value += char; if (char === "\r" && text[i + 1] === "\n") { value += "\n"; i++; } line++; }
      else value += char;
    } else if (char === ",") cell();
    else if (char === "\r" || char === "\n") { row(); if (char === "\r" && text[i + 1] === "\n") i++; line++; startLine = line; }
    else if (char === '"' && state === "start") state = "quoted";
    else { if (state === "closed" || char === '"') throw new Error("Malformed CSV quoting"); value += char; state = "plain"; }
    if (value.length > BATCH_LIMITS.cellCharacters) throw new Error("CSV cell limit");
  }
  if (state === "quoted") throw new Error("Unterminated CSV quote");
  if (cells.length || value || state !== "start") row();
  if (rows.length < 2) throw new Error("CSV requires headers and records");
  const headers = rows.shift()!.cells;
  if (headers.some(header => !normalizeText(header)) || new Set(headers.map(normalizeText)).size !== headers.length) throw new Error("Invalid CSV headers");
  if (!Number.isInteger(keyColumn) || keyColumn < 0 || keyColumn >= headers.length) throw new Error("Invalid key column");
  const keys = new Set<string>();
  const records = rows.map(row => {
    if (row.cells.length !== headers.length) throw new Error("CSV row width mismatch");
    const key = row.cells[keyColumn], normalizedKey = normalizeText(key);
    if (!normalizedKey || keys.has(normalizedKey)) throw new Error("Blank/duplicate/colliding source key");
    keys.add(normalizedKey);
    return Object.freeze({ ...row, cells: Object.freeze(row.cells), key, normalizedKey });
  });
  return Object.freeze({ headers: Object.freeze(headers), keyColumn, rows: Object.freeze(records) });
}
