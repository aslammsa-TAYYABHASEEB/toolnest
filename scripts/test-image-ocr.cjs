// Synthetic, non-private fixtures. Node adapters exercise production processing;
// real browser UI/clipboard/download checks are performed separately.
require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const canvas = require('@napi-rs/canvas');
const tesseract = require('tesseract.js');
const output = path.resolve('work/image-ocr-qa');
fs.mkdirSync(output, { recursive: true });
globalThis.document = { createElement(name) {
  assert.equal(name, 'canvas'); const c = canvas.createCanvas(1, 1);
  c.toBlob = (callback, type = 'image/png') => callback(new Blob([c.toBuffer(type)], { type }));
  return c;
} };
globalThis.createImageBitmap = async file => {
  const image = await canvas.loadImage(Buffer.from(await file.arrayBuffer()));
  image.close = () => {}; return image;
};
const resolve = Module._resolveFilename, load = Module._load;
Module._resolveFilename = function(id, ...args) { return resolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args); };
let created = 0, terminated = 0, failModel = false;
Module._load = function(id, ...args) {
  if (id === 'tesseract.js') return { async createWorker(lang, oem, options) {
    assert.equal(options.workerPath, '/tesseract/worker.min.js');
    assert.equal(options.corePath, '/tesseract/core');
    if (failModel) { options.errorHandler(new Error('Simulated language download failure')); return new Promise(() => {}); }
    const worker = await tesseract.createWorker(lang, oem, { logger: options.logger, legacyCore: options.legacyCore, errorHandler: () => {}, cachePath: output });
    created++;
    let closed = false;
    return { recognize: (image, ...rest) => worker.recognize(image.toBuffer('image/png'), ...rest), detect: image => worker.detect(image.toBuffer('image/png')),
      terminate: async () => { if (!closed) { closed = true; terminated++; } await worker.terminate(); } };
  } };
  return load.call(this, id, ...args);
};
const input = require('../lib/ocr/image-input.ts');
const ocr = require('../lib/ocr/image-to-text.ts');
function save(name, c, type = 'image/png') { const bytes = c.toBuffer(type); fs.writeFileSync(path.join(output, name), bytes); return new File([bytes], name, { type }); }
function documentImage(width = 1100, height = 760, size = 32, transparent = false) {
  const c = canvas.createCanvas(width, height), ctx = c.getContext('2d');
  if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
  ctx.fillStyle = '#111'; ctx.font = `${size}px Arial`;
  const lines = ['OFFICE NOTICE', 'Please review the attached report carefully.', 'The meeting starts at 10:30 on Monday.', '', 'Keep the original wording and numbers.', 'Reference number: 4827. Thank you.'];
  lines.forEach((text, i) => ctx.fillText(text, size, size * 2 + i * size * 1.8));
  return c;
}
const clean = documentImage();
const fixtures = [
  save('clean-document.png', clean),
  save('document-photo.jpg', clean, 'image/jpeg'),
  save('document.webp', clean, 'image/webp'),
  save('low-resolution.png', documentImage(480, 300, 14)),
  save('transparent.png', documentImage(1100, 760, 32, true)),
];
const screenshot = canvas.createCanvas(900, 460), sc = screenshot.getContext('2d');
sc.fillStyle = '#f5f6fa'; sc.fillRect(0, 0, 900, 460); sc.fillStyle = '#222'; sc.font = 'bold 28px Arial'; sc.fillText('Project status', 36, 65); sc.font = '22px Arial';
['All checks passed.', 'The next review is scheduled for Friday.', 'Copy this text without uploading your image.'].forEach((text, i) => sc.fillText(text, 36, 135 + i * 50));
fixtures.push(save('screenshot.png', screenshot));
const rotated = canvas.createCanvas(clean.height, clean.width), rc = rotated.getContext('2d'); rc.translate(rotated.width, 0); rc.rotate(Math.PI / 2); rc.drawImage(clean, 0, 0);
fixtures.push(save('rotated-document.jpg', rotated, 'image/jpeg'));
const blank = canvas.createCanvas(600, 400); blank.getContext('2d').fillStyle = '#fff'; blank.getContext('2d').fillRect(0, 0, 600, 400);
fixtures.push(save('no-text.png', blank));

(async () => {
  for (const file of fixtures) { console.log(`Validate ${file.name}`); const result = await input.prepareOcrImage(file); assert.ok(result.width > 0); }
  console.log('Validate rejected inputs');
  await assert.rejects(() => input.prepareOcrImage(new File(['bad'], 'broken.png', { type: 'image/png' })));
  await assert.rejects(() => input.prepareOcrImage(new File([], 'empty.png', { type: 'image/png' })));
  await assert.rejects(() => input.prepareOcrImage(new File(['%PDF'], 'wrong.pdf', { type: 'application/pdf' })));
  await assert.rejects(() => input.prepareOcrImage(new File([new Uint8Array(21 * 1024 * 1024)], 'huge.png', { type: 'image/png' })));
  await assert.rejects(async () => input.prepareOcrImage(new File([await fixtures[0].arrayBuffer()], 'mislabeled.jpg', { type: 'image/jpeg' })));
  const oversized = new Uint8Array(await fixtures[0].arrayBuffer()); new DataView(oversized.buffer).setUint32(16, 40_000);
  await assert.rejects(() => input.prepareOcrImage(new File([oversized], 'huge-dimensions.png', { type: 'image/png' })), /24 megapixels/);
  console.log('Validate corrupt decoder input');
  const corrupt = new Uint8Array(await fixtures[0].arrayBuffer()).slice(0, 30);
  fs.writeFileSync(path.join(output, 'corrupt.png'), corrupt);
  // The native QA canvas decoder aborts on truncated PNGs. Exercise rejection
  // here through the adapter; the actual corrupt file is tested in Chromium.
  const decode = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async () => { throw new Error('Decode failed'); };
  await assert.rejects(() => input.prepareOcrImage(new File([corrupt], 'corrupt.png', { type: 'image/png' })));
  globalThis.createImageBitmap = decode;
  assert.throws(() => input.assertOcrDimensions(0, 10));
  assert.ok(input.ocrCanvasSize(480, 300).scale > 1);
  const size = input.ocrCanvasSize(6000, 4000); assert.ok(size.width * size.height <= 8_000_000);
  assert.equal(ocr.recognizedText({ blocks: [{ paragraphs: [{ lines: [{ text: 'Exact w0rding' }, { text: '(a)  Nested clause' }] }, { lines: [{ text: 'Closing block' }] }] }], text: '' }), 'Exact w0rding\n(a) Nested clause\n\nClosing block');
  assert.equal(ocr.recognizedText({ blocks: null, text: '' }), '');
  assert.deepEqual(ocr.textMetrics('Hello world\n😀'), { words: 3, characters: 13 });
  console.log('Image processing regressions');
  const image = require('../lib/image/process-image.ts');
  assert.equal((await image.convertImage({ file: fixtures[0], format: 'webp' })).format, 'webp');
  assert.equal((await image.resizeImage({ file: fixtures[0], format: 'png', width: 550, height: 380 })).width, 550);
  assert.ok((await image.compressImage({ file: fixtures[1], format: 'jpeg', quality: .7 })).blob.size > 0);
  const { tools } = require('../lib/site.ts'); const tool = tools.find(t => t.href === '/tools/image-to-text');
  assert.equal(tool.category, 'image-tools'); assert.equal(tool.keywords.length, 9); assert.ok(tools.some(t => t.href === '/tools/organize-pdf'));
  console.log('Model failure recovery');
  failModel = true;
  await assert.rejects(() => ocr.extractImageText(fixtures[0], { rotation: 0, autoRotate: false }, () => {}), /language data could not load/);
  failModel = false;
  console.log('PASS: formats, invalid/corrupt/mislabeled/oversized files, pixel limits, upscaling, faithful text/paragraphs, metrics, language failure, Image Converter/Resizer/Compressor, registry.');
  if (process.argv.includes('--runtime')) {
    const results = [];
    for (const file of fixtures) {
      const start = Date.now(), phases = new Set();
      const result = await ocr.extractImageText(file, { rotation: 0, autoRotate: true }, state => phases.add(state.phase));
      if (file.name === 'no-text.png') assert.ok(result.empty);
      else assert.match(result.text, file.name === 'screenshot.png' ? /Project status/i : /OFFICE NOTICE/i);
      assert.equal(created, terminated, 'Every operation releases its workers');
      fs.writeFileSync(path.join(output, file.name + '.txt'), result.text);
      results.push({ name: file.name, ms: Date.now() - start, rotation: result.rotation, empty: result.empty, phases: [...phases], text: result.text });
      console.log(JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(path.join(output, 'runtime-results.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${fixtures.length} real OCR fixtures; ${created} workers created and terminated.`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
