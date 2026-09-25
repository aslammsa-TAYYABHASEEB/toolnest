require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');
const canvas = require('@napi-rs/canvas');
globalThis.DOMMatrix = canvas.DOMMatrix; globalThis.ImageData = canvas.ImageData; globalThis.Path2D = canvas.Path2D;
Promise.try ??= (callback, ...args) => Promise.resolve().then(() => callback(...args));
const review = require('../lib/pdf/source-review.ts');
const { extractVectorGridTables } = require('../lib/pdf/vector-table.ts');
const tableView = require('../lib/pdf/table-view.ts');
// Map the app's "@/..." alias for the lib modules whose own imports rely on it
// (same resolver patch the PDF-to-Excel pipeline test already uses).
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args);
};
const { formatPdfBytes } = require('../lib/pdf/validation.ts');
const { MAX_PDF_TOTAL_SIZE } = require('../lib/pdf/types.ts');

const component = fs.readFileSync(path.resolve('components/pdf-to-excel.tsx'), 'utf8');
const viewer = fs.readFileSync(path.resolve('components/pdf-to-excel-source-review.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve('app/globals.css'), 'utf8');
const source = fs.readFileSync(path.resolve('lib/pdf/source-review.ts'), 'utf8');
const reviewStyles = styles.slice(styles.indexOf('.pdf-excel-review-head'));

const evidence = (overrides = {}) => ({ page: 3, bbox: { left: .1, top: .2, width: .3, height: .05 },
  sourceText: '22,960', source: 'pdf-text', rotation: 0, ...overrides });
const table = (overrides = {}) => ({ id: 'table-1', name: 'Table 1', pageStart: 1, pageEnd: 1, source: 'native',
  rows: [['Item', 'Amount'], ['1001', 22960], ['1002', '']],
  evidence: [[evidence({ sourceText: 'Item' }), evidence({ sourceText: 'Amount' })],
    [evidence({ sourceText: '1001' }), evidence()], [null, null]],
  merges: [],
  ...overrides });
const mergedTable = table({
  rows: [['EARNINGS', 'NET SALARY'], ['Total', 15]],
  evidence: [[evidence({ sourceText: 'EARNINGS' }), null], [evidence({ sourceText: 'Total' }), null]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] });

// 1. Rotation: display orientation is the intrinsic page rotation plus the OCR correction.
for (const pageRotation of [0, 90, 180, 270, -90, 360])
  for (const evidenceRotation of [0, 90, 180, 270]) {
    const expected = ((pageRotation + evidenceRotation) % 360 + 360) % 360;
    assert.equal(review.sourceReviewRotation(pageRotation, evidenceRotation), expected,
      `rotation ${pageRotation}+${evidenceRotation}`);
  }
assert.equal(review.sourceReviewRotation(270, undefined), 270);
assert.equal(review.sourceReviewRotation(Number.NaN, 90), 90);
console.log('PASS: display rotation equals (page.rotate + evidence.rotation) % 360 for every quarter turn.');

// 1b. Preview identity: only the source file, page and normalized evidence rotation define canvas currentness.
const pageThree = review.sourceReviewPreviewIdentity('file-a', evidence());
assert.equal(pageThree, review.sourceReviewPreviewIdentity('file-a',
  evidence({ bbox: { left: .5, top: .5, width: .1, height: .1 }, sourceText: 'another cell' })),
  'same-page cell changes must reuse the already truthful canvas');
assert.notEqual(pageThree, review.sourceReviewPreviewIdentity('file-a', evidence({ page: 4 })),
  'another page must wait for its own render');
assert.notEqual(pageThree, review.sourceReviewPreviewIdentity('file-a', evidence({ rotation: 90 })),
  'another evidence rotation must wait for its own render');
assert.notEqual(pageThree, review.sourceReviewPreviewIdentity('file-b', evidence()),
  'another source file must wait for its own render');
assert.equal(review.sourceReviewPreviewIdentity('file-a', evidence({ rotation: -90 })),
  review.sourceReviewPreviewIdentity('file-a', evidence({ rotation: 270 })),
  'equivalent quarter turns share one normalized identity');
assert.equal(review.sourceReviewPreviewIdentity('file-a', null), null);
assert.equal(review.sourceReviewPreviewMatches(pageThree, pageThree), true);
assert.equal(review.sourceReviewPreviewMatches(pageThree, review.sourceReviewPreviewIdentity('file-a', evidence({ page: 4 }))), false);
assert.equal(review.sourceReviewPreviewMatches(pageThree, null), false);
assert.equal(review.sourceReviewPreviewMatches(null, null), false);
console.log('PASS: preview identity gates cross-page/rotation/file transitions without hiding same-page changes.');

// 2. Bounded zoom and clamped retina rendering.
assert.equal(review.clampSourceReviewZoom(0.4), review.SOURCE_REVIEW_MIN_ZOOM);
assert.equal(review.clampSourceReviewZoom(4), review.SOURCE_REVIEW_MAX_ZOOM);
assert.equal(review.clampSourceReviewZoom(1.25), 1.25);
assert.equal(review.clampSourceReviewZoom(Number.NaN), 1);
assert.equal(review.SOURCE_REVIEW_MIN_ZOOM, 0.75); assert.equal(review.SOURCE_REVIEW_MAX_ZOOM, 2);
assert.equal(review.clampSourceReviewPixelRatio(3.5), 2);
assert.equal(review.clampSourceReviewPixelRatio(1.5), 1.5);
assert.equal(review.clampSourceReviewPixelRatio(0), 1);
console.log('PASS: zoom stays inside 0.75x-2x and device pixel ratio is clamped to 2.');

// 2b. Table view zoom: bounded, display-only, defaulting to 100%.
assert.equal(review.TABLE_VIEW_MIN_ZOOM, 0.75);
assert.equal(review.TABLE_VIEW_DEFAULT_ZOOM, 1);
assert.equal(review.TABLE_VIEW_MAX_ZOOM, 1.5);
assert.equal(review.TABLE_VIEW_ZOOM_STEP, 0.25);
assert.equal(review.clampTableViewZoom(0.5), 0.75);
assert.equal(review.clampTableViewZoom(3), 1.5);
assert.equal(review.clampTableViewZoom(1.25), 1.25);
assert.equal(review.clampTableViewZoom(Number.NaN), 1);
console.log('PASS: table display zoom stays inside 0.75x-1.5x in 25% steps and defaults to 100%.');

// 3. Initial selection: first non-empty cell that actually carries evidence.
const first = review.firstEvidenceCell(table());
assert.deepEqual(first, { row: 0, column: 0 });
assert.deepEqual(review.firstEvidenceCell({ ...table(), evidence: [[null, null], [null, null], [null, null]] }), null);
assert.deepEqual(review.firstEvidenceCell({ ...table(), rows: [[''], [22960]], evidence: [[null], [null]] }), null,
  'an empty cell must never be selected for Source Review');
console.log('PASS: the first evidence-backed non-empty cell becomes the initial Source Review selection.');

// 4. Selection states: evidence, missing provenance, merged subordinate and no table at all.
const selected = review.describeSourceReviewSelection(table(), { row: 0, column: 1 });
assert.equal(selected.notice, 'none');
assert.equal(selected.evidence.sourceText, 'Amount');
assert.equal(selected.previewEvidence, selected.evidence,
  'an ordinary evidence-backed cell uses its own evidence for the preview');
assert.equal(review.sourceReviewNoticeMessage(selected), null);
const emptyCell = review.describeSourceReviewSelection(table(), { row: 2, column: 1 });
assert.equal(emptyCell.notice, 'empty-cell'); assert.equal(emptyCell.evidence, null);
assert.equal(emptyCell.previewEvidence, null, 'an empty cell must not borrow preview evidence');
assert.equal(emptyCell.mergedAnchor, null, 'an empty cell must never borrow a merged anchor');
assert.equal(review.sourceReviewNoticeMessage(emptyCell), 'This cell is empty, so there is no source text to highlight.');
const whitespace = review.describeSourceReviewSelection(
  table({ rows: [['Item', 'Amount'], ['1001', 22960], ['   ', '']] }), { row: 2, column: 0 });
assert.equal(whitespace.notice, 'empty-cell', 'whitespace-only cells are empty, not missing provenance');
assert.equal(whitespace.evidence, null, 'an empty cell must never invent bbox, evidence or source text');
assert.equal(whitespace.previewEvidence, null);
const missing = review.describeSourceReviewSelection(table(), { row: 2, column: 0 });
assert.equal(missing.notice, 'no-source-location', 'a non-empty cell without provenance must not get a fabricated box');
assert.equal(missing.previewEvidence, null, 'missing provenance must not acquire a preview fallback');
assert.equal(review.sourceReviewNoticeMessage(missing), 'No source location is available for this cell.',
  'a non-empty cell without provenance keeps the generic message');
const merged = review.describeSourceReviewSelection(mergedTable, { row: 0, column: 1 });
assert.equal(merged.notice, 'merged-subordinate', 'an empty merged subordinate keeps its own merged notice');
assert.deepEqual(merged.cell, { row: 0, column: 1 }, 'the selected cell remains the merged subordinate');
assert.equal(merged.evidence, null, 'the selected merged subordinate keeps its own null evidence');
assert.equal(merged.previewEvidence, mergedTable.evidence[0][0],
  'the preview may reuse only the real evidence stored on the merged anchor');
assert.equal(merged.previewEvidence.sourceText, 'EARNINGS');
assert.deepEqual(merged.mergedAnchor, { row: 0, column: 0 });
assert.equal(review.sourceReviewNoticeMessage(merged), 'No separate source location is stored for this merged cell.');
assert.equal(mergedTable.evidence[0][1], null, 'selection must not mutate subordinate evidence');
const anchor = review.describeSourceReviewSelection(mergedTable, { row: 0, column: 0 });
assert.equal(anchor.notice, 'none');
assert.equal(anchor.evidence, mergedTable.evidence[0][0]);
assert.equal(anchor.previewEvidence, anchor.evidence);
assert.equal(anchor.mergedAnchor, null, 'selecting the anchor itself remains an ordinary selection');
const mergedWithoutAnchorEvidence = review.describeSourceReviewSelection({ ...mergedTable,
  evidence: [[null, null], mergedTable.evidence[1]] }, { row: 0, column: 1 });
assert.equal(mergedWithoutAnchorEvidence.notice, 'merged-subordinate');
assert.deepEqual(mergedWithoutAnchorEvidence.mergedAnchor, { row: 0, column: 0 });
assert.equal(mergedWithoutAnchorEvidence.evidence, null);
assert.equal(mergedWithoutAnchorEvidence.previewEvidence, null,
  'a merged subordinate cannot invent a preview when its anchor has no evidence');
assert.deepEqual(review.mergeAnchorCell(mergedTable, 0, 0), null, 'the merged anchor itself is not a subordinate');
assert.equal(review.mergeAnchorCell(table(), 2, 0), null);
assert.equal(review.describeSourceReviewSelection(undefined, null).notice, 'no-source-location');
assert.equal(review.describeSourceReviewSelection(undefined, null).evidence, null);
assert.equal(review.describeSourceReviewSelection(undefined, null).previewEvidence, null);
assert.equal(review.describeSourceReviewSelection(undefined, null).retainPageContext, false,
  'without a table there is no selection and nothing may be retained');
assert.equal(selected.retainPageContext, false, 'a real evidence cell never needs a retained page');
assert.equal(anchor.retainPageContext, false, 'a real merged anchor is an ordinary evidence cell');
assert.equal(merged.retainPageContext, false, 'a real anchor preview must not use the empty fallback');
assert.equal(missing.retainPageContext, false,
  'a non-empty cell without provenance must never pretend to be an empty context');
assert.equal(mergedWithoutAnchorEvidence.retainPageContext, false,
  'a non-empty merged region keeps no page context when its provenance is missing');
console.log('PASS: merged subordinates preview real anchor evidence while all selection identities stay truthful.');

// 4b. Contextual page retention: only a genuinely empty selection may keep the rendered page.
const emptyMergedTable = table({
  rows: [['', ''], ['1001', 22960]],
  evidence: [[null, null], [evidence({ sourceText: '1001' }), evidence()]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] });
const blankMergedAnchor = review.describeSourceReviewSelection(emptyMergedTable, { row: 0, column: 0 });
assert.equal(blankMergedAnchor.notice, 'empty-cell', 'a blank merged anchor stays an ordinary empty cell');
assert.equal(blankMergedAnchor.evidence, null);
assert.equal(blankMergedAnchor.previewEvidence, null);
assert.equal(blankMergedAnchor.mergedAnchor, null, 'the merged anchor keeps no borrowed anchor of its own');
assert.equal(blankMergedAnchor.retainPageContext, true, 'a blank merged anchor may keep the page as context');
const blankMergedSubordinate = review.describeSourceReviewSelection(emptyMergedTable, { row: 0, column: 1 });
assert.deepEqual(blankMergedSubordinate.cell, { row: 0, column: 1 },
  'clicking a blank merged subordinate keeps the selected cell identity');
assert.equal(blankMergedSubordinate.notice, 'merged-subordinate');
assert.equal(blankMergedSubordinate.evidence, null, 'a blank merged subordinate never gains evidence');
assert.equal(blankMergedSubordinate.previewEvidence, null, 'a blank merged region has no anchor preview');
assert.deepEqual(blankMergedSubordinate.mergedAnchor, { row: 0, column: 0 });
assert.equal(blankMergedSubordinate.retainPageContext, true,
  'a blank subordinate inside a blank merged region keeps the rendered page as context');
assert.equal(review.sourceReviewNoticeMessage(blankMergedSubordinate),
  'No separate source location is stored for this merged cell.',
  'retaining the page must not change the truthful merged notice');
assert.equal(emptyMergedTable.evidence[0][0], null, 'context retention must never write anchor evidence');
assert.equal(emptyMergedTable.rows[0][1], '', 'context retention must never rewrite cell values');
const whitespaceMergedRegion = review.describeSourceReviewSelection(table({
  rows: [['   ', ''], ['1001', 22960]],
  evidence: [[null, null], [evidence({ sourceText: '1001' }), evidence()]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] }), { row: 0, column: 1 });
assert.equal(whitespaceMergedRegion.retainPageContext, true,
  'a whitespace-only merged region is empty and may keep the page as context');
const partlyFilledMerge = review.describeSourceReviewSelection(table({
  rows: [['', 'stray'], ['1001', 22960]],
  evidence: [[null, null], [evidence({ sourceText: '1001' }), evidence()]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] }), { row: 0, column: 1 });
assert.equal(partlyFilledMerge.notice, 'merged-subordinate');
assert.equal(partlyFilledMerge.previewEvidence, null);
assert.equal(partlyFilledMerge.retainPageContext, false,
  'a merged region that still holds text keeps no page context when its provenance is missing');
const strayMergedAnchor = review.describeSourceReviewSelection(table({
  rows: [['', 'stray'], ['1001', 22960]],
  evidence: [[null, evidence({ sourceText: 'stray' })], [evidence({ sourceText: '1001' }), evidence()]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] }), { row: 0, column: 0 });
assert.equal(strayMergedAnchor.notice, 'empty-cell',
  'a blank anchor coordinate is still an ordinary empty cell, not a subordinate');
assert.equal(strayMergedAnchor.mergedAnchor, null, 'the merged anchor itself is never a subordinate');
assert.equal(strayMergedAnchor.retainPageContext, true,
  'an empty anchor coordinate keeps page context exactly like any other empty cell');
assert.equal(review.isEmptySourceCellAt(emptyMergedTable, { row: 0, column: 0 }), true);
assert.equal(review.isEmptySourceCellAt(table(), { row: 0, column: 0 }), false);
assert.equal(review.isEmptySourceCellAt(emptyMergedTable, { row: 9, column: 9 }), false,
  'an out-of-range coordinate is never treated as an empty retained context');
assert.equal(review.isEmptySourceCellAt(undefined, { row: 0, column: 0 }), false);
assert.equal(review.isEmptySourceCellAt(emptyMergedTable, null), false);
console.log('PASS: blank cells and blank merged regions keep page context while every other selection retains none.');

// 5. Highlight geometry: normalized evidence coordinates become percentages of the rendered page.
assert.deepEqual(review.sourceReviewBoxStyle({ left: 0, top: .25, width: 1, height: .5 }),
  { left: '0%', top: '25%', width: '100%', height: '50%' });
assert.deepEqual(review.sourceReviewBoxStyle({ left: .1234, top: .9876, width: .5, height: .02 }),
  { left: '12.34%', top: '98.76%', width: '50%', height: '2%' });
assert.deepEqual(review.sourceReviewBoxStyle({ left: -.2, top: -.1, width: 2, height: .05 }),
  { left: '0%', top: '0%', width: '100%', height: '5%' });
assert.equal(review.sourceReviewBoxStyle({ left: .9, top: 0, width: .4, height: .1 }).width, '10%',
  'a highlight must never overflow the rendered page');
assert.equal(review.sourceReviewBoxStyle({ left: Number.NaN, top: 0, width: .1, height: .1 }).left, '0%');
console.log('PASS: the overlay maps normalized bbox values to percentage offsets inside the page box.');

// 6. Details: page label, source type and only real OCR confidence.
assert.equal(review.sourceReviewPageLabel(3, 12), 'Page 3 of 12');
assert.equal(review.sourceReviewPageLabel(1, 0), 'Page 1');
assert.equal(review.sourceReviewSourceLabel(evidence()), 'PDF text');
assert.equal(review.sourceReviewSourceLabel(evidence({ source: 'ocr' })), 'OCR');
assert.equal(review.sourceReviewOcrConfidence(evidence()), null, 'native PDF text must never get an invented confidence');
assert.equal(review.sourceReviewOcrConfidence(evidence({ source: 'ocr' })), null);
assert.equal(review.sourceReviewOcrConfidence(evidence({ source: 'ocr', ocrConfidence: 91.4 })), 'OCR confidence: 91%');
assert.equal(review.sourceReviewCellLabel({ row: 2, column: 1 }), 'Row 3 · Column 2');
assert.equal(review.sourceReviewCellLabel(null), '');
console.log('PASS: selected-cell facts use the extracted page, source type and actual OCR confidence only.');

// 7. Component contract: the editable table, downloads and page-range tabs are preserved.
for (const phrase of ['Source Review', 'Select a cell to see where it came from in the PDF.',
  'No source location is available for this cell.', 'This cell is empty, so there is no source text to highlight.',
  'No separate source location is stored for this merged cell.',
  'Source location', 'Source text', 'OCR confidence', 'Loading the source page', 'could not be rendered'])
  assert.ok(source.includes(phrase), `missing Source Review copy: ${phrase}`);
assert.ok(component.includes('SOURCE_REVIEW_COPY.heading') && component.includes('SOURCE_REVIEW_COPY.instruction'));
assert.ok(component.includes('firstEvidenceCell(tables[selected])'), 'initial selection must come from evidence');
assert.ok(component.includes('describeSourceReviewSelection'));
assert.ok(component.includes('previewEvidence={selection.previewEvidence}'),
  'the viewer must receive preview evidence separately from selected-cell evidence');
assert.ok(component.includes('onFocus={() => setActiveCell(') && component.includes('onClick={() => setActiveCell('),
  'keyboard focus and pointer interaction must both select a cell');
assert.ok(component.includes('is-source-selected'));
assert.ok(component.includes('<AutoGrowTextarea') && component.includes('onChange={(event) => editCell('));
assert.ok(component.includes('createTableCsv') && component.includes('createExcelWorkbook'));
assert.ok(component.includes('Download this table (.csv)') && component.includes('Download Excel (.xlsx)'));
assert.ok(component.includes('p. {item.pageStart}'), 'table page-range labels must remain');
assert.ok(component.includes('value={String(table.rows[cell.row][cell.column] ?? "")}'),
  'every rendered cell keeps one controlled value from its real matrix coordinate');
const editCell = component.slice(component.indexOf('function editCell'), component.indexOf('const progressText'));
assert.ok(!editCell.includes('evidence'), 'editing a cell must never rewrite extracted evidence');
assert.ok(!editCell.includes('setActiveCell'), 'editing a cell must not move the Source Review selection');
assert.ok(component.indexOf('pdf-excel-review-source') < component.indexOf('pdf-excel-review-table'),
  'the source pane must render before the table so narrow screens stack Source Review first');
console.log('PASS: editable cells, CSV/XLSX downloads, page-range tabs and provenance immutability hold.');

// 8. Viewer contract: local PDF.js lifecycle, one shared orientation, no browser PDF plugin.
assert.ok(viewer.includes('loadPdfRendererDocument'));
assert.ok(!/iframe|embed|object data=|plugin/i.test(viewer), 'Source Review must not embed the browser PDF plugin');
assert.ok(viewer.includes('loadingTask') && viewer.includes('.destroy()'), 'the loading task must be destroyed');
assert.ok(viewer.includes('renderTaskRef.current?.cancel()'), 'an obsolete render task must be cancelled');
assert.ok(viewer.includes('pageRef.current?.cleanup()'), 'page resources must be cleaned up');
assert.ok(viewer.includes('renderedKeyRef.current === renderKey'), 'the same page and rotation must not rerender');
assert.ok(viewer.includes('const displayEvidence = evidence ?? previewEvidence'),
  'only the viewer may fall back from selected-cell evidence to merged-anchor preview evidence');
assert.ok(viewer.includes('const desiredPreviewIdentity = sourceReviewPreviewIdentity(sourceFileKey(file), displayEvidence)'));
assert.ok(viewer.includes('sourceReviewPreviewMatches(desiredPreviewIdentity, renderedPreviewIdentity)'),
  'new evidence must be compared synchronously with the source actually painted into the canvas');
assert.ok(viewer.includes('sourceReviewRotation(page.rotate, displayEvidence.rotation ?? 0)'),
  'page render and highlight must share one display rotation');
assert.ok(!/transform:\s*rotate|rotateZ|rotate3d|-webkit-transform/i.test(viewer),
  'the highlight must not be CSS-rotated separately from the page');
assert.ok(viewer.includes('clampSourceReviewPixelRatio(window.devicePixelRatio)'));
assert.ok(viewer.includes('getContext("2d", { alpha: false })'));
assert.ok(viewer.includes('sourceReviewBoxStyle(displayEvidence.bbox)'));
assert.ok(viewer.includes('displayEvidence && previewMatchesRenderedSource &&'),
  'highlight and details must remain hidden until the desired source is actually rendered');
assert.ok(viewer.includes('style={previewIsPending ? { visibility: "hidden" } : undefined}'),
  'a stale canvas must be visually unavailable while a different source identity renders');
assert.ok(viewer.includes('notice === "merged-subordinate" && previewEvidence ? mergedAnchor : cell'),
  'merged preview details must identify the real anchor source region');
assert.ok(viewer.includes('Merged source region:'), 'merged fallback details must be explicit, not misleading');
assert.ok(viewer.includes('role="img"') && viewer.includes('aria-live') && viewer.includes('role="alert"'));
assert.ok(viewer.includes('aria-label="Zoom out"') && viewer.includes('aria-label="Zoom in"'));
assert.ok(!/dangerouslySetInnerHTML/.test(viewer + component));
console.log('PASS: the viewer owns a cached, cancellable PDF.js lifecycle and shares one orientation with the overlay.');

// 9. Scoped styling, responsive panes and no fake review signals.
assert.ok(reviewStyles.includes('grid-template-columns: minmax(0, 45fr) minmax(0, 55fr)'), 'desktop panes are 45/55');
assert.ok(/@media \(min-width: 56\.25rem\)/.test(reviewStyles) && /\.pdf-excel-review \{ display: grid/.test(reviewStyles),
  'panes must stack below the desktop breakpoint');
assert.ok(reviewStyles.includes('.pdf-excel-source-highlight') && reviewStyles.includes('.pdf-excel-source-viewport'));
assert.ok(reviewStyles.includes('.pdf-excel-table-scroll tr td.is-source-selected'));
const highlightRule = reviewStyles.slice(reviewStyles.indexOf('.pdf-excel-source-highlight {'),
  reviewStyles.indexOf('.pdf-excel-source-notice'));
assert.ok(!/animation|transition|transform/.test(highlightRule), 'the highlight must not animate or rotate itself');
assert.ok(!/success|danger/.test(highlightRule), 'the highlight must not imply correct/incorrect cells');
assert.ok(!/--color-success-500|--color-danger-500/.test(reviewStyles), 'Source Review adds no correctness palette');
const forbidden = /Verified by ToolNest|accuracy score|confidence score|OCR accuracy|100% verified|is-correct|is-incorrect|is-verified|automated validation/i;
assert.ok(!forbidden.test(component + viewer + reviewStyles + source), 'no fake review signals are allowed yet');
console.log('PASS: Source Review styling stays scoped, stacks on mobile and adds no correctness signals.');

// 10. Balanced panes: an independent, display-only table zoom beside the PDF zoom.
assert.ok(component.includes('useState(TABLE_VIEW_DEFAULT_ZOOM)'), 'table zoom must default to 100%');
assert.ok(component.includes('tableZoom <= TABLE_VIEW_MIN_ZOOM') && component.includes('tableZoom >= TABLE_VIEW_MAX_ZOOM'),
  'table zoom buttons must disable at the 75%/150% bounds');
assert.ok(component.includes('setTableZoom(clampTableViewZoom(tableZoom - TABLE_VIEW_ZOOM_STEP))') &&
  component.includes('setTableZoom(clampTableViewZoom(tableZoom + TABLE_VIEW_ZOOM_STEP))'),
  'table zoom steps must stay clamped to the bounded range');
assert.ok(component.includes('aria-label="Zoom out table"') && component.includes('aria-label="Zoom in table"'),
  'table zoom controls need their own accessible names');
assert.ok(component.includes('SOURCE_REVIEW_COPY.tableLabel') && source.includes('Extracted table'),
  'the right pane gets one concise label that does not repeat the Source Review heading');
assert.ok(component.includes('className="pdf-excel-source-toolbar pdf-excel-table-toolbar"'),
  'both panes must share one toolbar layout so their viewports start on the same line');
assert.ok(component.indexOf('pdf-excel-table-toolbar') < component.indexOf('pdf-excel-table-scroll" style='),
  'the table toolbar must render above the table viewport');
assert.ok(component.includes('"--table-zoom"'), 'table zoom must be a scoped CSS variable, not browser zoom');
const tableZoomScope = styles.slice(styles.indexOf('.pdf-excel-table-scroll {'), styles.indexOf('.pdf-excel-review-head'));
assert.ok(tableZoomScope.includes('--table-zoom: 1'), 'the table viewport must default its own zoom variable');
assert.ok(/calc\(1em \* var\(--table-zoom\)\)/.test(tableZoomScope), 'table text must scale through the scoped variable');
assert.ok(/calc\(9rem \* var\(--table-zoom\)\)/.test(tableZoomScope) && /calc\(2\.5rem \* var\(--table-zoom\)\)/.test(tableZoomScope),
  'cell dimensions must scale through the scoped variable');
assert.ok(!/transform/.test(tableZoomScope), 'table zoom must not rely on CSS transforms');
assert.ok(!component.includes('transform'), 'table zoom must not rely on CSS transforms in the component');
const zoomFreeEdit = component.slice(component.indexOf('function editCell'), component.indexOf('const progressText'));
assert.ok(!zoomFreeEdit.includes('tableZoom'), 'table zoom must never rewrite cell values');
assert.ok(!/create(ExcelWorkbook|TableCsv)\([^)]*tableZoom/.test(component), 'table zoom must never change CSV/XLSX output');
const viewportHeight = (selector) => {
  const rule = styles.slice(styles.indexOf(selector), styles.indexOf(selector) + 260);
  const match = /max-height: ([\d.]+rem)/.exec(rule);
  assert.ok(match, `missing viewport height for ${selector}`);
  return match[1];
};
assert.equal(viewportHeight('.pdf-excel-table-scroll {'), viewportHeight('.pdf-excel-source-viewport {'),
  'both pane viewports must share one height so they stay visually aligned');
console.log('PASS: the extracted table gets an independent display-only zoom toolbar aligned with the PDF pane.');
// 11. Empty-context UX: keep the rendered page, remove the highlight, never invent evidence.
assert.ok(viewer.includes('sourceReviewNoticeMessage'), 'the viewer must reuse the shared notice copy');
assert.ok(viewer.includes('retainPageContext'), 'the viewer must receive the retention decision from the selection');
assert.ok(!viewer.includes('notice === "empty-cell"'),
  'the viewer must never guess the contextual-retention decision from notice strings');
assert.ok(component.includes('retainPageContext={selection.retainPageContext}'),
  'the selection contract must pass the retention decision to the viewer unchanged');
assert.ok(viewer.includes('const keepsRenderedPage = retainPageContext && renderedFileRef.current === sourceFileKey(file)'),
  'only a genuinely empty selection of the current file may keep the rendered page');
assert.ok(/const showPreview = Boolean\(displayEvidence\) \|\| \(retainPageContext && renderedPageLabel !== ""\)/.test(viewer),
  'an empty context keeps the rendered page preview visible while a real one is required');
assert.ok(viewer.includes('displayEvidence && previewMatchesRenderedSource &&'),
  'the highlight must still require a real selected or merged-anchor evidence object');
assert.ok(viewer.includes('previewMatchesRenderedSource && <div className="pdf-excel-source-details"'),
  'page, source-type and source-text details must require a current rendered source');
const emptyRetention = viewer.slice(viewer.indexOf('if (!displayEvidence) {'), viewer.indexOf('setStatus("idle")'));
assert.ok(/keepsRenderedPage = retainPageContext && renderedFileRef\.current === sourceFileKey\(file\)/.test(emptyRetention),
  'the retained page must belong to the current source file');
assert.ok(emptyRetention.indexOf('keepsRenderedPage') < emptyRetention.indexOf('cleared.width = 0'),
  'the retained page is dropped whenever the selection is not an empty context or the file changed');
assert.ok(viewer.includes('setRenderedPageLabel(sourceReviewPageLabel(displayEvidence.page, totalPages))'),
  'the retained page keeps its real page label instead of an invented one');
const fileReset = viewer.slice(viewer.indexOf('A replaced source file invalidates'), viewer.indexOf('}, [file]);'));
assert.ok(fileReset.includes('renderedFileRef.current = ""') && fileReset.includes('renderedKeyRef.current = ""'),
  'a replaced file must invalidate the retained page identity');
assert.ok(fileReset.includes('cleared.width = 0') && fileReset.includes('setRenderedPageLabel("")'),
  'a replaced file must clear the retained page canvas and label');
assert.ok(fileReset.includes('setRenderedPreviewIdentity(null)') && fileReset.includes('setStatusPreviewIdentity(null)'),
  'a replaced file must also drop the rendered identity that gates the retained page');
assert.ok(fileReset.includes('renderedFileRef.current = ""') &&
  viewer.includes('renderedFileRef.current === sourceFileKey(file)'),
  'a retained context can only ever survive while the canvas belongs to the current source file');
const emptyPreview = review.describeSourceReviewSelection(table(), { row: 2, column: 1 });
assert.equal(emptyPreview.notice, 'empty-cell');
assert.equal(emptyPreview.evidence, null, 'an empty cell can never carry a bbox or source text');
assert.equal(emptyPreview.previewEvidence, null, 'empty-cell page retention must not depend on borrowed evidence');
assert.equal(emptyPreview.mergedAnchor, null);
assert.equal(emptyPreview.retainPageContext, true, 'an ordinary empty cell allows context retention');
assert.equal(review.describeSourceReviewSelection(emptyMergedTable, { row: 0, column: 1 }).retainPageContext, true,
  'a blank merged subordinate keeps page context instead of blanking the viewer');
assert.equal(review.describeSourceReviewSelection(emptyMergedTable, { row: 0, column: 1 }).previewEvidence, null,
  'a blank merged subordinate keeps the context without a fabricated highlight source');
assert.equal(review.describeSourceReviewSelection(mergedTable, { row: 0, column: 1 }).retainPageContext, false,
  'a merged subordinate with real anchor evidence uses the real anchor preview, never the empty fallback');
assert.equal(review.describeSourceReviewSelection(mergedTable, { row: 0, column: 1 }).previewEvidence.sourceText, 'EARNINGS');
console.log('PASS: empty selections keep the rendered page without a highlight and never invent source evidence.');

// 11b. Transitional truthfulness: rendered identity advances only after successful rendering.
const renderStart = viewer.indexOf('const task = page.render({');
const renderFinish = viewer.indexOf('await task.promise;', renderStart);
const renderPromotion = viewer.indexOf('setRenderedPreviewIdentity(desiredPreviewIdentity);', renderFinish);
assert.ok(renderStart >= 0 && renderFinish > renderStart && renderPromotion > renderFinish,
  'a source identity may become current only after its page render finishes successfully');
const renderCatch = viewer.indexOf('} catch (caught)', renderPromotion);
assert.ok(renderCatch > renderPromotion);
assert.equal(viewer.slice(renderCatch).includes('setRenderedPreviewIdentity(desiredPreviewIdentity)'), false,
  'failed or cancelled renders must never promote their desired source identity');
assert.ok(viewer.includes('setRenderedPreviewIdentity(null)') && viewer.includes('setStatusPreviewIdentity(null)'),
  'file replacement and evidence-free clearing must invalidate prior rendered/status identities');
assert.ok(viewer.includes('previewIsPending && !(statusMatchesDesiredSource && status === "error")'),
  'a new source must show loading rather than a stale prior ready/error state');
console.log('PASS: cross-page transitions hide stale canvas/evidence until successful render completion.');

// 12. Uploader copy derives the real page limit from the engine constant.
const toExcelSource = fs.readFileSync(path.resolve('lib/pdf/to-excel.ts'), 'utf8');
const pageLimit = Number(/export const MAX_PDF_TO_EXCEL_SOURCE_PAGES = (\d+);/.exec(toExcelSource)[1]);
assert.equal(pageLimit, 300, 'the engine limits PDF-to-Excel sources to 300 pages');
assert.ok(component.includes('up to ${MAX_PDF_TO_EXCEL_SOURCE_PAGES} pages'),
  'the uploader helper text must derive the page limit from the engine constant');
assert.ok(!component.includes('up to 300 pages'), 'the page limit must never be hard-coded in the uploader copy');
assert.equal(`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum · up to ${pageLimit} pages`,
  'One PDF · 100 MB maximum · up to 300 pages', 'the uploader must advertise the real limits');
console.log('PASS: the uploader advertises the real 300-page PDF-to-Excel limit from the engine constant.');
// 13. Merge rendering: table.merges becomes real colSpan/rowSpan and covered coordinates are skipped.
const spanning = table({
  rows: [['EARNINGS', '', '', '', '', 100], ['Total', '', '', '', '', 15]],
  evidence: [[evidence({ sourceText: 'EARNINGS' }), null, null, null, null, evidence({ sourceText: '100' })],
    [evidence({ sourceText: 'Total' }), null, null, null, null, null]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 4 }] });
const spanningPlan = tableView.tableViewPlan(spanning);
assert.equal(spanningPlan.rows[0].length, 2, 'an A:E merge renders one anchor cell plus the untouched column F');
assert.deepEqual(spanningPlan.rows[0][0], { row: 0, column: 0, rowSpan: 1, colSpan: 5, merged: true });
assert.deepEqual(spanningPlan.rows[0][1], { row: 0, column: 5, rowSpan: 1, colSpan: 1, merged: false });
assert.equal(spanningPlan.rows[0].some((planCell) => planCell.column > 0 && planCell.column < 5), false,
  'no subordinate <td> is produced for a covered coordinate');
assert.deepEqual(spanningPlan.applied, [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 4 }]);
assert.deepEqual(spanningPlan.skipped, [], 'a faithful merge needs no structure warning');
assert.deepEqual(tableView.tableViewCellAt(spanningPlan, 0, 3), spanningPlan.rows[0][0],
  'a covered coordinate resolves to the one rendered anchor cell instead of its own <td>');
assert.equal(spanningPlan.rows[0].some((planCell) => planCell.column === 3), false,
  'no plan cell is ever produced for a covered coordinate');
assert.equal(tableView.tableViewCellAt(spanningPlan, 0, 0).colSpan, 5);

const stackedTable = table({ rows: [['Group', 'A'], ['', 'B'], ['', 'C']],
  merges: [{ startRow: 0, endRow: 2, startColumn: 0, endColumn: 0 }] });
const stackedPlan = tableView.tableViewPlan(stackedTable);
assert.deepEqual(stackedPlan.rows[0][0], { row: 0, column: 0, rowSpan: 3, colSpan: 1, merged: true });
assert.deepEqual(stackedPlan.rows[1].map((planCell) => planCell.column), [1],
  'a vertically covered row skips the covered coordinate');
assert.deepEqual(stackedPlan.rows[2].map((planCell) => planCell.column), [1]);
assert.deepEqual(tableView.tableViewCellAt(stackedPlan, 2, 0), { row: 0, column: 0, rowSpan: 3, colSpan: 1, merged: true });

const blockPlan = tableView.tableViewPlan(table({ rows: [['Block', ''], ['', '']],
  merges: [{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 1 }] }));
assert.deepEqual(blockPlan.rows[0][0], { row: 0, column: 0, rowSpan: 2, colSpan: 2, merged: true });
assert.deepEqual(blockPlan.rows[1], [], 'a fully covered row renders no <td> at all');

const plainPlan = tableView.tableViewPlan(table());
assert.deepEqual(plainPlan.rows.map((row) => row.map((planCell) =>
  [planCell.row, planCell.column, planCell.rowSpan, planCell.colSpan, planCell.merged])),
  [[[0, 0, 1, 1, false], [0, 1, 1, 1, false]], [[1, 0, 1, 1, false], [1, 1, 1, 1, false]],
    [[2, 0, 1, 1, false], [2, 1, 1, 1, false]]],
  'a table without merges renders every coordinate normally');
assert.deepEqual(plainPlan.applied, []); assert.deepEqual(plainPlan.skipped, []);
assert.equal(tableView.tableViewCellAt(plainPlan, 1, 1).merged, false,
  'an unmerged coordinate resolves to its own rendered cell');
assert.deepEqual(tableView.tableViewPlan(undefined), { rows: [], applied: [], skipped: [] });
assert.deepEqual(tableView.tableViewPlan(table({ rows: [] })).rows, []);
assert.equal(tableView.tableViewPlan({ ...table(), rows: [['A', 'B'], ['C']] }).rows[1].length, 1,
  'a short row keeps its real length');
console.log('PASS: horizontal, vertical and unmerged regions render through real colSpan/rowSpan from table.merges.');

// 13b. Selection normalization, anchor-only editing and defensiveness against unusable merges.
assert.deepEqual(tableView.tableViewSelection(spanningPlan, { row: 0, column: 3 }), { row: 0, column: 0 },
  'clicking or reviewing inside a merged region selects the real merge anchor coordinate');
assert.deepEqual(tableView.tableViewSelection(spanningPlan, { row: 0, column: 5 }), { row: 0, column: 5 },
  'an ordinary cell keeps selecting itself');
assert.deepEqual(tableView.tableViewSelection(stackedPlan, { row: 1, column: 0 }), { row: 0, column: 0 });
assert.equal(tableView.tableViewSelection(spanningPlan, null), null);
assert.deepEqual(tableView.tableViewSelection(spanningPlan, { row: 9, column: 9 }), { row: 9, column: 9 },
  'an out-of-matrix selection is never silently rewritten');
const reviewedSubordinate = review.describeSourceReviewSelection(spanning, { row: 0, column: 3 });
assert.equal(reviewedSubordinate.notice, 'merged-subordinate',
  'provenance still resolves the real reviewed coordinate instead of the displayed anchor');
assert.equal(reviewedSubordinate.evidence, null);
assert.equal(reviewedSubordinate.previewEvidence.sourceText, 'EARNINGS',
  'the merged subordinate still previews only the real anchor evidence');
assert.deepEqual(reviewedSubordinate.mergedAnchor, { row: 0, column: 0 });

const editedAnchorRows = spanning.rows.map((row) => [...row]);
const renderedAnchor = tableView.tableViewCellAt(spanningPlan, 0, 0);
editedAnchorRows[renderedAnchor.row][renderedAnchor.column] = 'EDITED';
assert.deepEqual(editedAnchorRows[0], ['EDITED', '', '', '', '', 100],
  'the rendered merged cell writes only its real anchor coordinate');
const rowsBefore = JSON.stringify(spanning.rows), mergesBefore = JSON.stringify(spanning.merges);
tableView.tableViewPlan(spanning);
assert.equal(JSON.stringify(spanning.rows), rowsBefore, 'rendering must never rewrite table.rows');
assert.equal(JSON.stringify(spanning.merges), mergesBefore, 'rendering must never rewrite table.merges');
assert.notEqual(spanningPlan.applied[0], spanning.merges[0], 'the plan never aliases the stored merge objects');
assert.equal(tableView.tableViewPlan(Object.freeze({ ...spanning,
  rows: Object.freeze(spanning.rows.map((row) => Object.freeze([...row]))),
  merges: Object.freeze([Object.freeze({ ...spanning.merges[0] })]) })).rows[0][0].colSpan, 5,
  'a frozen extracted table must render unchanged');

const hidingPlan = tableView.tableViewPlan(table({ rows: [['EARNINGS', '32,000', '', '', '', 100]],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 4 }] }));
assert.deepEqual(hidingPlan.applied, [], 'a merge that would hide a stored value is never applied');
assert.deepEqual(hidingPlan.skipped, [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 4 }]);
assert.equal(hidingPlan.rows[0].length, 6, 'the conservative fallback keeps every coordinate visible');
assert.equal(tableView.tableViewMergeNotice(hidingPlan),
  '1 merged region is shown cell by cell because the stored values underneath would otherwise be hidden.');
assert.equal(tableView.tableViewMergeNotice(spanningPlan), null, 'a faithful table renders no structure note');
for (const merge of [{ startRow: 1, endRow: 0, startColumn: 0, endColumn: 1 },
  { startRow: 0, endRow: 0, startColumn: 2, endColumn: 0 },
  { startRow: 0, endRow: 0, startColumn: 0, endColumn: 9 },
  { startRow: 0, endRow: 8, startColumn: 0, endColumn: 1 },
  { startRow: Number.NaN, endRow: 0, startColumn: 0, endColumn: 1 }]) {
  const unusable = tableView.tableViewPlan(table({ merges: [merge] }));
  assert.deepEqual(unusable.applied, [], `unusable merge ${JSON.stringify(merge)} must never be applied`);
  assert.equal(unusable.rows[0].length, 2, 'every coordinate stays rendered when a merge is unusable');
  assert.equal(unusable.skipped.length, 1);
}
const overlappingPlan = tableView.tableViewPlan(table({ rows: [['a', '', ''], ['b', '', '']],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 2 }, { startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 }] }));
assert.equal(overlappingPlan.applied.length, 1, 'only the first of two overlapping merges may drive the rendering');
assert.equal(overlappingPlan.skipped.length, 1);
assert.equal(overlappingPlan.rows[0][0].colSpan, 3);
const singlePlan = tableView.tableViewPlan(table({ merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }] }));
assert.deepEqual(singlePlan.applied, []); assert.deepEqual(singlePlan.skipped, [],
  'a 1x1 region is not a merge and hides nothing');
const duplicatePlan = tableView.tableViewPlan(table({ rows: [['Group', '', 'x'], ['y', '', 'z']],
  merges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 },
    { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }] }));
assert.equal(duplicatePlan.applied.length, 1); assert.deepEqual(duplicatePlan.skipped, [],
  'the same region described twice renders once and needs no warning');
console.log('PASS: merged anchors stay editable and unusable merges fall back without hiding or rewriting data.');

// 13c. Component contract: the preview renders the plan, selects real coordinates and keeps downloads on the matrix.
const mergeRender = component.slice(component.indexOf('pdf-excel-table-scroll" style='),
  component.indexOf('pdf-excel-edit-note">{mergeNotice'));
assert.ok(mergeRender.includes('{tableView.rows.map((row, rowIndex) => <tr key={rowIndex}>'),
  'the preview must render the merge-aware plan');
assert.ok(!mergeRender.includes('table.rows.map((row, rowIndex)'),
  'the preview must not render every matrix coordinate independently');
assert.ok(mergeRender.includes('rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}') &&
  mergeRender.includes('colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}'),
  'rendered spans must come from table.merges through the plan');
assert.ok(mergeRender.includes('visibleSelection && visibleSelection.row === cell.row && visibleSelection.column === cell.column'),
  'the selected-cell styling must follow the normalized visible selection');
assert.ok(component.includes('const tableView = useMemo(() => tableViewPlan(table), [table])'));
assert.ok(component.includes('const visibleSelection = tableViewSelection(tableView, activeCell)'));
assert.ok(component.includes('{mergeNotice && <p className="pdf-excel-edit-note">{mergeNotice}</p>}'));
assert.ok(component.includes('onReviewCell={setActiveCell}'),
  'Automatic Checks navigation must keep selecting the real reviewed coordinate');
assert.ok(component.includes('onFocus={() => setActiveCell({ row: cell.row, column: cell.column })}') &&
  component.includes('onClick={() => setActiveCell({ row: cell.row, column: cell.column })}'),
  'focus and click must select the rendered real coordinate, which is the anchor inside a merged region');
assert.ok(component.includes('createTableCsv(table)') && component.includes('createExcelWorkbook(nextTables)'),
  'downloads must keep consuming the original extracted table instead of the rendered DOM');
assert.ok(!/create(TableCsv|ExcelWorkbook)\([^)]*tableView/.test(component));
assert.ok(component.includes('onChange={(event) => editCell(cell.row, cell.column, event.target.value)}'),
  'an edit must target the rendered real coordinate only');
console.log('PASS: the preview renders table.merges, keeps anchors editable and leaves downloads on the matrix.');

// 14. Long text: one small auto-growing textarea keeps the controlled value and grows to its content.
const autoGrow = fs.readFileSync(path.resolve('components/ui/auto-grow-textarea.tsx'), 'utf8');
assert.ok(autoGrow.includes('<textarea') && autoGrow.includes('useLayoutEffect'),
  'the shared textarea must measure its content after paint');
assert.ok(autoGrow.includes('element.style.height = "auto"') && autoGrow.includes('element.scrollHeight'),
  'the height must be derived from the real content height');
assert.ok(autoGrow.includes('[value, zoom]'),
  'the height must be re-measured after value edits, table changes and zoom changes');
assert.ok(autoGrow.includes('{...textareaProps}') && autoGrow.includes('value={value}'),
  'the controlled value stays owned by the caller and is never rewritten');
assert.ok(!autoGrow.includes('contentEditable') && !autoGrow.includes('rows='),
  'auto-grow replaces the fixed row heuristic without contentEditable');
assert.ok(component.includes('<AutoGrowTextarea') && component.includes('zoom={tableZoom}'),
  'every extracted cell renders the auto-growing textarea and re-measures with the display zoom');
assert.ok(!component.includes('rows={'), 'the preview must not force a fixed textarea height');
assert.ok(/\.pdf-excel-table-scroll textarea \{[^}]*resize: none/.test(styles),
  'a manual resize handle must not fight the measured height');
assert.ok(/\.pdf-excel-table-scroll textarea \{[^}]*overflow-y: hidden/.test(styles),
  'no internal scrollbar may appear while the cell still fits its content');
assert.ok(/\.pdf-excel-table-scroll textarea \{[^}]*min-height: calc\(2\.5rem \* var\(--table-zoom\)\)/.test(styles),
  'an empty cell keeps its zoom-scaled minimum height');
assert.ok(!/tableView[A-Za-z]*\([^)]*tableZoom/.test(component),
  'the merge plan must stay independent of the display-only zoom');
assert.ok(!/transform/.test(component.slice(component.indexOf('pdf-excel-table-scroll" style='),
  component.indexOf('pdf-excel-edit-note">{mergeNotice'))), 'table zoom must not rely on CSS transforms');
console.log('PASS: long cell text auto-grows to its content while the controlled value and zoom stay display-only.');

console.log('PASS: PDF to Excel Source Review unit and UI contract checks completed.');



async function renderedInkRatio(page, box, rotation) {
  const viewport = page.getViewport({ scale: .75, rotation });
  const output = canvas.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = output.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, output.width, output.height);
  await page.render({ canvas:output, canvasContext:context, viewport, intent:'print', background:'rgb(255,255,255)' }).promise;
  const x = Math.max(0, Math.floor(box.left * output.width));
  const y = Math.max(0, Math.floor(box.top * output.height));
  const width = Math.max(1, Math.ceil(box.width * output.width));
  const height = Math.max(1, Math.ceil(box.height * output.height));
  const data = context.getImageData(x, y, Math.min(width, output.width - x), Math.min(height, output.height - y)).data;
  let ink = 0;
  for (let index = 0; index < data.length; index += 4)
    if (data[index] < 220 || data[index + 1] < 220 || data[index + 2] < 220) ink += 1;
  return ink / (data.length / 4);
}

function displayedPoint(rotation, x, y) {
  if (rotation === 0) return { x, y:650 - y };
  if (rotation === 90) return { x:y, y:x };
  if (rotation === 180) return { x:470 - x, y };
  return { x:470 - y, y:650 - x };
}

async function intrinsicRotationFixture(rotation) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([470, 650]); page.setRotation(degrees(rotation));
  const displayedWidth = rotation === 90 || rotation === 270 ? 650 : 470;
  const angle = rotation === 0 ? 0 : rotation === 90 ? -90 : rotation === 180 ? 180 : 90;
  const xs = [40, 140, 350, displayedWidth - 40], ys = [50, 120, 190, 260, 330];
  for (const y of ys) page.drawLine({ start:displayedPoint(rotation, xs[0], y),
    end:displayedPoint(rotation, xs.at(-1), y), thickness:1, color:rgb(.15, .2, .3) });
  for (const x of xs) page.drawLine({ start:displayedPoint(rotation, x, ys[0]),
    end:displayedPoint(rotation, x, ys.at(-1)), thickness:1, color:rgb(.15, .2, .3) });
  const rows = [['Item','Description','Amount'],['1001','Paper','25.50'],
    ['1002','Folders','8'],['1003','Binders','12']];
  rows.forEach((row, rowIndex) => row.forEach((value, column) => {
    const point = displayedPoint(rotation, xs[column] + 8, ys[rowIndex] + 42);
    page.drawText(value, { ...point, size:11, font, rotate:degrees(angle) });
  }));
  return pdf.save();
}

function rotatedRaster(source, rotation) {
  if (!rotation) return source;
  const turned = canvas.createCanvas(rotation === 90 || rotation === 270 ? source.height : source.width,
    rotation === 90 || rotation === 270 ? source.width : source.height);
  const context = turned.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, turned.width, turned.height);
  context.translate(turned.width / 2, turned.height / 2);
  context.rotate(rotation * Math.PI / 180);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return turned;
}

(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  for (const rotation of [0, 90, 180, 270]) {
    const loadingTask = pdfjs.getDocument({ data:new Uint8Array(await intrinsicRotationFixture(rotation)),
      enableScripting:false, isEvalSupported:false, useWorkerFetch:false });
    const document = await loadingTask.promise, page = await document.getPage(1);
    try {
      assert.equal(page.rotate, rotation);
      const tables = await extractVectorGridTables(page, await page.getTextContent());
      assert.equal(tables.length, 1, `valid displayed table with intrinsic rotation ${rotation}`);
      const evidence = tables[0].evidence.flat().find(Boolean);
      assert.ok(evidence && await renderedInkRatio(page, evidence.bbox, page.rotate) > .02,
        `intrinsic rotation ${rotation} evidence must overlap rendered source ink`);
    } finally { page.cleanup(); await loadingTask.destroy(); }
  }
  console.log('PASS: valid upright native tables remain reviewable and aligned for intrinsic 0/90/180/270 rotations.');

  const upright = canvas.createCanvas(1400, 1000), context = upright.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, upright.width, upright.height);
  context.strokeStyle = '#111'; context.lineWidth = 4;
  for (const x of [60, 380, 980, 1340]) { context.beginPath(); context.moveTo(x, 80); context.lineTo(x, 920); context.stroke(); }
  for (const y of [80, 220, 360, 500, 640, 780, 920]) { context.beginPath(); context.moveTo(60, y); context.lineTo(1340, y); context.stroke(); }
  context.fillStyle = '#111'; context.font = 'bold 46px Arial'; context.fillText('ITEM', 78, 168);
  const evidenceBox = { left:60 / 1400, top:80 / 1000, width:320 / 1400, height:140 / 1000 };
  for (const inputRotation of [0, 90, 180, 270]) {
    const image = rotatedRaster(upright, inputRotation), pdf = await PDFDocument.create();
    const embedded = await pdf.embedPng(image.toBuffer('image/png'));
    const target = pdf.addPage([image.width / 2, image.height / 2]);
    target.drawImage(embedded, { x:0, y:0, width:target.getWidth(), height:target.getHeight() });
    const loadingTask = pdfjs.getDocument({ data:new Uint8Array(await pdf.save()),
      enableScripting:false, isEvalSupported:false, useWorkerFetch:false });
    const document = await loadingTask.promise, page = await document.getPage(1);
    const correction = (360 - inputRotation) % 360;
    try {
      const displayRotation = review.sourceReviewRotation(page.rotate, correction);
      assert.ok(await renderedInkRatio(page, evidenceBox, displayRotation) > .02,
        `OCR correction ${correction} must keep the evidence box over source ink`);
    } finally { page.cleanup(); await loadingTask.destroy(); }
  }
  console.log('PASS: OCR correction geometry keeps normalized evidence aligned for 0/90/180/270-degree scans.');
})().catch(error => { console.error(error); process.exitCode = 1; });
