import { strToU8, zipSync } from "fflate";
import type { Worker } from "tesseract.js";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { createBrowserOcrWorker } from "@/lib/ocr/worker";
import { renderPageToCanvasForOcr } from "@/lib/pdf/ocr-render";
import { buildOcrWordPage, recognitionLines } from "@/lib/pdf/ocr-word-layout";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { validatePdfFile } from "@/lib/pdf/validation";
import { extractWordPage } from "@/lib/pdf/word-extraction";
import { extractVectorGridTables, type GridMerge, type VectorGridTable } from "@/lib/pdf/vector-table";
import {
  lineText,
  markTableContinuations,
  type WordPage,
  type WordTable,
} from "@/lib/pdf/word-layout";

export const MAX_PDF_TO_EXCEL_SOURCE_PAGES = 300;
export const MAX_PDF_TO_EXCEL_OUTPUT_SIZE = 50 * 1024 * 1024;

export type ExcelCellValue = string | number;
export type ExtractedPdfTable = {
  id: string;
  name: string;
  pageStart: number;
  pageEnd: number;
  source: "native" | "ocr";
  rows: ExcelCellValue[][];
  merges?: GridMerge[];
  headerRows?: number;
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

/** Convert only unambiguous decimal/integer values. Dates, IDs with leading
 * zeros, currency, thousands separators, and long identifiers remain text. */
export function inferExcelCellValue(text: string): ExcelCellValue {
  const value = text.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return value;
  if (value.replace(/[-.]/g, "").length > 15) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function tableRows(table: WordTable): ExcelCellValue[][] {
  return table.rows.map((row) => row.map((cell) => inferExcelCellValue(
    cell.map(lineText).filter(Boolean).join("\n"),
  )));
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

function worksheetXml(rows: ExcelCellValue[][], merges: GridMerge[] = [], headerRows = 1) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const widths = Array.from({ length: columns }, (_, column) => Math.min(40, Math.max(10,
    ...rows.slice(0, 200).map((row) => String(row[column] ?? "").split("\n").reduce((n, line) => Math.max(n, line.length), 0) + 2),
  )));
  const rowXml = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columns }, (_, column) => {
      const value = row[column] ?? "";
      const reference = `${columnName(column)}${rowIndex + 1}`;
      if (typeof value === "number") return `<c r="${reference}"${rowIndex < headerRows ? ' s="1"' : ""}><v>${value}</v></c>`;
      const preserve = /^\s|\s$|\n/.test(value) ? ' xml:space="preserve"' : "";
      return `<c r="${reference}" t="inlineStr"${rowIndex < headerRows ? ' s="1"' : ""}><is><t${preserve}>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    const lines = Math.max(1, ...row.map(value => String(value).split("\n").length));
    const height = Math.min(90, Math.max(18, lines * 15));
    return `<row r="${rowIndex + 1}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const last = `${columnName(columns - 1)}${Math.max(1, rows.length)}`;
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map(merge => `<mergeCell ref="${columnName(merge.startColumn)}${merge.startRow + 1}:${columnName(merge.endColumn)}${merge.endRow + 1}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRows}" topLeftCell="A${headerRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rowXml}</sheetData>${mergeXml}${rows.length && !merges.length ? `<autoFilter ref="A1:${last}"/>` : ""}</worksheet>`;
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
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheetXml(sheet.rows, sheet.merges, sheet.headerRows)); });
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
  let worker: Worker | null = null;
  let activePage = 0;
  let scannedPageCount = 0;
  const pages: WordPage[] = [];
  const vectorPages = new Map<number, VectorGridTable[]>();
  const sources: Array<"native" | "ocr"> = [];
  try {
    if (!document.numPages || document.numPages > MAX_PDF_TO_EXCEL_SOURCE_PAGES) {
      throw new PdfProcessingError("word-workload-too-large", `This tool supports PDFs with up to ${MAX_PDF_TO_EXCEL_SOURCE_PAGES} pages.`);
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      activePage = pageNumber;
      const page = await document.getPage(pageNumber);
      try {
        onProgress?.(pageNumber, document.numPages, "analyzing");
        const textContent = await page.getTextContent();
        const characters = textContent.items.reduce((count, item) => count + ("str" in item ? item.str.trim().length : 0), 0);
        if (characters >= 25) {
          const vectorTables = await extractVectorGridTables(page, textContent);
          if (vectorTables.length) {
            vectorPages.set(pageNumber, vectorTables);
            const viewport = page.getViewport({ scale: 1 });
            pages.push({ width: viewport.width, height: viewport.height, left: 0, right: viewport.width, top: 0, blocks: [] });
          } else pages.push(await extractWordPage(page, textContent));
          sources.push("native");
          continue;
        }
        scannedPageCount += 1;
        if (!worker) {
          worker = await createBrowserOcrWorker("eng", (message) => {
            const phase = /loading|initializing/i.test(message.status) ? "ocr-download" : "ocr";
            onProgress?.(activePage, document.numPages, phase, message.progress);
          });
        }
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(4, Math.max(2.5, 3000 / Math.max(viewport.width, viewport.height)));
        const canvas = await renderPageToCanvasForOcr(page, scale);
        try {
          onProgress?.(pageNumber, document.numPages, "ocr");
          const { data } = await worker.recognize(canvas, { rotateAuto: true }, { blocks: true, text: true });
          const adjustedViewport = page.getViewport({ scale: 1 });
          pages.push(buildOcrWordPage(recognitionLines(data), canvas.width, canvas.height, adjustedViewport.width, adjustedViewport.height));
          sources.push("ocr");
        } finally {
          canvas.width = 0; canvas.height = 0;
        }
      } finally { page.cleanup(); }
    }
    markTableContinuations(pages);
    const tables: ExtractedPdfTable[] = [];
    pages.forEach((page, pageIndex) => {
      const vectorTables = vectorPages.get(pageIndex + 1);
      if (vectorTables) {
        for (const vector of vectorTables) tables.push({ id: `table-${tables.length + 1}`, name: `Table ${tables.length + 1}`, pageStart: pageIndex + 1, pageEnd: pageIndex + 1, source: "native", rows: vector.rows.map(row => row.map(inferExcelCellValue)), merges: vector.merges, headerRows: vector.headerRows });
        return;
      }
      page.blocks.forEach((block) => {
        if (block.kind !== "table") return;
        const rows = tableRows(block);
        const previous = tables[tables.length - 1];
        if (block.continuation && previous && previous.rows[0]?.length === rows[0]?.length) {
          previous.rows.push(...rows);
          previous.pageEnd = pageIndex + 1;
          return;
        }
        tables.push({ id: `table-${tables.length + 1}`, name: `Table ${tables.length + 1}`, pageStart: pageIndex + 1, pageEnd: pageIndex + 1, source: sources[pageIndex], rows });
      });
    });
    return { tables, pageCount: document.numPages, scannedPageCount };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError("word-conversion-failed", caught instanceof Error ? caught.message : "The PDF tables could not be extracted.");
  } finally {
    if (worker) await worker.terminate();
    await document.destroy();
  }
}
