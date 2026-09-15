export function makeMergedPdfFilename() {
  return "merged-document.pdf";
}

export function makeOrganizedPdfFilename(sourceFilename: string, selectedOnly = false) {
  return `${cleanPdfBaseName(sourceFilename)}-${selectedOnly ? "extracted" : "organized"}.pdf`;
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

export function makeWatermarkedPdfFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-watermarked.pdf`;
}

export function makePageNumberedPdfFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-numbered.pdf`;
}

export function makeWordFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}.docx`;
}

export function makeExcelFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-tables.xlsx`;
}

export function makeTableCsvFilename(sourceFilename: string, tableName: string) {
  const table = tableName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "table";
  return `${cleanPdfBaseName(sourceFilename)}-${table}.csv`;
}

export function makeSearchablePdfFilename(sourceFilename: string) {
  return `${cleanPdfBaseName(sourceFilename)}-searchable.pdf`;
}
