import { inferExcelCellValue, type ExcelCellValue, type ExtractedPdfTable } from "./to-excel";

export type PdfTableVerificationStatus = "PASS" | "NEEDS_REVIEW" | "NOT_APPLICABLE" | "INFORMATIONAL";
export type PdfTableCellRef = { row: number; column: number };
export type PdfTableCellValueRef = PdfTableCellRef & { value: ExcelCellValue };

export type PdfTableSourceCoverage = {
  kind: "source-coverage";
  status: "PASS" | "NEEDS_REVIEW";
  nonEmptyCells: number;
  evidenceBackedCells: number;
  excludedMergedSubordinates: number;
  missingEvidence: Array<PdfTableCellValueRef>;
};

export type PdfTableEdit = PdfTableCellRef & {
  before: ExcelCellValue | undefined;
  after: ExcelCellValue | undefined;
};

export type PdfTableUserEdits = {
  kind: "user-edits";
  status: "INFORMATIONAL";
  changes: PdfTableEdit[];
};

export type PdfTableTotalLabel = "total" | "subtotal" | "grand-total" | "net-total";
export type PdfTableTotalSkipReason =
  | "fewer-than-two-contributors"
  | "ambiguous-non-numeric-content"
  | "ambiguous-grand-total-structure";

export type PdfTableTotalCheck = {
  kind: "total-reconciliation";
  status: "PASS" | "NEEDS_REVIEW" | "NOT_APPLICABLE";
  label: PdfTableTotalLabel;
  labelCell: PdfTableCellRef;
  targetCell: PdfTableCellRef;
  contributingCells: PdfTableCellValueRef[];
  actual: number;
  expected: number | null;
  difference: number | null;
  skipReason?: PdfTableTotalSkipReason;
};

export type PdfTableVerification = {
  sourceCoverage: PdfTableSourceCoverage;
  userEdits: PdfTableUserEdits;
  totals: PdfTableTotalCheck[];
  summary: {
    sourceLinkedCells: number;
    missingSourceCells: number;
    editedCells: number;
    applicableTotalChecks: number;
    passedTotalChecks: number;
    totalChecksNeedingReview: number;
  };
};

type Decimal = { coefficient: bigint; scale: number };
type NumericCell = PdfTableCellValueRef & { numericValue: number };
type TotalCandidate = {
  row: number;
  label: PdfTableTotalLabel;
  labelCell: PdfTableCellRef;
  targets: NumericCell[];
};

const cellKey = (row: number, column: number) => `${row}:${column}`;

function mergedSubordinates(table: ExtractedPdfTable) {
  const cells = new Set<string>();
  for (const merge of table.merges ?? []) {
    for (let row = merge.startRow; row <= merge.endRow; row += 1) {
      for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
        if (row !== merge.startRow || column !== merge.startColumn) cells.add(cellKey(row, column));
      }
    }
  }
  return cells;
}

function isNonEmpty(value: ExcelCellValue | undefined) {
  return value !== undefined && (typeof value === "number" || value.trim().length > 0);
}

function columnHeading(table: ExtractedPdfTable, column: number, headerRows: number) {
  return table.rows.slice(0, headerRows).map(row => String(row[column] ?? "")).join(" ");
}

function arithmeticNumber(value: ExcelCellValue, heading: string) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const inferred = inferExcelCellValue(value, heading);
  return typeof inferred === "number" && Number.isFinite(inferred) ? inferred : null;
}

function sourceCoverage(table: ExtractedPdfTable): PdfTableSourceCoverage {
  const subordinate = mergedSubordinates(table);
  const missingEvidence: PdfTableCellValueRef[] = [];
  let nonEmptyCells = 0;
  let evidenceBackedCells = 0;
  let excludedMergedSubordinates = 0;
  table.rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (!isNonEmpty(value)) return;
    nonEmptyCells += 1;
    if (subordinate.has(cellKey(rowIndex, columnIndex))) {
      excludedMergedSubordinates += 1;
      return;
    }
    if (table.evidence?.[rowIndex]?.[columnIndex]) evidenceBackedCells += 1;
    else missingEvidence.push({ row: rowIndex, column: columnIndex, value });
  }));
  return {
    kind: "source-coverage",
    status: missingEvidence.length ? "NEEDS_REVIEW" : "PASS",
    nonEmptyCells,
    evidenceBackedCells,
    excludedMergedSubordinates,
    missingEvidence,
  };
}

function userEdits(original: ExtractedPdfTable, current: ExtractedPdfTable): PdfTableUserEdits {
  const changes: PdfTableEdit[] = [];
  const rows = Math.max(original.rows.length, current.rows.length);
  for (let row = 0; row < rows; row += 1) {
    const columns = Math.max(original.rows[row]?.length ?? 0, current.rows[row]?.length ?? 0);
    for (let column = 0; column < columns; column += 1) {
      const before = original.rows[row]?.[column];
      const after = current.rows[row]?.[column];
      if (!Object.is(before, after)) changes.push({ row, column, before, after });
    }
  }
  return { kind: "user-edits", status: "INFORMATIONAL", changes };
}

function totalLabel(value: ExcelCellValue | undefined): PdfTableTotalLabel | null {
  if (typeof value !== "string") return null;
  const label = value.trim().toLowerCase().replace(/\s+/g, " ").replace(/:$/, "").trim();
  if (label === "grand total") return "grand-total";
  if (label === "net total") return "net-total";
  if (/^sub ?total$/.test(label)) return "subtotal";
  return label === "total" ? "total" : null;
}

function decimal(value: number): Decimal {
  const match = String(value).toLowerCase().match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);
  if (!match) throw new Error("Only finite numeric table values can be reconciled.");
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  let coefficient = BigInt(`${match[1]}${match[2]}${fraction}`);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= BigInt(10) ** BigInt(-scale);
    scale = 0;
  }
  return { coefficient, scale };
}

function align(value: Decimal, scale: number) {
  return value.coefficient * BigInt(10) ** BigInt(scale - value.scale);
}

function decimalNumber(coefficient: bigint, scale: number) {
  const negative = coefficient < BigInt(0);
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  const text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return Number(`${negative ? "-" : ""}${text}`);
}

function reconcile(
  candidate: TotalCandidate,
  target: NumericCell,
  contributors: NumericCell[],
  skipReason?: PdfTableTotalSkipReason,
): PdfTableTotalCheck {
  if (skipReason || contributors.length < 2) return {
    kind: "total-reconciliation",
    status: "NOT_APPLICABLE",
    label: candidate.label,
    labelCell: candidate.labelCell,
    targetCell: { row: target.row, column: target.column },
    contributingCells: contributors.map(({ row, column, value }) => ({ row, column, value })),
    actual: target.numericValue,
    expected: null,
    difference: null,
    skipReason: skipReason ?? "fewer-than-two-contributors",
  };
  const values = contributors.map(cell => decimal(cell.numericValue));
  const actual = decimal(target.numericValue);
  const scale = Math.max(actual.scale, ...values.map(value => value.scale));
  const expectedCoefficient = values.reduce((sum, value) => sum + align(value, scale), BigInt(0));
  const actualCoefficient = align(actual, scale);
  const differenceCoefficient = actualCoefficient - expectedCoefficient;
  return {
    kind: "total-reconciliation",
    status: differenceCoefficient === BigInt(0) ? "PASS" : "NEEDS_REVIEW",
    label: candidate.label,
    labelCell: candidate.labelCell,
    targetCell: { row: target.row, column: target.column },
    contributingCells: contributors.map(({ row, column, value }) => ({ row, column, value })),
    actual: target.numericValue,
    expected: decimalNumber(expectedCoefficient, scale),
    difference: decimalNumber(differenceCoefficient, scale),
  };
}

function totalCandidates(table: ExtractedPdfTable, subordinate: Set<string>, headerRows: number) {
  const candidates: TotalCandidate[] = [];
  table.rows.forEach((row, rowIndex) => {
    const labels = row.flatMap((value, column) => {
      const label = totalLabel(value);
      return label && !subordinate.has(cellKey(rowIndex, column)) ? [{ label, column }] : [];
    });
    if (labels.length !== 1) return;
    const targets = row.flatMap((value, column) => {
      if (column === labels[0].column || subordinate.has(cellKey(rowIndex, column))) return [];
      const numericValue = arithmeticNumber(value, columnHeading(table, column, headerRows));
      return numericValue === null ? [] : [{ row: rowIndex, column, value, numericValue }];
    });
    if (targets.length) candidates.push({ row: rowIndex, label: labels[0].label,
      labelCell: { row: rowIndex, column: labels[0].column }, targets });
  });
  return candidates;
}

function ordinaryContributors(
  table: ExtractedPdfTable,
  candidate: TotalCandidate,
  target: NumericCell,
  candidates: TotalCandidate[],
  subordinate: Set<string>,
  headerRows: number,
) {
  const previous = [...candidates].reverse().find(entry => entry.row < candidate.row);
  const start = Math.max(headerRows, (previous?.row ?? headerRows - 1) + 1);
  const contributors: NumericCell[] = [];
  const heading = columnHeading(table, target.column, headerRows);
  let contaminated = false;
  for (let row = start; row < candidate.row; row += 1) {
    if (subordinate.has(cellKey(row, target.column))) continue;
    const value = table.rows[row]?.[target.column];
    if (!isNonEmpty(value)) continue;
    const numericValue = arithmeticNumber(value, heading);
    if (numericValue === null) contaminated = true;
    else contributors.push({ row, column: target.column, value, numericValue });
  }
  return { contributors, contaminated };
}

function totalChecks(table: ExtractedPdfTable): PdfTableTotalCheck[] {
  const subordinate = mergedSubordinates(table);
  const headerRows = Math.max(0, Math.min(table.rows.length, table.headerRows ?? 1));
  const candidates = totalCandidates(table, subordinate, headerRows);
  const checks: PdfTableTotalCheck[] = [];
  for (const candidate of candidates) {
    for (const target of candidate.targets) {
      if (candidate.label !== "grand-total") {
        const { contributors, contaminated } = ordinaryContributors(
          table, candidate, target, candidates, subordinate, headerRows,
        );
        checks.push(reconcile(candidate, target, contributors,
          contaminated ? "ambiguous-non-numeric-content" : undefined));
        continue;
      }
      const prior = candidates.filter(entry => entry.row < candidate.row &&
        (entry.label === "subtotal" || entry.label === "total") &&
        entry.targets.some(cell => cell.column === target.column));
      const kinds = new Set(prior.map(entry => entry.label));
      const contributors = prior.flatMap(entry => {
        const priorTarget = entry.targets.find(cell => cell.column === target.column);
        const priorCheck = checks.find(check => check.targetCell.row === entry.row &&
          check.targetCell.column === target.column && check.status !== "NOT_APPLICABLE");
        return priorTarget && priorCheck ? [priorTarget] : [];
      });
      const lastPriorRow = prior.at(-1)?.row ?? headerRows - 1;
      const trailingContent = table.rows.slice(lastPriorRow + 1, candidate.row).some((row, offset) => {
        const rowIndex = lastPriorRow + 1 + offset;
        return !subordinate.has(cellKey(rowIndex, target.column)) && isNonEmpty(row[target.column]);
      });
      const ambiguous = kinds.size !== 1 || contributors.length !== prior.length || trailingContent;
      checks.push(reconcile(candidate, target, contributors,
        ambiguous ? "ambiguous-grand-total-structure" : undefined));
    }
  }
  return checks;
}

/** Deterministic checks only; this does not certify that an extracted table is correct. */
export function verifyPdfTable(
  original: ExtractedPdfTable,
  current: ExtractedPdfTable,
): PdfTableVerification {
  const coverage = sourceCoverage(original);
  const edits = userEdits(original, current);
  const totals = totalChecks(current);
  const applicableTotals = totals.filter(check => check.status !== "NOT_APPLICABLE");
  return {
    sourceCoverage: coverage,
    userEdits: edits,
    totals,
    summary: {
      sourceLinkedCells: coverage.evidenceBackedCells,
      missingSourceCells: coverage.missingEvidence.length,
      editedCells: edits.changes.length,
      applicableTotalChecks: applicableTotals.length,
      passedTotalChecks: applicableTotals.filter(check => check.status === "PASS").length,
      totalChecksNeedingReview: applicableTotals.filter(check => check.status === "NEEDS_REVIEW").length,
    },
  };
}
