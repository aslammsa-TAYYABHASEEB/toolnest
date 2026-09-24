"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExcelCellValue } from "@/lib/pdf/to-excel";
import type { PdfTableCellRef, PdfTableVerification } from "@/lib/pdf/table-verification";

type AutomaticChecksProps = {
  verification: PdfTableVerification;
  onReviewCell: (cell: PdfTableCellRef) => void;
};

/** Compact subset per detail list before "Show more" is offered. */
const LIST_LIMIT = 4;

const cellPosition = (cell: PdfTableCellRef) => `row ${cell.row + 1} column ${cell.column + 1}`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const formatStoredValue = (value: ExcelCellValue | undefined) => value === undefined
  ? "(not present)"
  : typeof value === "string" ? JSON.stringify(value) : String(value);
/** The engine reports exact numbers only; the UI never reformats or re-derives them. */
const formatNumber = (value: number | null) => (value === null ? "—" : String(value));

function ExpandableList({ items, subject }: { items: ReactNode[]; subject: string }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, LIST_LIMIT);
  return <>
    <ul className="pdf-excel-checks-list">{visible}</ul>
    {items.length > LIST_LIMIT && <div className="pdf-excel-checks-actions">
      <Button variant="ghost" size="sm" aria-expanded={expanded}
        aria-label={`${expanded ? "Show less" : "Show more"} ${subject}`}
        onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : `Show more (${items.length - LIST_LIMIT} more)`}
      </Button>
    </div>}
  </>;
}

/**
 * Compact review panel for the deterministic engine result. It renders the verdicts the
 * engine already computed and only navigates to cells; it never re-derives arithmetic.
 */
export function PdfToExcelAutomaticChecks({ verification, onReviewCell }: AutomaticChecksProps) {
  const { sourceCoverage, userEdits, totals, summary } = verification;
  const checkableCells = sourceCoverage.evidenceBackedCells;
  const skippedTotals = totals.filter((check) => check.status === "NOT_APPLICABLE").length;
  const totalsNeedingReview = totals.filter((check) => check.status === "NEEDS_REVIEW");
  const actionableIssues = summary.missingSourceCells + summary.totalChecksNeedingReview;

  return <section className="pdf-excel-checks" aria-labelledby="pdf-excel-checks-title">
    <div className="pdf-excel-checks-head">
      <h3 className="pdf-excel-checks-title" id="pdf-excel-checks-title">Automatic checks</h3>
      <p className="pdf-excel-checks-copy" aria-live="polite">{actionableIssues === 0
        ? "No issues found by the checks that could be applied."
        : `${plural(actionableIssues, "issue")} ${actionableIssues === 1 ? "needs" : "need"} review.`}</p>
    </div>

    {/* Source links describe provenance only; they never claim a value is numerically right. */}
    <div className={`pdf-excel-checks-row ${sourceCoverage.status === "PASS" ? "is-pass" : "is-review"}`}>
      <div className="pdf-excel-checks-row-head">
        <h4 className="pdf-excel-checks-label">Source links</h4>
        <Badge tone={sourceCoverage.status === "PASS" ? "success" : "warning"}>
          {sourceCoverage.status === "PASS" ? "Passed" : "Needs review"}
        </Badge>
      </div>
      <p className="pdf-excel-checks-copy">{sourceCoverage.status === "PASS"
        ? `${plural(checkableCells, "checkable extracted cell")} ${checkableCells === 1 ? "has" : "have"} source locations in the PDF.`
        : `${plural(summary.missingSourceCells, "extracted cell")} do not have a source location.`}</p>
      {sourceCoverage.excludedMergedSubordinates > 0 && <p className="pdf-excel-checks-note">
        {plural(sourceCoverage.excludedMergedSubordinates, "merged subordinate cell")} {sourceCoverage.excludedMergedSubordinates === 1 ? "is" : "are"} excluded from this check.
      </p>}
      <ExpandableList subject="missing source cells" items={sourceCoverage.missingEvidence.map((cell) => (
        <li className="pdf-excel-checks-item" key={`source-${cell.row}:${cell.column}`}>
          <p className="pdf-excel-checks-fact">Row {cell.row + 1} · Column {cell.column + 1}</p>
          <p className="pdf-excel-checks-facts"><span>Value: {formatStoredValue(cell.value)}</span></p>
          <div className="pdf-excel-checks-actions">
            <Button variant="secondary" size="sm" aria-label={`Review missing source cell, ${cellPosition(cell)}`}
              onClick={() => onReviewCell({ row: cell.row, column: cell.column })}>Review</Button>
          </div>
        </li>
      ))} />
    </div>

    {/* Totals use the engine verdicts only. NOT_APPLICABLE rules are never failures. */}
    <div className={`pdf-excel-checks-row ${summary.totalChecksNeedingReview > 0
      ? "is-review" : summary.applicableTotalChecks > 0 ? "is-pass" : "is-unchecked"}`}>
      <div className="pdf-excel-checks-row-head">
        <h4 className="pdf-excel-checks-label">Totals</h4>
        {summary.totalChecksNeedingReview > 0
          ? <Badge tone="warning">Needs review</Badge>
          : summary.applicableTotalChecks > 0
            ? <Badge tone="success">Passed</Badge>
            : <Badge>Not checked</Badge>}
      </div>
      <p className="pdf-excel-checks-copy">{summary.totalChecksNeedingReview > 0
        ? `${plural(summary.totalChecksNeedingReview, "applicable total check")} need review.`
        : summary.applicableTotalChecks > 0
          ? `${plural(summary.passedTotalChecks, "applicable total check")} matched.`
          : "No applicable total check was found."}</p>
      {skippedTotals > 0 && <p className="pdf-excel-checks-note">
        {plural(skippedTotals, "total row")} {skippedTotals === 1 ? "was" : "were"} not checked because {skippedTotals === 1 ? "its" : "their"} structure was ambiguous or had too few numbers.
      </p>}
      <ExpandableList subject="totals needing review" items={totalsNeedingReview.map((check) => (
        <li className="pdf-excel-checks-item" key={`total-${check.targetCell.row}:${check.targetCell.column}`}>
          <p className="pdf-excel-checks-fact">Row {check.targetCell.row + 1} · Column {check.targetCell.column + 1}</p>
          <p className="pdf-excel-checks-facts">
            <span>Expected {formatNumber(check.expected)}</span>
            <span>Found {formatNumber(check.actual)}</span>
            <span>Difference {formatNumber(check.difference)}</span>
          </p>
          <div className="pdf-excel-checks-actions">
            <Button variant="secondary" size="sm" aria-label={`Review total, ${cellPosition(check.targetCell)}`}
              onClick={() => onReviewCell({ row: check.targetCell.row, column: check.targetCell.column })}>Review total</Button>
          </div>
        </li>
      ))} />
    </div>

    {/* Stored before/after values stay exact. Edits are context, not correctness failures. */}
    <div className="pdf-excel-checks-row is-info">
      <div className="pdf-excel-checks-row-head">
        <h4 className="pdf-excel-checks-label">Edits</h4>
        <Badge tone="brand">{userEdits.changes.length === 0
          ? "No edits"
          : `${userEdits.changes.length} changed`}</Badge>
      </div>
      <p className="pdf-excel-checks-copy">{userEdits.changes.length === 0
        ? "No cells changed since extraction."
        : `${plural(userEdits.changes.length, "cell")} changed after extraction.`}</p>
      <ExpandableList subject="edited cells" items={userEdits.changes.map((change) => (
        <li className="pdf-excel-checks-item" key={`edit-${change.row}:${change.column}`}>
          <p className="pdf-excel-checks-fact">Row {change.row + 1} · Column {change.column + 1}</p>
          <p className="pdf-excel-checks-facts">
            <span>Before: {formatStoredValue(change.before)}</span>
            <span>Now: {formatStoredValue(change.after)}</span>
          </p>
          <div className="pdf-excel-checks-actions">
            <Button variant="secondary" size="sm"
              aria-label={`Review edited cell, ${cellPosition(change)}`}
              onClick={() => onReviewCell({ row: change.row, column: change.column })}>
              Review edited cell
            </Button>
          </div>
        </li>
      ))} />
    </div>
  </section>;
}
