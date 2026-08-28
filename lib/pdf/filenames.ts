export function makeMergedPdfFilename() {
  return "merged-document.pdf";
}

function cleanPdfBaseName(filename: string) {
  const withoutExtension = filename.replace(/\.pdf$/i, "");
  const cleaned = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.\s-]+$/g, "")
    .trim();
  return cleaned || "document";
}

export function makeExtractedPdfFilename(
  sourceFilename: string,
  label: string,
) {
  return `${cleanPdfBaseName(sourceFilename)}-pages-${label}.pdf`;
}

export function makeSinglePagePdfFilename(
  sourceFilename: string,
  pageNumber: number,
) {
  return `${cleanPdfBaseName(sourceFilename)}-page-${pageNumber}.pdf`;
}

export function makeRangePdfFilename(
  sourceFilename: string,
  label: string,
) {
  return `${cleanPdfBaseName(sourceFilename)}-pages-${label}.pdf`;
}

export function makeSplitZipFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-split-pages.zip`;
}

export function makeImagesToPdfFilename(sourceFilenames: string[]) {
  if (sourceFilenames.length !== 1) return "images-to-pdf.pdf";
  const base = sourceFilenames[0]
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[.\s-]+$/g, "")
    .trim();
  return `${base || "image"}.pdf`;
}

export function makePdfPageImageFilename(
  sourceFilename: string,
  pageNumber: number,
  extension: "jpg" | "png",
) {
  return `${cleanPdfBaseName(sourceFilename)}-page-${pageNumber}.${extension}`;
}

export function makePdfImagesZipFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-pdf-images.zip`;
}

export function makeRotatedPdfFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-rotated.pdf`;
}

export function makeCompressedPdfFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-compressed.pdf`;
}
