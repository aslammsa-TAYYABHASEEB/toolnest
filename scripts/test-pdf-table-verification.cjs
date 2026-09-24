require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args);
};

const { verifyPdfTable } = require('../lib/pdf/table-verification.ts');

const cellKey = (row, column) => `${row}:${column}`;
const isNonEmpty = value => typeof value === 'number' || (typeof value === 'string' && value.trim());
const evidence = sourceText => ({
  page: 1,
  bbox: { left: .1, top: .1, width: .2, height: .05 },
  sourceText,
  source: 'pdf-text',
  rotation: 0,
});

function table(rows, { merges = [], headerRows = 1 } = {}) {
  const subordinate = new Set();
  for (const merge of merges) for (let row = merge.startRow; row <= merge.endRow; row++) {
    for (let column = merge.startColumn; column <= merge.endColumn; column++) {
      if (row !== merge.startRow || column !== merge.startColumn) subordinate.add(cellKey(row, column));
    }
  }
  return {
    id: 'table-1',
    name: 'Table 1',
    pageStart: 1,
    pageEnd: 1,
    source: 'native',
    method: 'vector-grid',
    rows: rows.map(row => [...row]),
    evidence: rows.map((row, rowIndex) => row.map((value, columnIndex) =>
      isNonEmpty(value) && !subordinate.has(cellKey(rowIndex, columnIndex)) ? evidence(String(value)) : null)),
    merges: merges.map(merge => ({ ...merge })),
    headerRows,
  };
}

function verification(rows, options) {
  const original = table(rows, options);
  return verifyPdfTable(original, original);
}

const coverageTable = table([
  ['Item', 'Amount'],
  ['Payroll', 22960],
  ['Merged label', 'merged subordinate'],
  ['Empty', ''],
  ['Missing', 5],
], { merges: [{ startRow: 2, endRow: 2, startColumn: 0, endColumn: 1 }] });
coverageTable.evidence[1][1].sourceText = '22,960';
coverageTable.evidence[4][1] = null;
const originalRowsSnapshot = structuredClone(coverageTable.rows);
const evidenceSnapshot = structuredClone(coverageTable.evidence);
const coverage = verifyPdfTable(coverageTable, coverageTable);
assert.equal(coverage.sourceCoverage.status, 'NEEDS_REVIEW');
assert.equal(coverage.sourceCoverage.nonEmptyCells, 9);
assert.equal(coverage.sourceCoverage.evidenceBackedCells, 7);
assert.equal(coverage.sourceCoverage.excludedMergedSubordinates, 1);
assert.deepEqual(coverage.sourceCoverage.missingEvidence, [{ row: 4, column: 1, value: 5 }]);
assert.equal(coverage.userEdits.changes.length, 0);

const edited = { ...coverageTable, rows: coverageTable.rows.map(row => [...row]) };
edited.rows[1][0] = 'Payroll corrected';
edited.rows[1][1] = 23000;
const edits = verifyPdfTable(coverageTable, edited);
assert.deepEqual(edits.userEdits.changes, [
  { row: 1, column: 0, before: 'Payroll', after: 'Payroll corrected' },
  { row: 1, column: 1, before: 22960, after: 23000 },
]);
assert.equal(edits.summary.editedCells, 2);
assert.deepEqual(coverageTable.rows, originalRowsSnapshot);
assert.deepEqual(coverageTable.evidence, evidenceSnapshot);
assert.equal(coverageTable.evidence[1][1].sourceText, '22,960');

const pass = verification([
  ['Item', 'Amount'], ['A', 100], ['B', 200], ['Total', 300],
]);
assert.equal(pass.sourceCoverage.status, 'PASS');
assert.equal(pass.totals.length, 1);
assert.equal(pass.totals[0].status, 'PASS');
assert.deepEqual(pass.totals[0].contributingCells.map(cell => [cell.row, cell.column]), [[1, 1], [2, 1]]);
assert.equal(pass.totals[0].expected, 300);
assert.equal(pass.totals[0].difference, 0);

const textareaOriginal = table([
  ['Item', 'Amount'], ['A', 100], ['B', 200], ['Total', 300],
]);
const textareaEvidenceSnapshot = structuredClone(textareaOriginal.evidence);
const textareaTotal = { ...textareaOriginal, rows: textareaOriginal.rows.map(row => [...row]) };
textareaTotal.rows[3][1] = '310';
const textareaTotalResult = verifyPdfTable(textareaOriginal, textareaTotal);
assert.equal(textareaTotalResult.totals[0].status, 'NEEDS_REVIEW');
assert.equal(textareaTotalResult.totals[0].actual, 310);
assert.equal(textareaTotalResult.totals[0].expected, 300);
assert.equal(textareaTotalResult.totals[0].difference, 10);
assert.deepEqual(textareaTotalResult.userEdits.changes, [
  { row: 3, column: 1, before: 300, after: '310' },
]);

const textareaContributor = { ...textareaOriginal, rows: textareaOriginal.rows.map(row => [...row]) };
textareaContributor.rows[1][1] = '110';
textareaContributor.rows[3][1] = '310';
const textareaContributorResult = verifyPdfTable(textareaOriginal, textareaContributor);
assert.equal(textareaContributorResult.totals[0].status, 'PASS');
assert.equal(textareaContributorResult.totals[0].actual, 310);
assert.equal(textareaContributorResult.totals[0].expected, 310);
assert.deepEqual(textareaContributorResult.totals[0].contributingCells.map(cell => cell.value), ['110', 200]);
assert.deepEqual(textareaContributorResult.userEdits.changes, [
  { row: 1, column: 1, before: 100, after: '110' },
  { row: 3, column: 1, before: 300, after: '310' },
]);
assert.deepEqual(textareaOriginal.evidence, textareaEvidenceSnapshot);

const formattedOriginal = table([
  ['Item', 'Amount'], ['A', 1234.5], ['B', .5], ['Total', 1235],
]);
const formattedCurrent = { ...formattedOriginal, rows: formattedOriginal.rows.map(row => [...row]) };
formattedCurrent.rows[1][1] = '1,234.50';
formattedCurrent.rows[2][1] = '0.50';
formattedCurrent.rows[3][1] = '1,235';
const formattedEdits = verifyPdfTable(formattedOriginal, formattedCurrent);
assert.equal(formattedEdits.totals[0].status, 'PASS');
assert.equal(formattedEdits.totals[0].expected, 1235);
assert.deepEqual(formattedEdits.totals[0].contributingCells.map(cell => cell.value), ['1,234.50', '0.50']);

const accountingOriginal = table([
  ['Item', 'Amount'], ['Adjustment', -2500], ['Charge', 3000], ['Total', 500],
]);
const accountingCurrent = { ...accountingOriginal, rows: accountingOriginal.rows.map(row => [...row]) };
accountingCurrent.rows[1][1] = '(2,500)';
accountingCurrent.rows[2][1] = '3,000';
accountingCurrent.rows[3][1] = '500';
const accountingEdits = verifyPdfTable(accountingOriginal, accountingCurrent);
assert.equal(accountingEdits.totals[0].status, 'PASS');
assert.equal(accountingEdits.totals[0].expected, 500);

const identifierLike = verification([
  ['Item', 'Amount'],
  ['Leading zero', '0012'],
  ['Long account', '0660010002450009'],
  ['Slash code', '18/81'],
  ['Hyphen code', '245-9'],
  ['Grade', 'BS-03'],
  ['Date', '15-09-2026'],
  ['Total', '360'],
]);
assert.equal(identifierLike.totals[0].status, 'NOT_APPLICABLE');
assert.equal(identifierLike.totals[0].skipReason, 'ambiguous-non-numeric-content');

const accountHeading = verification([
  ['Item', 'Account Number'], ['A', '100'], ['B', '200'], ['Total', '300'],
]);
assert.equal(accountHeading.totals.length, 0);

const mismatch = verification([
  ['Item', 'Amount'], ['A', 100], ['B', 200], ['C', 50], ['Total', 360],
]);
assert.equal(mismatch.totals[0].status, 'NEEDS_REVIEW');
assert.equal(mismatch.totals[0].expected, 350);
assert.equal(mismatch.totals[0].difference, 10);

const negative = verification([
  ['Item', 'Amount'], ['Credit', 100], ['Adjustment', -25], ['Fee', -5], ['Net Total', 70],
]);
assert.equal(negative.totals[0].status, 'PASS');
assert.equal(negative.totals[0].expected, 70);

const decimal = verification([
  ['Item', 'Amount'], ['A', .1], ['B', .2], ['C', .05], ['Total', .35],
]);
assert.equal(decimal.totals[0].status, 'PASS');
assert.equal(decimal.totals[0].expected, .35);
assert.equal(decimal.totals[0].difference, 0);

const sections = verification([
  ['Item', 'Amount'],
  ['A', 100], ['B', 200], ['Sub Total', 300],
  ['C', 40], ['D', 60], ['Total', 100],
]);
assert.deepEqual(sections.totals.map(check => [check.label, check.status, check.expected]), [
  ['subtotal', 'PASS', 300], ['total', 'PASS', 100],
]);

const grand = verification([
  ['Item', 'Amount'],
  ['A', 100], ['B', 200], ['Subtotal', 300],
  ['C', 40], ['D', 60], ['Subtotal', 100],
  ['Grand Total', 400],
]);
assert.deepEqual(grand.totals.map(check => [check.label, check.status, check.expected]), [
  ['subtotal', 'PASS', 300], ['subtotal', 'PASS', 100], ['grand-total', 'PASS', 400],
]);
assert.deepEqual(grand.totals[2].contributingCells.map(cell => [cell.row, cell.column]), [[3, 1], [6, 1]]);

const ambiguousGrand = verification([
  ['Item', 'Amount'],
  ['A', 100], ['B', 200], ['Subtotal', 300],
  ['C', 40], ['D', 60], ['Total', 100],
  ['Grand Total', 400],
]);
assert.equal(ambiguousGrand.totals[0].status, 'PASS');
assert.equal(ambiguousGrand.totals[1].status, 'PASS');
assert.equal(ambiguousGrand.totals[2].status, 'NOT_APPLICABLE');
assert.equal(ambiguousGrand.totals[2].skipReason, 'ambiguous-grand-total-structure');

const tooFew = verification([
  ['Item', 'Amount'], ['Only item', 100], ['Total', 100],
]);
assert.equal(tooFew.totals[0].status, 'NOT_APPLICABLE');
assert.equal(tooFew.totals[0].skipReason, 'fewer-than-two-contributors');
assert.equal(tooFew.totals[0].expected, null);

const balance = verification([
  ['Item', 'Amount'], ['Opening Balance', 500], ['Payment', 100], ['Balance', 400],
]);
assert.equal(balance.totals.length, 0);
assert.equal(balance.summary.applicableTotalChecks, 0);

const contaminated = verification([
  ['Item', 'Amount'], ['A', 100], ['Pending', 'unknown'], ['B', 200], ['Total', 300],
]);
assert.equal(contaminated.totals[0].status, 'NOT_APPLICABLE');
assert.equal(contaminated.totals[0].skipReason, 'ambiguous-non-numeric-content');

const merged = verification([
  ['Item', 'Note', 'Amount'],
  ['Merged item', 100, 100],
  ['B', '', 200],
  ['C', '', 50],
  ['Total', '', 250],
], { merges: [{ startRow: 1, endRow: 1, startColumn: 1, endColumn: 2 }] });
assert.equal(merged.totals[0].status, 'PASS');
assert.deepEqual(merged.totals[0].contributingCells.map(cell => cell.value), [200, 50]);

const multipleColumns = verification([
  ['Item', 'Quantity', 'Amount'],
  ['A', 1, 100],
  ['B', 2, 'pending'],
  ['C', 3, 50],
  ['Total', 6, 150],
]);
assert.deepEqual(multipleColumns.totals.map(check => [check.targetCell.column, check.status]), [
  [1, 'PASS'], [2, 'NOT_APPLICABLE'],
]);
assert.equal(multipleColumns.totals[1].skipReason, 'ambiguous-non-numeric-content');

console.log('PASS: source coverage counts evidence without penalizing empty or merged-subordinate cells.');
console.log('PASS: edits compare stored values without mutating original rows or provenance.');
console.log('PASS: textarea numeric strings reconcile conservatively while exact stored edits remain visible.');
console.log('PASS: formatted and accounting numbers reconcile; identifiers, dates and code columns remain text.');
console.log('PASS: conservative totals cover exact decimals, negatives, sections, grand totals and independent columns.');
console.log('PASS: ambiguous labels, balance rows, contamination and insufficient contributors are not falsely flagged.');
