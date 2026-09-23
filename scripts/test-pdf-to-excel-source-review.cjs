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
assert.equal(review.sourceReviewNoticeMessage(selected), null);
const emptyCell = review.describeSourceReviewSelection(table(), { row: 2, column: 1 });
assert.equal(emptyCell.notice, 'no-source-location'); assert.equal(emptyCell.evidence, null);
assert.equal(review.sourceReviewNoticeMessage(emptyCell), 'No source location is available for this cell.');
const missing = review.describeSourceReviewSelection(table(), { row: 2, column: 0 });
assert.equal(missing.notice, 'no-source-location', 'a non-empty cell without provenance must not get a fabricated box');
const merged = review.describeSourceReviewSelection(mergedTable, { row: 0, column: 1 });
assert.equal(merged.notice, 'merged-subordinate'); assert.equal(merged.evidence, null);
assert.deepEqual(merged.mergedAnchor, { row: 0, column: 0 });
assert.equal(review.sourceReviewNoticeMessage(merged), 'No separate source location is stored for this merged cell.');
assert.deepEqual(review.mergeAnchorCell(mergedTable, 0, 0), null, 'the merged anchor itself is not a subordinate');
assert.equal(review.mergeAnchorCell(table(), 2, 0), null);
assert.equal(review.describeSourceReviewSelection(undefined, null).notice, 'no-source-location');
assert.equal(review.describeSourceReviewSelection(undefined, null).evidence, null);
console.log('PASS: evidence, empty, missing-provenance and merged-subordinate selections stay truthful.');

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
  'No source location is available for this cell.', 'No separate source location is stored for this merged cell.',
  'Source location', 'Source text', 'OCR confidence', 'Loading the source page', 'could not be rendered'])
  assert.ok(source.includes(phrase), `missing Source Review copy: ${phrase}`);
assert.ok(component.includes('SOURCE_REVIEW_COPY.heading') && component.includes('SOURCE_REVIEW_COPY.instruction'));
assert.ok(component.includes('firstEvidenceCell(tables[selected])'), 'initial selection must come from evidence');
assert.ok(component.includes('describeSourceReviewSelection'));
assert.ok(component.includes('onFocus={() => setActiveCell(') && component.includes('onClick={() => setActiveCell('),
  'keyboard focus and pointer interaction must both select a cell');
assert.ok(component.includes('is-source-selected'));
assert.ok(component.includes('<textarea') && component.includes('onChange={(event) => editCell('));
assert.ok(component.includes('createTableCsv') && component.includes('createExcelWorkbook'));
assert.ok(component.includes('Download this table (.csv)') && component.includes('Download Excel (.xlsx)'));
assert.ok(component.includes('p. {item.pageStart}'), 'table page-range labels must remain');
assert.ok(component.includes('rows={String(cell).includes("\\n") ? 2 : 1}'), 'cell textarea sizing must remain');
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
assert.ok(viewer.includes('sourceReviewRotation(page.rotate, evidence.rotation ?? 0)'),
  'page render and highlight must share one display rotation');
assert.ok(!/transform:\s*rotate|rotateZ|rotate3d|-webkit-transform/i.test(viewer),
  'the highlight must not be CSS-rotated separately from the page');
assert.ok(viewer.includes('clampSourceReviewPixelRatio(window.devicePixelRatio)'));
assert.ok(viewer.includes('getContext("2d", { alpha: false })'));
assert.ok(viewer.includes('sourceReviewBoxStyle(evidence.bbox)'));
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