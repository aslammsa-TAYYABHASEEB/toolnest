require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');

require.extensions['.tsx'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  }, fileName: filename });
  module._compile(outputText, filename);
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args);
};

const { verifyPdfTable } = require('../lib/pdf/table-verification.ts');
const { PdfToExcelAutomaticChecks } = require('../components/pdf-to-excel-automatic-checks.tsx');

const parentSource = fs.readFileSync(path.resolve('components/pdf-to-excel.tsx'), 'utf8');
const checksSource = fs.readFileSync(path.resolve('components/pdf-to-excel-automatic-checks.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve('app/globals.css'), 'utf8');
const cellKey = (row, column) => row + ':' + column;

function evidence(sourceText) {
  return {
    page: 1,
    bbox: { left: .1, top: .1, width: .2, height: .05 },
    sourceText,
    source: 'pdf-text',
    rotation: 0,
  };
}

function table(rows, { merges = [], headerRows = 1 } = {}) {
  const subordinate = new Set();
  for (const merge of merges) for (let row = merge.startRow; row <= merge.endRow; row += 1) {
    for (let column = merge.startColumn; column <= merge.endColumn; column += 1) {
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
      (typeof value === 'number' || String(value).trim()) && !subordinate.has(cellKey(rowIndex, columnIndex))
        ? evidence(String(value)) : null)),
    merges: merges.map(merge => ({ ...merge })),
    headerRows,
  };
}

const render = verification => renderToStaticMarkup(React.createElement(PdfToExcelAutomaticChecks, {
  verification,
  onReviewCell() {},
}));

// Direct integration: original extraction and current editable state stay distinct.
assert.ok(parentSource.includes('import { verifyPdfTable } from "@/lib/pdf/table-verification";'));
assert.ok(parentSource.includes('verifyPdfTable(result.tables[selected], tables[selected])'));
assert.ok(parentSource.includes('useMemo(() => tables[selected] && result?.tables[selected]'));
assert.ok(parentSource.includes('<PdfToExcelAutomaticChecks verification={verification} onReviewCell={setActiveCell} />'));
assert.ok(parentSource.indexOf('<PdfToExcelAutomaticChecks') < parentSource.indexOf('className="pdf-excel-review-head"'));
assert.ok(!checksSource.includes('reduce(') && !checksSource.includes('inferExcelCellValue'));
for (const phrase of ['Verified table', 'Fully verified', 'Everything is correct', '100% correct',
  'Accuracy score', 'Confidence score', 'Safe']) {
  assert.ok(!checksSource.includes(phrase), 'prohibited overall correctness claim: ' + phrase);
}
console.log('PASS: UI consumes the verification engine with immutable original/current table inputs and no arithmetic duplication.');

// Source links: truthful pass, missing-source review, exact navigation, merged subordinate exclusion.
const sourcePassTable = table([['Item', 'Amount'], ['A', 100]]);
const sourcePassHtml = render(verifyPdfTable(sourcePassTable, sourcePassTable));
assert.match(sourcePassHtml, /Source links/);
assert.match(sourcePassHtml, /Passed/);
assert.match(sourcePassHtml, /4 checkable extracted cells have source locations in the PDF/);

const missingTable = table([['Item', 'Amount'], ['A', 100]]);
missingTable.evidence[1][1] = null;
const missingHtml = render(verifyPdfTable(missingTable, missingTable));
assert.match(missingHtml, /1 issue needs review/);
assert.match(missingHtml, /1 extracted cell do not have a source location/);
assert.match(missingHtml, /aria-label="Review missing source cell, row 2 column 2"/);
assert.ok(checksSource.includes('onClick={() => onReviewCell({ row: cell.row, column: cell.column })}'));

const mergedTable = table([
  ['Item', 'Amount'],
  ['Merged', 'subordinate'],
], { merges: [{ startRow: 1, endRow: 1, startColumn: 0, endColumn: 1 }] });
const mergedVerification = verifyPdfTable(mergedTable, mergedTable);
assert.equal(mergedVerification.sourceCoverage.missingEvidence.length, 0);
assert.equal(mergedVerification.sourceCoverage.excludedMergedSubordinates, 1);
assert.doesNotMatch(render(mergedVerification), /Review missing source cell/);
console.log('PASS: Source links distinguish provenance from correctness and navigate exact missing cells only.');

// Totals: pass, mismatch details, skipped ambiguity, and no-applicable states.
const totalsOriginal = table([
  ['Item', 'Amount'], ['A', 100], ['B', 200], ['Total', 300],
]);
const totalsPassHtml = render(verifyPdfTable(totalsOriginal, totalsOriginal));
assert.match(totalsPassHtml, /1 applicable total check matched/);

const mismatchCurrent = { ...totalsOriginal, rows: totalsOriginal.rows.map(row => [...row]) };
mismatchCurrent.rows[3][1] = '310';
const mismatchVerification = verifyPdfTable(totalsOriginal, mismatchCurrent);
const mismatchHtml = render(mismatchVerification);
assert.equal(mismatchVerification.totals[0].status, 'NEEDS_REVIEW');
assert.match(mismatchHtml, /1 applicable total check need review/);
assert.match(mismatchHtml, /Expected 300/);
assert.match(mismatchHtml, /Found 310/);
assert.match(mismatchHtml, /Difference 10/);
assert.match(mismatchHtml, /aria-label="Review total, row 4 column 2"/);
assert.ok(checksSource.includes('onClick={() => onReviewCell({ row: check.targetCell.row, column: check.targetCell.column })}'));

const ambiguousTable = table([
  ['Item', 'Amount'], ['A', 100], ['Pending', 'unknown'], ['B', 200], ['Total', 300],
]);
const ambiguousVerification = verifyPdfTable(ambiguousTable, ambiguousTable);
const ambiguousHtml = render(ambiguousVerification);
assert.equal(ambiguousVerification.totals[0].status, 'NOT_APPLICABLE');
assert.match(ambiguousHtml, /Not checked/);
assert.match(ambiguousHtml, /No applicable total check was found/);
assert.doesNotMatch(ambiguousHtml, /Review total/);

const noTotalTable = table([['Item', 'Amount'], ['A', 100], ['B', 200]]);
assert.match(render(verifyPdfTable(noTotalTable, noTotalTable)), /No applicable total check was found/);
console.log('PASS: Totals show engine PASS/review/not-checked states without treating skipped checks as failures.');

// Edits and dynamic re-check: exact values remain informational and no extraction rerun is needed.
const initial = verifyPdfTable(totalsOriginal, totalsOriginal);
assert.equal(initial.totals[0].status, 'PASS');
assert.match(render(initial), /No edits/);
assert.match(render(initial), /No cells changed since extraction/);

const afterTotalEdit = verifyPdfTable(totalsOriginal, mismatchCurrent);
assert.equal(afterTotalEdit.totals[0].status, 'NEEDS_REVIEW');
assert.deepEqual(afterTotalEdit.userEdits.changes, [
  { row: 3, column: 1, before: 300, after: '310' },
]);
assert.match(mismatchHtml, /Before: 300/);
assert.match(mismatchHtml, /Now: &quot;310&quot;/);
assert.match(mismatchHtml, /aria-label="Review edited cell, row 4 column 2"/);

const correctedCurrent = { ...mismatchCurrent, rows: mismatchCurrent.rows.map(row => [...row]) };
correctedCurrent.rows[1][1] = '110';
const afterContributorEdit = verifyPdfTable(totalsOriginal, correctedCurrent);
assert.equal(afterContributorEdit.totals[0].status, 'PASS');
assert.equal(afterContributorEdit.userEdits.changes.length, 2);
assert.ok(checksSource.includes('onClick={() => onReviewCell({ row: change.row, column: change.column })}'));
const editCellSource = parentSource.slice(parentSource.indexOf('function editCell('), parentSource.indexOf('const progressText'));
assert.ok(!editCellSource.includes('extractPdfTables') && !editCellSource.includes('analyze('));
console.log('PASS: edits remain informational and table changes recompute total checks immediately without re-extraction.');

// Existing downloads, Source Review, and zoom controls remain the owning implementations.
for (const contract of ['createExcelWorkbook(nextTables)', 'createTableCsv(table)', 'PdfToExcelSourceReview',
  'aria-label="Zoom out table"', 'aria-label="Zoom in table"', '"--table-zoom"']) {
  assert.ok(parentSource.includes(contract), 'missing existing contract: ' + contract);
}
assert.ok(parentSource.includes('onFocus={() => setActiveCell('));
assert.ok(parentSource.includes('onClick={() => setActiveCell('));
console.log('PASS: CSV/XLSX, Source Review selection, PDF review, and table zoom contracts remain intact.');

const checksStyles = styles.slice(styles.indexOf('.pdf-excel-checks {'), styles.indexOf('/* Extracted-table display zoom'));
assert.match(checksStyles, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(styles, /@media \(max-width: 47\.99rem\)[\s\S]*\.pdf-excel-checks \{ grid-template-columns: minmax\(0, 1fr\)/);
assert.match(checksStyles, /min-width: 0/);
assert.match(checksStyles, /max-width: 100%/);
assert.ok(!/width:\s*\d+(?:px|rem)/.test(checksStyles), 'Automatic Checks must not impose a fixed content width');
console.log('PASS: scoped Automatic Checks styles stack at mobile width without introducing page-level overflow.');
