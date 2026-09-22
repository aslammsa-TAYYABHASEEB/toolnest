const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rendererPath = path.join(__dirname, "..", "lib", "pdf", "renderer.ts");
const source = fs.readFileSync(rendererPath, "utf8");

assert.match(source, /enableScripting:\s*false/, "PDF.js scripting must remain disabled");
assert.match(source, /isEvalSupported:\s*false/, "PDF.js dynamic evaluation must remain disabled");
assert.match(source, /useWorkerFetch:\s*false/, "PDF.js worker fetching must remain disabled");
assert.equal((source.match(/pdfjs\.getDocument\s*\(/g) || []).length, 1,
  "The centralized production renderer must have exactly one PDF.js document-opening call");

const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const installedWorker = fs.readFileSync(path.join(pdfjsRoot, "build", "pdf.worker.min.mjs"));
const publicWorker = fs.readFileSync(path.join(__dirname, "..", "public", "pdf.worker.min.mjs"));
assert.deepEqual(publicWorker, installedWorker,
  "The public PDF.js worker must exactly match the installed package worker");

console.log("PASS: production PDF.js loader is hardened and its public worker matches the installed package");
