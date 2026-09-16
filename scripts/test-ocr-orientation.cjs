require('./pdf-word-loader.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return originalResolve.call(this, id.startsWith('@/') ? path.resolve(id.slice(2)) : id, ...args);
};
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (id === '@/lib/pdf/ocr-render') {
    return {
      async renderPageToCanvasForOcr() { return makeCanvas(0); },
      rotateCanvas(source, rotation) { return makeCanvas(rotation, source); },
      createOrientationProbeCanvas(source) {
        return { ...makeCanvas(source.rotation), width: 700, height: 513, orientationProbe: true };
      },
    };
  }
  return originalLoad.call(this, id, ...args);
};

const { recognizePdfPage } = require('../lib/pdf/to-word.ts');
Module._load = originalLoad;

function makeCanvas(rotation, source) {
  const swap = rotation === 90 || rotation === 270;
  const width = source ? (swap ? source.height : source.width) : 800;
  const height = source ? (swap ? source.width : source.height) : 1100;
  return {
    rotation,
    width,
    height,
    getContext() {
      return { font: '', measureText: text => ({ width: text.length * 7 }) };
    },
  };
}

const words = count => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');
function recognition(count, confidence, lines = count >= 12 ? 3 : 1) {
  return {
    plainText: words(count),
    confidence,
    layout: Array.from({ length: lines }, (_, index) => ({
      text: `readable words line ${index}`,
      x0: 50,
      y0: 100 + index * 30,
      x1: 600,
      y1: 124 + index * 30,
      height: 24,
      confidence,
      words: [],
    })),
  };
}

async function runCase({ name, detected, detectionConfidence = 10, fullDetected = detected, fullDetectionConfidence = detectionConfidence, results, expectedRotation, expectedPasses, expectedOsd }) {
  const calls = [];
  let osdCalls = 0;
  const engine = {
    setProgressPage() {},
    async detect(image) {
      osdCalls++;
      if (image.orientationProbe) {
        assert.ok(Math.max(image.width, image.height) < 1100, `${name}: probe is smaller than OCR canvas`);
        return { degrees: detected, confidence: detectionConfidence };
      }
      return { degrees: fullDetected, confidence: fullDetectionConfidence };
    },
    async recognize(image) {
      calls.push(image.rotation);
      const result = results[image.rotation];
      assert.ok(result, `${name}: unexpected OCR rotation ${image.rotation}`);
      return result;
    },
    async terminate() {},
  };
  const page = { getViewport: () => ({ width: 600, height: 800 }) };
  const output = await recognizePdfPage(page, 1, 1, engine, undefined);
  assert.equal(output.rotation, expectedRotation, `${name}: selected rotation`);
  assert.deepEqual(calls, expectedPasses, `${name}: OCR passes`);
  assert.equal(osdCalls, expectedOsd, `${name}: OSD calls`);
  console.log(`PASS: ${name} -> rotation ${output.rotation}; OCR [${calls.join(', ')}]; OSD ${osdCalls}`);
}

(async () => {
  const strong = recognition(16, 88);
  const weak = recognition(3, 31);
  await runCase({ name: 'upright page', detected: 0, results: { 0: strong }, expectedRotation: 0, expectedPasses: [0], expectedOsd: 1 });
  for (const rotation of [90, 180, 270]) {
    await runCase({ name: `${rotation}-degree correction`, detected: rotation, results: { [rotation]: strong }, expectedRotation: rotation, expectedPasses: [rotation], expectedOsd: 1 });
  }
  await runCase({ name: 'strong recognition overrides weak probe confidence', detected: 270, detectionConfidence: 1, results: { 270: strong }, expectedRotation: 270, expectedPasses: [270], expectedOsd: 1 });
  await runCase({ name: 'extremely weak nonzero probe is rechecked before OCR', detected: 270, detectionConfidence: 0.5, fullDetected: 180, fullDetectionConfidence: 3, results: { 180: weak, 0: strong }, expectedRotation: 0, expectedPasses: [180, 0], expectedOsd: 2 });
  await runCase({
    name: 'ambiguous low-confidence page retains exhaustive fallback',
    detected: 0,
    detectionConfidence: 1,
    results: { 0: weak, 180: recognition(4, 35), 90: recognition(7, 42), 270: recognition(5, 39) },
    expectedRotation: 90,
    expectedPasses: [0, 180, 90, 270],
    expectedOsd: 1,
  });
  await runCase({
    name: 'opposite rotation fallback remains available',
    detected: 90,
    detectionConfidence: 2,
    results: { 0: weak, 90: recognition(4, 36), 270: strong },
    expectedRotation: 270,
    expectedPasses: [90, 270, 0],
    expectedOsd: 1,
  });
  console.log('8 focused staged-orientation regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
