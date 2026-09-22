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

console.log("PASS: production PDF.js loader disables scripting and dynamic evaluation");
