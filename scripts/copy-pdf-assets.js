// Copies browser-worker assets from node_modules into public/ after install.
// - pdfjs-dist worker (existing behavior, preserved exactly)
// - tesseract.js worker + wasm core files (used by the PDF-to-Word OCR path)
const fs = require("fs");
const path = require("path");

const root = process.cwd();

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      copyFile(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }
}

// 1) pdfjs-dist worker (same file/destination as the previous inline postinstall)
copyFile(
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(root, "public", "pdf.worker.min.mjs"),
);

// 2) tesseract.js worker + wasm cores. Language traineddata is NOT copied;
//    it is fetched lazily at runtime from Tesseract's default CDN via langPath.
const tesseractDist = path.join(root, "node_modules", "tesseract.js", "dist");
const tesseractCore = path.join(root, "node_modules", "tesseract.js-core");
const publicTesseract = path.join(root, "public", "tesseract");
fs.mkdirSync(publicTesseract, { recursive: true });

if (fs.existsSync(tesseractDist)) {
  for (const name of ["worker.min.js"]) {
    const src = path.join(tesseractDist, name);
    if (fs.existsSync(src)) copyFile(src, path.join(publicTesseract, name));
  }
}
if (fs.existsSync(tesseractCore)) {
  copyDir(tesseractCore, path.join(publicTesseract, "core"));
}
