"use client";

import { useEffect, useRef, useState } from "react";
import { PdfToExcelSourceReview } from "@/components/pdf-to-excel-source-review";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfProcessingError, toPdfProcessingError } from "@/lib/pdf/errors";
import { makeExcelFilename, makeTableCsvFilename } from "@/lib/pdf/filenames";
import { readPdfMetadata } from "@/lib/pdf/metadata";
import {
  SOURCE_REVIEW_COPY,
  describeSourceReviewSelection,
  firstEvidenceCell,
  type SourceReviewCell,
} from "@/lib/pdf/source-review";
import {
  createExcelWorkbook,
  createTableCsv,
  extractPdfTables,
  type ExtractedPdfTable,
  type PdfTableExtractionResult,
  type PdfToExcelProgressPhase,
} from "@/lib/pdf/to-excel";
import { MAX_PDF_TOTAL_SIZE } from "@/lib/pdf/types";
import { formatPdfBytes } from "@/lib/pdf/validation";

type Status = "idle" | "preparing" | "ready" | "extracting" | "success" | "error";
const id = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pdf-${Date.now()}`;

export function PdfToExcel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ file: File; pageCount: number } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfTableExtractionResult | null>(null);
  const [tables, setTables] = useState<ExtractedPdfTable[]>([]);
  const [selected, setSelected] = useState(0);
  const [activeCell, setActiveCell] = useState<SourceReviewCell | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; phase: PdfToExcelProgressPhase; part?: number } | null>(null);
  const [xlsxUrl, setXlsxUrl] = useState<string | null>(null);
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const busy = status === "preparing" || status === "extracting";

  useEffect(() => () => { if (xlsxUrl) URL.revokeObjectURL(xlsxUrl); }, [xlsxUrl]);
  useEffect(() => () => { if (csvUrl) URL.revokeObjectURL(csvUrl); }, [csvUrl]);

  function discardOutput() {
    if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
    if (csvUrl) URL.revokeObjectURL(csvUrl);
    setXlsxUrl(null); setCsvUrl(null); setResult(null); setTables([]); setSelected(0); setProgress(null);
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    discardOutput(); setSource(null); setError(null); setStatus("preparing");
    try {
      const metadata = await readPdfMetadata(file, id());
      setSource({ file: metadata.file, pageCount: metadata.pageCount }); setStatus("ready");
    } catch (caught) { setError(toPdfProcessingError(caught, "The selected PDF could not be prepared.")); setStatus("error"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  }

  function clear() {
    discardOutput(); setSource(null); setError(null); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyze() {
    if (!source || busy) return;
    discardOutput(); setError(null); setStatus("extracting");
    try {
      const next = await extractPdfTables(source.file, (current, total, phase, part) => setProgress({ current, total, phase, part }));
      setResult(next); setTables(next.tables); setSelected(0); setStatus("success");
      if (next.tables.length) setXlsxUrl(URL.createObjectURL(createExcelWorkbook(next.tables)));
    } catch (caught) { setError(toPdfProcessingError(caught, "The selected PDF tables could not be extracted.")); setStatus("error"); }
  }

  const table = tables[selected];
  // Source Review follows the active table; editing a row must never move the selection.
  useEffect(() => {
    setActiveCell(firstEvidenceCell(tables[selected]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, table?.id, result]);
  const selection = describeSourceReviewSelection(table, activeCell);

  useEffect(() => {
    if (csvUrl) URL.revokeObjectURL(csvUrl);
    setCsvUrl(table ? URL.createObjectURL(createTableCsv(table)) : null);
  // Rebuild the selected CSV after any preview edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  function editCell(rowIndex: number, columnIndex: number, value: string) {
    setTables((current) => current.map((item, tableIndex) => tableIndex !== selected ? item : {
      ...item, rows: item.rows.map((row, index) => index !== rowIndex ? row : row.map((cell, column) => column === columnIndex ? value : cell)),
    }));
    if (xlsxUrl) URL.revokeObjectURL(xlsxUrl);
    const nextTables = tables.map((item, tableIndex) => tableIndex !== selected ? item : {
      ...item, rows: item.rows.map((row, index) => index !== rowIndex ? row : row.map((cell, column) => column === columnIndex ? value : cell)),
    });
    setXlsxUrl(URL.createObjectURL(createExcelWorkbook(nextTables)));
  }

  const progressText = progress?.phase === "ocr-download"
    ? `Preparing OCR language data${progress.part !== undefined ? `… ${Math.round(progress.part * 100)}%` : "…"}`
    : progress?.phase === "ocr"
      ? `Reading scanned page ${progress.current} of ${progress.total}${progress.part !== undefined ? `… ${Math.round(progress.part * 100)}%` : "…"}`
      : progress ? `Analyzing page ${progress.current} of ${progress.total}…` : "Analyzing PDF…";

  return <section className="pdf-split-shell pdf-to-excel-shell" aria-labelledby="pdf-to-excel-title">
    <h2 className="sr-only" id="pdf-to-excel-title">Extract PDF tables to Excel</h2>
    <div className="privacy-banner"><span aria-hidden="true">✓</span><strong>Your PDF is processed on your device and is not uploaded.</strong></div>
    <PdfUploader inputRef={inputRef} busy={busy} compact={Boolean(source)} multiple={false} inputId="pdf-to-excel-file"
      heading="Drop one PDF with tables here" compactHeading="Replace PDF" buttonLabel={source ? "Choose another" : "Choose PDF"}
      helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`} onSelect={(files) => void selectPdf(files)} />

    {source && <Card className="pdf-split-panel pdf-to-excel-panel">
      <div className="pdf-source-summary"><span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span><span className="pdf-file-details"><strong title={source.file.name}>{source.file.name}</strong><small>{formatPdfBytes(source.file.size)} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"}</small></span><Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Replace PDF</Button></div>
      <div className="pdf-safety-note"><strong>Best for structured tables</strong><span>Regular rows and columns work best. Complex merged cells, handwritten text, and decorative layouts may need manual cleanup.</span></div>
      <div className="pdf-split-actions"><Button size="lg" onClick={() => void analyze()} disabled={busy}>{status === "extracting" ? progressText : result ? "Analyze again" : "Analyze tables"}</Button><Button variant="ghost" onClick={clear} disabled={busy}>Reset</Button></div>
    </Card>}

    {result && <div className="pdf-excel-result" role="status">
      {tables.length === 0 ? <Card className="pdf-excel-empty"><strong>No clear tables found</strong><p>The PDF was read successfully, but no regular table structure could be identified confidently. Try a PDF with clearer rows and columns.</p></Card> : <>
        <div className="pdf-excel-summary"><div><strong>{tables.length} table{tables.length === 1 ? "" : "s"} found</strong><p>{result.pageCount} page{result.pageCount === 1 ? "" : "s"}{result.scannedPageCount ? ` · OCR used on ${result.scannedPageCount}` : " · Selectable text"}</p></div>{xlsxUrl && <a className={buttonClassName()} href={xlsxUrl} download={makeExcelFilename(source?.file.name ?? "document.pdf")}>Download Excel (.xlsx)</a>}</div>
        <div className="pdf-excel-tabs" role="tablist" aria-label="Extracted tables">{tables.map((item, index) => <button type="button" role="tab" aria-selected={selected === index} className={selected === index ? "is-active" : ""} key={item.id} onClick={() => setSelected(index)}>{item.name}<small>p. {item.pageStart}{item.pageEnd > item.pageStart ? `–${item.pageEnd}` : ""}</small></button>)}</div>
        {table && <Card className="pdf-excel-preview"><div className="pdf-excel-preview-head"><div><strong>{table.name}</strong><span>{table.rows.length} rows · {Math.max(0, ...table.rows.map((row) => row.length))} columns · {table.source === "ocr" ? "OCR" : "PDF text"}</span></div>{csvUrl && <a className={buttonClassName({ variant: "secondary" })} href={csvUrl} download={makeTableCsvFilename(source?.file.name ?? "document.pdf", table.name)}>Download this table (.csv)</a>}</div><p className="pdf-excel-edit-note">Review and edit cells before downloading. Changes are kept only in this browser session.</p><div className="pdf-excel-review-head"><h3 className="pdf-excel-review-title" id="pdf-to-excel-source-review-title">{SOURCE_REVIEW_COPY.heading}</h3><p className="pdf-excel-review-instruction">{SOURCE_REVIEW_COPY.instruction}</p></div><div className="pdf-excel-review"><section className="pdf-excel-review-source" aria-labelledby="pdf-to-excel-source-review-title">{source && <PdfToExcelSourceReview file={source.file} totalPages={result?.pageCount ?? source.pageCount} evidence={selection.evidence} notice={selection.notice} cell={selection.cell} mergedAnchor={selection.mergedAnchor} />}</section><section className="pdf-excel-review-table"><div className="pdf-excel-table-scroll"><table><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className={activeCell?.row === rowIndex && activeCell.column === columnIndex ? "is-source-selected" : undefined}><textarea aria-label={`${table.name}, row ${rowIndex + 1}, column ${columnIndex + 1}`} rows={String(cell).includes("\n") ? 2 : 1} value={String(cell)} onFocus={() => setActiveCell({ row: rowIndex, column: columnIndex })} onClick={() => setActiveCell({ row: rowIndex, column: columnIndex })} onChange={(event) => editCell(rowIndex, columnIndex, event.target.value)} /></td>)}</tr>)}</tbody></table></div></section></div></Card>}
      </>}
    </div>}

    <div className="pdf-status" aria-live="polite" aria-atomic="true">{status === "preparing" && <p>Preparing and checking your PDF…</p>}{status === "extracting" && <p>{progress?.phase === "ocr" || progress?.phase === "ocr-download" ? "This page has no selectable text, so on-device OCR is reading it. OCR language data may be downloaded when needed, but your PDF is not uploaded." : "Finding regular table rows and columns in your PDF…"}</p>}{error && <p className="converter-error"><strong>Couldn&apos;t extract these tables.</strong> {error.message}</p>}</div>
    <div className="privacy-note"><p><strong>Private, editable output.</strong> PDF reading, OCR, table detection, spreadsheet creation, preview edits, and downloads happen in your browser. Each detected table becomes its own Excel worksheet. Ambiguous content is left out rather than forced into a misleading table.</p></div>
  </section>;
}
