require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const canvas = require('@napi-rs/canvas');
const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = require('pdf-lib');
const { pathToFileURL } = require('node:url');

const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) { return resolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args); };
globalThis.DOMMatrix = canvas.DOMMatrix;
globalThis.ImageData = canvas.ImageData;
globalThis.Path2D = canvas.Path2D;
Promise.try ??= (callback, ...args) => Promise.resolve().then(() => callback(...args));

const N = value => PDFName.of(value);
const { inspectPdfPrivacy } = require('../lib/pdf/privacy-inspect.ts');
const { groupPrivacyFindings, quickCleanSelection, makeSanitizedPrivacyFilename, runPrivacySanitization } = require('../lib/pdf/privacy-workflow.ts');
const { sanitizePdfMetadata, sanitizePdfAttachments, sanitizePdfActiveActions, sanitizePdfReviewAnnotations, sanitizePdfExternalLinks } = require('../lib/pdf/privacy-sanitize.ts');
let openRenderer;

async function fixture(edit = async () => {}) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const page = pdf.addPage([420, 280]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PUBLIC DOCUMENT TEXT', { x: 42, y: 205, size: 20, font });
  await edit(pdf, page, font);
  const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false, updateFieldAppearances: false }));
  return new File([bytes.buffer], 'Client report 2026.pdf', { type: 'application/pdf' });
}

function comment(pdf, page, value = 'COMMENT_SECRET') {
  const ref = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [25, 25, 70, 70], Contents: PDFString.of(value), T: PDFString.of('Reviewer') }));
  page.node.addAnnot(ref);
}

async function inspectCase(name, edit, check) {
  const result = await inspectPdfPrivacy(await fixture(edit), openRenderer);
  await check(result, groupPrivacyFindings(result));
  console.log(`PASS: ${name}`);
  return result;
}

(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  openRenderer = async file => pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useWorkerFetch: false }).promise;
  const actualOperations = {
    metadata: file => sanitizePdfMetadata(file, openRenderer), attachments: file => sanitizePdfAttachments(file, openRenderer),
    activeContent: file => sanitizePdfActiveActions(file, openRenderer), comments: file => sanitizePdfReviewAnnotations(file, openRenderer),
    externalLinks: file => sanitizePdfExternalLinks(file, openRenderer), inspect: file => inspectPdfPrivacy(file, openRenderer),
  };
  await inspectCase('1 clean PDF', async () => {}, async (result, groups) => {
    assert.equal(result.signed, false);
    assert.equal(groups.filter(group => group.findings.length && group.key !== 'layersOther').length, 0);
  });
  await inspectCase('2 metadata-only PDF', async pdf => pdf.setAuthor('PRIVATE AUTHOR'), async (result, groups) => {
    assert.ok(groups.find(group => group.key === 'metadata').findings.length > 0);
    assert.deepEqual(quickCleanSelection(result), { metadata: true, attachments: false, activeContent: false, comments: false, externalLinks: false });
  });
  await inspectCase('3 attachment PDF', async pdf => pdf.attach(new Uint8Array([1, 2, 3]), 'private.txt', { mimeType: 'text/plain' }), async (result, groups) => {
    assert.ok(groups.find(group => group.key === 'attachments').findings.length > 0);
    assert.equal(quickCleanSelection(result).attachments, true);
  });
  await inspectCase('4 JavaScript PDF', async pdf => pdf.catalog.set(N('OpenAction'), pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('noop()') })), async (result, groups) => {
    assert.ok(groups.find(group => group.key === 'activeContent').findings.length > 0);
    assert.equal(quickCleanSelection(result).activeContent, true);
  });
  await inspectCase('5 comments PDF', async (pdf, page) => comment(pdf, page), async (result, groups) => {
    assert.ok(groups.find(group => group.key === 'comments').findings.length > 0);
    assert.equal(quickCleanSelection(result).comments, false);
  });
  await inspectCase('6 multiple supported categories', async (pdf, page) => {
    pdf.setAuthor('PRIVATE AUTHOR'); await pdf.attach(new Uint8Array([4]), 'private.txt');
    pdf.catalog.set(N('OpenAction'), pdf.context.obj({ S: 'Launch', F: PDFString.of('private.exe') })); comment(pdf, page);
  }, async result => assert.deepEqual(quickCleanSelection(result), { metadata: true, attachments: true, activeContent: true, comments: false, externalLinks: false }));
  await inspectCase('7 inspection-only form finding', async (pdf, page) => {
    const field = pdf.getForm().createTextField('PrivateField'); field.setText('PRIVATE VALUE'); field.addToPage(page, { x: 40, y: 110, width: 140, height: 28 });
  }, async (_result, groups) => {
    const forms = groups.find(group => group.key === 'forms'); assert.ok(forms.findings.length > 0); assert.equal(forms.supported, false);
  });
  await inspectCase('8 legitimate ToolNest searchable OCR', async (pdf, page, font) => {
    const surface = canvas.createCanvas(840, 560), context = surface.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 840, 560); context.fillStyle = 'black'; context.font = '24px Arial'; context.fillText('SEARCHABLE SCAN CONTROL', 80, 100);
    const image = await pdf.embedPng(surface.toBuffer('image/png')); page.drawImage(image, { x: 0, y: 0, width: 420, height: 280 });
    for (let index = 0; index < 14; index++) page.drawText(`ocr${index}`, { x: 25 + index * 20, y: 80 + (index % 2) * 15, size: 8, font, opacity: .0001 });
  }, async (_result, groups) => {
    const hidden = groups.find(group => group.key === 'hiddenText'); assert.ok(hidden.findings.some(finding => finding.evidence?.classification === 'legitimate OCR/search layer')); assert.equal(hidden.supported, false);
  });
  await inspectCase('9 redaction-risk warning', async (_pdf, page, font) => {
    page.drawText('PRIVATE ID 1234', { x: 40, y: 100, size: 16, font }); page.drawRectangle({ x: 38, y: 97, width: 145, height: 24, color: rgb(0, 0, 0) });
  }, async (_result, groups) => {
    const risks = groups.find(group => group.key === 'redactionRisk'); assert.ok(risks.findings.length > 0); assert.equal(risks.supported, false);
  });
  await inspectCase('10 signed PDF warning', async pdf => {
    const signature = pdf.context.register(pdf.context.obj({ Type: 'Sig', ByteRange: [0, 0, 0, 0] })); pdf.catalog.set(N('SignatureFixture'), signature);
  }, async result => assert.equal(result.signed, true));

  const linked = await fixture(async (pdf, page) => {
    const uriAction = pdf.context.obj({ S: 'URI', URI: PDFString.of('https://example.test/private') });
    const annotation = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [35, 35, 180, 60], A: uriAction }));
    page.node.addAnnot(annotation);
    pdf.catalog.set(N('OpenAction'), pdf.context.obj({ S: 'GoTo', D: [page.ref, 'Fit'] }));
  });
  const linkedInspection = await inspectPdfPrivacy(linked, openRenderer);
  assert.ok(groupPrivacyFindings(linkedInspection).find(group => group.key === 'externalLinks').findings.length > 0);
  assert.equal(quickCleanSelection(linkedInspection).externalLinks, false);
  const linkedResult = await runPrivacySanitization(linked,
    { metadata: false, attachments: false, activeContent: false, comments: false, externalLinks: true }, undefined, actualOperations);
  assert.equal(linkedResult.steps[0].status, 'verified-removed');
  assert.equal(groupPrivacyFindings(linkedResult.inspection).find(group => group.key === 'externalLinks').findings.length, 0);
  const linkedOutput = await PDFDocument.load(new Uint8Array(await linkedResult.blob.arrayBuffer()), { updateMetadata: false });
  assert.equal(linkedOutput.catalog.get(N('OpenAction')).get(N('S')).asString(), '/GoTo');
  assert.ok(linkedOutput.getPages()[0].node.Annots().size() > 0, 'visible Link annotation should remain');
  console.log('PASS: external URI is explicit opt-in, verified removed, and internal GoTo/Link annotation remain');
  await assert.rejects(() => inspectPdfPrivacy(new File([new Uint8Array([1, 2, 3])], 'broken.pdf', { type: 'application/pdf' }), openRenderer));
  console.log('PASS: 11 malformed/unsupported PDF');

  const mockInspection = { pageCount: 1, signed: false, findings: [], coverage: [], limits: { fileBytes: 1, objects: 1, pages: 200 }, warnings: [] };
  const failed = await runPrivacySanitization(new File([new Uint8Array([1])], 'failure.pdf', { type: 'application/pdf' }),
    { metadata: true, attachments: false, activeContent: false, comments: false, externalLinks: false }, undefined, {
      metadata: async file => ({ blob: file.slice(), bytes: new Uint8Array(await file.arrayBuffer()), signed: false, before: mockInspection, after: mockInspection,
        verification: { metadata: 'removal-failed', xmp: 'verified-removed', pageCountPreserved: true, parseable: true, remainingMetadataFindings: 1, warnings: ['fixture failure'] }, cleanup: { removed: 0 } }),
      attachments: async () => { throw new Error('not selected'); }, activeContent: async () => { throw new Error('not selected'); }, comments: async () => { throw new Error('not selected'); }, externalLinks: async () => { throw new Error('not selected'); }, inspect: async () => mockInspection,
    });
  assert.equal(failed.steps[0].status, 'removal-failed'); assert.notEqual(failed.steps[0].status, 'verified-removed');
  console.log('PASS: 12 sanitization verification failure stays failed');

  const full = await fixture(async (pdf, page) => {
    pdf.setAuthor('PRIVATE AUTHOR'); await pdf.attach(new Uint8Array([7, 8, 9]), 'private.txt', { mimeType: 'text/plain' });
    pdf.catalog.set(N('OpenAction'), pdf.context.obj({ S: 'JavaScript', JS: PDFString.of('secret()') })); comment(pdf, page, 'PRIVATE COMMENT');
  });
  const completed = await runPrivacySanitization(full, { metadata: true, attachments: true, activeContent: true, comments: true, externalLinks: false }, undefined, actualOperations);
  assert.equal(completed.filename, 'Client-report-2026-sanitized.pdf'); assert.equal(completed.blob.type, 'application/pdf'); assert.ok(completed.blob.size > 0);
  assert.ok(completed.steps.every(step => step.status === 'verified-removed'));
  const finalGroups = groupPrivacyFindings(completed.inspection); for (const key of ['metadata', 'attachments', 'activeContent', 'comments']) assert.equal(finalGroups.find(group => group.key === key).findings.length, 0, `${key} remained`);
  console.log('PASS: 13 successful sanitize, verify, and downloadable filename');

  assert.equal(makeSanitizedPrivacyFilename('Original name.PDF'), 'Original-name-sanitized.pdf');
  const component = fs.readFileSync(path.resolve('components/document-privacy.tsx'), 'utf8');
  const route = fs.readFileSync(path.resolve('app/tools/document-privacy/page.tsx'), 'utf8');
  const styles = fs.readFileSync(path.resolve('app/globals.css'), 'utf8');
  const site = fs.readFileSync(path.resolve('lib/site.ts'), 'utf8');
  for (const phrase of ['Create sanitized copy', 'Use Recommended Clean', 'Digital signature warning', 'Review only · no automatic removal', 'Download sanitized PDF', 'What ToolNest checked', 'External links']) assert.ok(component.includes(phrase), `missing UI phrase: ${phrase}`);
  const workflowSource = fs.readFileSync(path.resolve('lib/pdf/privacy-workflow.ts'), 'utf8'); assert.ok(workflowSource.includes('comments: false, externalLinks: false'));
  assert.ok(route.includes('alternates: { canonical: "/tools/document-privacy" }')); assert.ok(route.includes('FAQPage')); assert.ok(route.includes('PDF Sanitizer & Privacy Checker'));
  assert.ok(site.includes('href: "/tools/document-privacy"')); assert.ok(site.includes('pdf privacy checker')); assert.ok(site.includes('remove external links from pdf'));
  assert.ok(styles.includes('@media (min-width: 48rem)')); assert.ok(styles.includes('.privacy-category-grid'));
  assert.ok(component.includes('Runs in your browser') && component.includes('Original stays unchanged') && component.includes('No signup')); assert.ok(component.includes('Inspection is read-only.') && component.includes('Nothing will be removed yet.')); assert.ok(component.indexOf('privacy-category-grid') > component.indexOf('{inspection &&'));
  console.log('PASS: route, SEO, search/category/sitemap registry, privacy wording, and responsive source integration');
})().catch(error => { console.error(error); process.exitCode = 1; });
