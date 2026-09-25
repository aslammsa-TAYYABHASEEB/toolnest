import { strToU8, zipSync } from "fflate";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { isIdentifierLikeColumnHeading, parseConservativeNumericLiteral } from "@/lib/pdf/cell-semantics";
import { renderPageToCanvasForOcr, rotateCanvas } from "@/lib/pdf/ocr-render";
import { extractScannedGridTables, type ScannedGridTable } from "@/lib/pdf/scanned-table";
import { createPdfOcrEngine, recognizePdfPage, type PdfOcrEngine } from "@/lib/pdf/to-word";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { validatePdfFile } from "@/lib/pdf/validation";
import { extractWordPage } from "@/lib/pdf/word-extraction";
import { extractVectorGridTables, pageTextItems, type GridMerge, type VectorGridTable } from "@/lib/pdf/vector-table";
import {
  lineText,
  markTableContinuations,
  type WordPage,
  type WordTable,
} from "@/lib/pdf/word-layout";
import {
  evidenceTitleBox,
  selectTableTitle,
  titleLinesFromTextItems,
  titlePageFromBlocks,
  type TableTitleBox,
  type TableTitlePage,
} from "@/lib/pdf/table-title";

export const MAX_PDF_TO_EXCEL_SOURCE_PAGES = 300;
export const MAX_PDF_TO_EXCEL_OUTPUT_SIZE = 50 * 1024 * 1024;

export type ExcelCellValue = string | number;

/**
 * Normalized source-page coordinates: top-left origin, values in 0..1,
 * relative to the displayed orientation used by Source Review.
 */
export type PdfSourceBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type PdfCellEvidence = {
  page: number;
  bbox: PdfSourceBox;
  sourceText: string;
  source: "pdf-text" | "ocr";
  /** Actual Tesseract confidence when contributing OCR words are available. */
  ocrConfidence?: number;
  /** Additional clockwise correction used when interpreting this bbox. */
  rotation?: 0 | 90 | 180 | 270;
};
export type PdfTableExtractionMethod = "vector-grid" | "layout-table" | "scanned-grid" | "ocr-layout";
export type ExtractedPdfTable = {
  id: string;
  name: string;
  pageStart: number;
  pageEnd: number;
  source: "native" | "ocr";
  rows: ExcelCellValue[][];
  /** Parallel to rows; null marks empty or subordinate merged cells. */
  evidence?: Array<Array<PdfCellEvidence | null>>;
  method?: PdfTableExtractionMethod;
  merges?: GridMerge[];
  headerRows?: number;
  /**
   * Display-only heading found directly above the table on its start page.
   * Never part of rows/evidence and never exported to CSV.
   */
  title?: string;
};
export type PdfTableExtractionResult = {
  tables: ExtractedPdfTable[];
  pageCount: number;
  scannedPageCount: number;
};
export type PdfToExcelProgressPhase = "analyzing" | "ocr-download" | "ocr";

const xmlEscape = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Keep identifiers as text; only complete, unambiguous quantities become numbers. */
export function inferExcelCellValue(text: string, columnHeading = ""): ExcelCellValue {
  const value = text.trim();
  if (isIdentifierLikeColumnHeading(columnHeading)) return value;
  return parseConservativeNumericLiteral(value) ?? value;
}

function normalizedBox(left: number, top: number, right: number, bottom: number, page: WordPage): PdfSourceBox {
  const tolerance = 1e-6;
  const clampTolerance = (value: number) => value < 0 && value >= -tolerance ? 0 :
    value > 1 && value <= 1 + tolerance ? 1 : value;
  const normalizedLeft = clampTolerance(left / page.width);
  const normalizedTop = clampTolerance(top / page.height);
  const normalizedRight = clampTolerance(right / page.width);
  const normalizedBottom = clampTolerance(bottom / page.height);
  return { left: normalizedLeft, top: normalizedTop,
    width: normalizedRight - normalizedLeft, height: normalizedBottom - normalizedTop };
}

export function wordTableRowsWithEvidence(
  table: WordTable,
  page: WordPage,
  pageNumber: number,
  source: "native" | "ocr",
  rotation: 0 | 90 | 180 | 270,
): { rows: ExcelCellValue[][]; evidence: Array<Array<PdfCellEvidence | null>> } {
  const sourceRows = table.rows.map(row => row.map(cell => cell.map(lineText).filter(Boolean).join("\n")));
  const evidence = table.rows.map((row, rowIndex) => row.map((cell, columnIndex) => {
    const sourceText = sourceRows[rowIndex][columnIndex];
    if (!sourceText) return null;
    const retained = table.sourceCells?.[rowIndex]?.[columnIndex];
    if (retained) return { page: pageNumber,
      bbox: normalizedBox(retained.x, retained.y, retained.right, retained.bottom, page),
      sourceText: retained.sourceText, source: "ocr" as const,
      ocrConfidence: retained.ocrConfidence, rotation };
    const spans = cell.flatMap(line => line.spans);
    if (!spans.length) return null;
    return { page: pageNumber,
      bbox: normalizedBox(Math.min(...spans.map(span => span.x)),
        Math.min(...spans.map(span => span.y - span.size)),
        Math.max(...spans.map(span => span.x + span.width)),
        Math.max(...spans.map(span => span.y + span.size * .2)), page),
      sourceText, source: source === "ocr" ? "ocr" as const : "pdf-text" as const,
      rotation };
  }));
  const rows = sourceRows.map(row => row.map((cell, column) =>
    inferExcelCellValue(cell, sourceRows[0]?.[column] ?? "")));
  return { rows, evidence };
}

export function scannedTableRows(grid: ScannedGridTable): ExcelCellValue[][] {
  const columns = grid.rows[0]?.length ?? 0;
  const headings = Array.from({ length: columns }, (_, column) =>
    grid.rows.slice(0, grid.headerRows).map(row => row[column]).join(" "));
  for (let column = 0; column < columns; column++) {
    const cells = grid.rows.slice(grid.headerRows).map(row => row[column] ?? "").filter(Boolean);
    const dates = cells.filter(cell => /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b/.test(cell)).length;
    if (dates >= 2 && dates >= cells.length * .3) headings[column] += " date";
  }
  return grid.rows.map(row => row.map((cell, column) =>
    /\bdate\b/i.test(headings[column]) ? cell.trim() : inferExcelCellValue(cell, headings[column])));
}

export function vectorTableEvidence(vector: VectorGridTable, pageNumber: number): Array<Array<PdfCellEvidence | null>> {
  return vector.evidence.map(row => row.map(cell => cell ? { ...cell,
    page: pageNumber, source: "pdf-text" as const, rotation: 0 as const } : null));
}

export function scannedTableEvidence(
  grid: ScannedGridTable,
  pageNumber: number,
  rotation: 0 | 90 | 180 | 270,
): Array<Array<PdfCellEvidence | null>> {
  return grid.evidence.map(row => row.map(cell => cell ? { ...cell,
    page: pageNumber, source: "ocr" as const, rotation } : null));
}

function vectorContinuationSignature(table: ExtractedPdfTable) {
  const columns = table.rows[0]?.length ?? 0;
  const row = table.evidence?.find(cells => cells.length === columns && cells.every(Boolean));
  return row?.map(cell => cell ? [cell.bbox.left, cell.bbox.left + cell.bbox.width] as const : null) ?? null;
}

function isVectorContinuation(previous: ExtractedPdfTable | undefined, current: ExtractedPdfTable) {
  if (!previous || previous.method !== "vector-grid" || current.method !== "vector-grid" ||
    previous.pageEnd + 1 !== current.pageStart || previous.rows[0]?.length !== current.rows[0]?.length) return false;
  const previousKey = Number.parseInt(String(previous.rows.at(-1)?.[0] ?? ""), 10);
  const currentKey = Number.parseInt(String(current.rows[0]?.[0] ?? ""), 10);
  if (!Number.isFinite(previousKey) || currentKey !== previousKey + 1) return false;
  const priorEvidence = previous.evidence?.flat().filter((cell): cell is PdfCellEvidence => Boolean(cell)) ?? [];
  const currentEvidence = current.evidence?.flat().filter((cell): cell is PdfCellEvidence => Boolean(cell)) ?? [];
  if (!priorEvidence.length || !currentEvidence.length) return false;
  const priorBottom = Math.max(...priorEvidence.map(cell => cell.bbox.top + cell.bbox.height));
  const currentTop = Math.min(...currentEvidence.map(cell => cell.bbox.top));
  if (priorBottom < .9 || currentTop > .1) return false;
  const priorColumns = vectorContinuationSignature(previous);
  const currentColumns = vectorContinuationSignature(current);
  return Boolean(priorColumns && currentColumns && priorColumns.length === currentColumns.length &&
    priorColumns.every((column, index) => column && currentColumns[index] &&
      Math.abs(column[0] - currentColumns[index]![0]) <= .02 &&
      Math.abs(column[1] - currentColumns[index]![1]) <= .02));
}

function safeSheetName(name: string, used: Set<string>) {
  const base = (name.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Table").slice(0, 31);
  let candidate = base;
  for (let suffix = 2; used.has(candidate.toLowerCase()); suffix += 1) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(rows: ExcelCellValue[][], merges: GridMerge[] = [], headerRows = 1, scanned = false, title?: string) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) => Math.min(40, Math.max(10,
    ...rows.slice(0, 200).map((row) => String(row[column] ?? "").split("\n").reduce((n, line) => Math.max(n, line.length), 0) + 2),
  )));
  // A preserved heading fills row 1 (merged across the table columns, wrapped)
  // plus one blank spacer row; the matrix, its merges, the freeze pane and the
  // auto-filter all shift down by two rows. Without a title nothing changes.
  const offset = title ? 2 : 0;
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, column) => {
      const value = row[column] ?? "";
      const reference = `${columnName(column)}${rowIndex + 1 + offset}`;
      if (typeof value === "number") return `<c r="${reference}" s="${rowIndex < headerRows ? 1 : Number.isInteger(value) ? 2 : 3}"><v>${value}</v></c>`;
      const preserve = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : "";
      return `<c r="${reference}" t="inlineStr"${rowIndex < headerRows ? ' s="1"' : ""}><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    const lines = Math.max(1, ...row.map(value => String(value).split("\n").length));
    const height = Math.min(90, Math.max(18, lines * 15));
    return `<row r="${rowIndex + 1 + offset}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const titleXml = title ? `<row r="1" ht="${Math.min(90, Math.max(18, title.split("\n").length * 15))}" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(title)}</t></is></c></row><row r="2" ht="9" customHeight="1"></row>` : "";
  const shiftedMerges = offset ? merges.map(merge => ({ ...merge,
    startRow: merge.startRow + offset, endRow: merge.endRow + offset })) : merges;
  const allMerges = title && columns ? [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: columns - 1 },
    ...shiftedMerges] : shiftedMerges;
  const last = `${columnName(columns - 1)}${Math.max(1, rows.length + offset)}`;
  const mergeXml = allMerges.length ? `<mergeCells count="${allMerges.length}">${allMerges.map(merge => `<mergeCell ref="${columnName(merge.startColumn)}${merge.startRow + 1}:${columnName(merge.endColumn)}${merge.endRow + 1}"/>`).join("")}</mergeCells>` : "";
  const paneRows = headerRows + offset;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${scanned && headerRows === 0 ? "" : `<pane ySplit="${paneRows}" topLeftCell="A${paneRows + 1}" activePane="bottomLeft" state="frozen"/>`}</sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${titleXml}${rowXml}</sheetData>${mergeXml}${rows.length && (!scanned || headerRows > 0) && !merges.length ? `<autoFilter ref="A${1 + offset}:${last}"/>` : ""}</worksheet>`;
}

export function createExcelWorkbook(tables: ExtractedPdfTable[]): Blob {
  if (!tables.length) throw new PdfProcessingError("word-no-text-found", "No tables are available to export.");
  const used = new Set<string>();
  const sheets = tables.map((table) => ({ ...table, sheetName: safeSheetName(table.name, used) }));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.sheetName)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##########"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet.rows, sheet.merges, sheet.headerRows, sheet.source === "ocr", sheet.title)); });
  const zipped = zipSync(files, { level: 6 });
  if (zipped.byteLength > MAX_PDF_TO_EXCEL_OUTPUT_SIZE) throw new PdfProcessingError("word-output-too-large", "The Excel workbook exceeds the 50 MB browser safety limit.");
  return new Blob([zipped], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function createTableCsv(table: ExtractedPdfTable): Blob {
  const csv = table.rows.map((row) => row.map((cell) => {
    const value = String(cell);
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  }).join(",")).join("\r\n");
  return new Blob(["\uFEFF", csv, "\r\n"], { type: "text/csv;charset=utf-8" });
}

export async function extractPdfTables(
  file: File,
  onProgress?: (current: number, total: number, phase: PdfToExcelProgressPhase, subProgress?: number) => void,
): Promise<PdfTableExtractionResult> {
  await validatePdfFile(file);
  const document = await loadPdfRendererDocument(file);
  let worker: PdfOcrEngine | null = null;
  let scannedPageCount = 0;
  const pages: WordPage[] = [];
  const vectorPages = new Map<number, VectorGridTable[]>();
  const titlePages = new Map<number, TableTitlePage>();
  const scannedGridPages = new Map<number, ScannedGridTable[]>();
  const ocrRotations = new Map<number, 0 | 90 | 180 | 270>();
  const sources: Array<"native" | "ocr"> = [];
  try {
    if (!document.numPages || document.numPages > MAX_PDF_TO_EXCEL_SOURCE_PAGES) {
      throw new PdfProcessingError("word-workload-too-large", `This tool supports PDFs with up to ${MAX_PDF_TO_EXCEL_SOURCE_PAGES} pages.`);
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        onProgress?.(pageNumber, document.numPages, "analyzing");
        const textContent = await page.getTextContent();
        const characters = textContent.items.reduce((count, item) => count + ("str" in item ? item.str.trim().length : 0), 0);
        // A sparse native page can still contain a real table (for example, a
        // continuation with short numeric cells). Keep conservative native
        // candidates so failed OCR cannot silently discard that page.
        const sparseVectorTables = characters > 0 && characters < 25
          ? await extractVectorGridTables(page, textContent)
          : [];
        if (sparseVectorTables.length) {
          vectorPages.set(pageNumber, sparseVectorTables);
          const viewport = page.getViewport({ scale: 1 });
          titlePages.set(pageNumber, { lines: titleLinesFromTextItems(pageTextItems(textContent, viewport)),
            width: viewport.width, height: viewport.height });
          pages.push({ width: viewport.width, height: viewport.height, left: 0,
            right: viewport.width, top: 0, blocks: [] });
          sources.push("native");
          continue;
        }
        const sparseNativePage = characters > 0 && characters < 25
          ? await extractWordPage(page, textContent)
          : null;
        if (characters >= 25) {
          const vectorTables = await extractVectorGridTables(page, textContent);
          const viewport = page.getViewport({ scale: 1 });
          if (vectorTables.length) {
            vectorPages.set(pageNumber, vectorTables);
            titlePages.set(pageNumber, { lines: titleLinesFromTextItems(pageTextItems(textContent, viewport)),
              width: viewport.width, height: viewport.height });
            pages.push({ width: viewport.width, height: viewport.height, left: 0, right: viewport.width, top: 0, blocks: [] });
          } else {
            const wordPage = await extractWordPage(page, textContent);
            pages.push(wordPage);
            titlePages.set(pageNumber, titlePageFromBlocks(wordPage));
          }
          sources.push("native");
          continue;
        }
        scannedPageCount += 1;
        if (!worker) {
          worker = await createPdfOcrEngine((current, total, phase, progress) =>
            onProgress?.(current, total, phase === "ocr-download" ? "ocr-download" : "ocr", progress),
          pageNumber, document.numPages);
        }
        const recognized = await recognizePdfPage(page, pageNumber, document.numPages, worker,
          (current, total, phase, progress) =>
            onProgress?.(current, total, phase === "ocr-download" ? "ocr-download" : "ocr", progress),
          undefined, true);
        ocrRotations.set(pageNumber, recognized.rotation);
        const baseGridCanvas = await renderPageToCanvasForOcr(page, 1.5);
        let gridCanvas: HTMLCanvasElement = baseGridCanvas;
        try {
          gridCanvas = rotateCanvas(baseGridCanvas, recognized.rotation);
          const grids = extractScannedGridTables(gridCanvas, recognized.ocrLines,
            recognized.ocrPixelWidth, recognized.ocrPixelHeight);
          if (grids.length) scannedGridPages.set(pageNumber, grids);
        } finally {
          if (gridCanvas !== baseGridCanvas) { gridCanvas.width = 0; gridCanvas.height = 0; }
          baseGridCanvas.width = 0; baseGridCanvas.height = 0;
        }
        const ocrHasTable = (scannedGridPages.get(pageNumber)?.length ?? 0) > 0 ||
          recognized.page.blocks.some(block => block.kind === "table");
        const nativeHasTable = sparseNativePage?.blocks.some(block => block.kind === "table") ?? false;
        const pushedPage = !ocrHasTable && nativeHasTable && sparseNativePage ? sparseNativePage : recognized.page;
        pages.push(pushedPage);
        sources.push(pushedPage === sparseNativePage ? "native" : "ocr");
        titlePages.set(pageNumber, titlePageFromBlocks(pushedPage));
      } finally { page.cleanup(); }
    }
    markTableContinuations(pages);
    const tables: ExtractedPdfTable[] = [];
    pages.forEach((page, pageIndex) => {
      const titleInfo = titlePages.get(pageIndex + 1);
      const vectorTables = vectorPages.get(pageIndex + 1);
      if (vectorTables) {
        const pageEvidence = vectorTables.map(vector => vectorTableEvidence(vector, pageIndex + 1));
        const pageBoxes = pageEvidence.map(evidence => evidenceTitleBox(evidence,
          titleInfo?.width ?? 0, titleInfo?.height ?? 0));
        vectorTables.forEach((vector, vectorIndex) => {
          const region = pageBoxes[vectorIndex];
          const current: ExtractedPdfTable = {
            id: "table-" + (tables.length + 1), name: "Table " + (tables.length + 1),
            pageStart: pageIndex + 1, pageEnd: pageIndex + 1, source: "native", method: "vector-grid",
            rows: vector.rows.map(row => row.map((cell, column) => inferExcelCellValue(cell,
              vector.rows.slice(0, vector.headerRows).map(header => header[column]).join(" ")))),
            evidence: pageEvidence[vectorIndex],
            merges: vector.merges, headerRows: vector.headerRows,
            title: titleInfo && region ? selectTableTitle(titleInfo.lines, region,
              pageBoxes.filter((box, index): box is TableTitleBox =>
                index !== vectorIndex && Boolean(box))) : undefined,
          };
          const previous = tables[tables.length - 1];
          if (isVectorContinuation(previous, current)) {
            const rowOffset = previous.rows.length;
            previous.rows.push(...current.rows);
            previous.evidence?.push(...(current.evidence ?? []));
            previous.merges?.push(...(current.merges ?? []).map(merge => ({
              ...merge, startRow: merge.startRow + rowOffset, endRow: merge.endRow + rowOffset,
            })));
            previous.pageEnd = current.pageEnd;
          } else tables.push(current);
        });
        return;
      }
      const scannedGrids = scannedGridPages.get(pageIndex + 1);
      if (scannedGrids) {
        const rotation = ocrRotations.get(pageIndex + 1) ?? 0;
        const gridEvidence = scannedGrids.map(grid => scannedTableEvidence(grid, pageIndex + 1, rotation));
        const gridBoxes = gridEvidence.map(evidence => evidenceTitleBox(evidence,
          titleInfo?.width ?? 0, titleInfo?.height ?? 0));
        scannedGrids.forEach((grid, gridIndex) => {
          const region = gridBoxes[gridIndex];
          tables.push({
            id: "table-" + (tables.length + 1), name: "Table " + (tables.length + 1),
            pageStart: pageIndex + 1, pageEnd: pageIndex + 1,
            source: "ocr", method: "scanned-grid", rows: scannedTableRows(grid),
            evidence: gridEvidence[gridIndex],
            merges: grid.merges, headerRows: grid.headerRows,
            title: titleInfo && region ? selectTableTitle(titleInfo.lines, region,
              gridBoxes.filter((box, index): box is TableTitleBox =>
                index !== gridIndex && Boolean(box))) : undefined,
          });
        });
        return;
      }
      page.blocks.forEach((block) => {
        if (block.kind !== "table") return;
        const source = sources[pageIndex];
        const extracted = wordTableRowsWithEvidence(block, page, pageIndex + 1, source,
          source === "ocr" ? ocrRotations.get(pageIndex + 1) ?? 0 : 0);
        const previous = tables[tables.length - 1];
        if (block.continuation && previous && previous.rows[0]?.length === extracted.rows[0]?.length) {
          previous.rows.push(...extracted.rows);
          previous.evidence?.push(...extracted.evidence);
          previous.pageEnd = pageIndex + 1;
          return;
        }
        tables.push({
          id: "table-" + (tables.length + 1), name: "Table " + (tables.length + 1),
          pageStart: pageIndex + 1, pageEnd: pageIndex + 1, source,
          method: source === "ocr" ? "ocr-layout" : "layout-table",
          rows: extracted.rows, evidence: extracted.evidence,
          title: titleInfo ? selectTableTitle(titleInfo.lines,
            { left: block.x, right: block.right, top: block.y, bottom: block.bottom }) : undefined,
        });
      });
    });
    return { tables, pageCount: document.numPages, scannedPageCount };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError("word-conversion-failed", caught instanceof Error ? caught.message : "The PDF tables could not be extracted.");
  } finally {
    if (worker) await worker.terminate();
    await document.loadingTask.destroy();
  }
}
