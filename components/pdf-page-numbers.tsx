"use client";

import { useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfProcessingError, toPdfProcessingError } from "@/lib/pdf/errors";
import {
  applyPdfPageNumbers,
  formatPdfPageNumber,
  MAX_PAGE_NUMBER,
  MAX_PAGE_NUMBER_AFFIX_LENGTH,
  MAX_PAGE_NUMBER_FONT_SIZE,
  MIN_PAGE_NUMBER,
  MIN_PAGE_NUMBER_FONT_SIZE,
  readPdfPageNumberMetadata,
} from "@/lib/pdf/page-numbers";
import { parsePageSelection } from "@/lib/pdf/page-selection";
import {
  MAX_PDF_PAGE_NUMBER_SOURCE_PAGES,
  MAX_PDF_TOTAL_SIZE,
  type PdfPageNumberFormat,
  type PdfPageNumberMargin,
  type PdfPageNumberPosition,
  type PdfPageNumberResult,
  type PdfPageNumberSource,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";

type Status = "idle" | "loading" | "ready" | "numbering" | "success" | "error";
type PageMode = "all" | "selected";

const POSITIONS: Array<{ value: PdfPageNumberPosition; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

const FORMATS: Array<{ value: PdfPageNumberFormat; label: string }> = [
  { value: "number", label: "1, 2, 3" },
  { value: "page-number", label: "Page 1" },
  { value: "number-of-total", label: "1 of 10" },
  { value: "page-number-of-total", label: "Page 1 of 10" },
];

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PdfPageNumbers() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfPageNumberSource | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfPageNumberResult | null>(null);
  const [position, setPosition] = useState<PdfPageNumberPosition>("bottom-center");
  const [startingNumber, setStartingNumber] = useState(1);
  const [pageMode, setPageMode] = useState<PageMode>("all");
  const [pageExpression, setPageExpression] = useState("");
  const [pageError, setPageError] = useState<PdfProcessingError | null>(null);
  const [fontSize, setFontSize] = useState(12);
  const [margin, setMargin] = useState<PdfPageNumberMargin>("medium");
  const [format, setFormat] = useState<PdfPageNumberFormat>("number");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const download = usePdfDownload();
  const busy = status === "loading" || status === "numbering";

  function markChanged() {
    download.clear();
    setResult(null);
    setError(null);
    setStatus(source ? "ready" : "idle");
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    download.clear();
    setSource(null);
    setResult(null);
    setError(null);
    setPageError(null);
    setStatus("loading");
    try {
      setSource(await readPdfPageNumberMetadata(file, createPdfId()));
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The selected PDF could not be prepared for numbering."));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updatePageExpression(value: string) {
    markChanged();
    setPageExpression(value);
    if (!source || value.trim() === "") {
      setPageError(null);
      return;
    }
    try {
      parsePageSelection(value, source.pageCount, MAX_PDF_PAGE_NUMBER_SOURCE_PAGES);
      setPageError(null);
    } catch (caught) {
      setPageError(toPdfProcessingError(caught, "Check the selected page numbers."));
    }
  }

  function selectedPages() {
    if (!source) return [];
    if (pageMode === "all") {
      return Array.from({ length: source.pageCount }, (_, index) => index + 1);
    }
    return parsePageSelection(
      pageExpression,
      source.pageCount,
      MAX_PDF_PAGE_NUMBER_SOURCE_PAGES,
    ).pages;
  }

  function previewTotal() {
    if (!source || pageMode === "all") return source?.pageCount ?? 10;
    try {
      return selectedPages().length;
    } catch {
      return source.pageCount;
    }
  }

  function clear() {
    download.clear();
    setSource(null);
    setStatus("idle");
    setError(null);
    setResult(null);
    setPosition("bottom-center");
    setStartingNumber(1);
    setPageMode("all");
    setPageExpression("");
    setPageError(null);
    setFontSize(12);
    setMargin("medium");
    setFormat("number");
    setPrefix("");
    setSuffix("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function generate() {
    if (!source || busy) return;
    markChanged();
    if (
      !Number.isInteger(startingNumber)
      || startingNumber < MIN_PAGE_NUMBER
      || startingNumber > MAX_PAGE_NUMBER
      || !Number.isFinite(fontSize)
      || fontSize < MIN_PAGE_NUMBER_FONT_SIZE
      || fontSize > MAX_PAGE_NUMBER_FONT_SIZE
    ) {
      setError(new PdfProcessingError(
        "page-numbers-invalid-options",
        `Use a whole starting number from ${MIN_PAGE_NUMBER.toLocaleString()} to ${MAX_PAGE_NUMBER.toLocaleString()} and a font size from ${MIN_PAGE_NUMBER_FONT_SIZE} to ${MAX_PAGE_NUMBER_FONT_SIZE} pt.`,
      ));
      setStatus("error");
      return;
    }

    let pages: number[];
    try {
      pages = selectedPages();
      setPageError(null);
    } catch (caught) {
      const nextError = toPdfProcessingError(caught, "Check the selected page numbers.");
      setPageError(nextError);
      setStatus("error");
      return;
    }

    setStatus("numbering");
    try {
      const nextResult = await applyPdfPageNumbers(source, {
        position,
        startingNumber,
        pages,
        fontSize,
        margin,
        format,
        prefix,
        suffix,
      });
      download.replace(nextResult.blob, nextResult.filename);
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The numbered PDF could not be created."));
      setStatus("error");
    }
  }

  const preview = formatPdfPageNumber(
    Number.isInteger(startingNumber) && startingNumber >= 1 ? startingNumber : 1,
    previewTotal(),
    format,
    prefix,
    suffix,
  );

  return (
    <section className="pdf-page-numbers-shell" aria-labelledby="pdf-page-numbers-title">
      <h2 className="sr-only" id="pdf-page-numbers-title">Add PDF page numbers</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your PDF is processed in your browser.</strong>
          <p>The file is not uploaded to ToolNest, and no conversion server is used.</p>
        </div>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-page-numbers-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-watermark-panel pdf-page-numbers-panel">
          <div className="pdf-source-summary">
            <span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span>
            <span className="pdf-file-details">
              <strong title={source.file.name}>{source.file.name}</strong>
              <small>{formatPdfBytes(source.file.size)} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"}</small>
            </span>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Replace PDF</Button>
          </div>

          <div className="pdf-watermark-controls">
            <div className="pdf-watermark-grid">
              <div className="pdf-watermark-field">
                <label htmlFor="pdf-page-number-position">Position</label>
                <select id="pdf-page-number-position" value={position} disabled={busy} onChange={(event) => { markChanged(); setPosition(event.target.value as PdfPageNumberPosition); }}>
                  {POSITIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="pdf-watermark-field">
                <label htmlFor="pdf-page-number-start">Starting number</label>
                <input id="pdf-page-number-start" type="number" min={MIN_PAGE_NUMBER} max={MAX_PAGE_NUMBER} step={1} value={startingNumber} disabled={busy} onChange={(event) => { markChanged(); setStartingNumber(Number(event.target.value)); }} />
                <small>The first numbered page starts here.</small>
              </div>
            </div>

            <fieldset className="pdf-page-number-formats">
              <legend>Number format</legend>
              <div>
                {FORMATS.map((option) => (
                  <label key={option.value} className={format === option.value ? "is-selected" : ""}>
                    <input type="radio" name="pdf-page-number-format" checked={format === option.value} disabled={busy} onChange={() => { markChanged(); setFormat(option.value); }} />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="pdf-page-number-preview" aria-live="polite">
              <span>Preview</span>
              <strong>{preview}</strong>
            </div>

            <div className="pdf-watermark-grid">
              <div className="pdf-watermark-field">
                <label htmlFor="pdf-page-number-font-size">Font size</label>
                <input id="pdf-page-number-font-size" type="number" min={MIN_PAGE_NUMBER_FONT_SIZE} max={MAX_PAGE_NUMBER_FONT_SIZE} step={1} value={fontSize} disabled={busy} onChange={(event) => { markChanged(); setFontSize(Number(event.target.value)); }} />
                <small>{MIN_PAGE_NUMBER_FONT_SIZE}–{MAX_PAGE_NUMBER_FONT_SIZE} pt.</small>
              </div>
              <div className="pdf-watermark-field">
                <label htmlFor="pdf-page-number-margin">Distance from edge</label>
                <select id="pdf-page-number-margin" value={margin} disabled={busy} onChange={(event) => { markChanged(); setMargin(event.target.value as PdfPageNumberMargin); }}>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>

            <details className="pdf-page-number-affixes">
              <summary>Optional prefix and suffix</summary>
              <div className="pdf-watermark-grid">
                <div className="pdf-watermark-field">
                  <label htmlFor="pdf-page-number-prefix">Prefix</label>
                  <input id="pdf-page-number-prefix" value={prefix} maxLength={MAX_PAGE_NUMBER_AFFIX_LENGTH} placeholder="For example: Section A - " disabled={busy} onChange={(event) => { markChanged(); setPrefix(event.target.value); }} />
                </div>
                <div className="pdf-watermark-field">
                  <label htmlFor="pdf-page-number-suffix">Suffix</label>
                  <input id="pdf-page-number-suffix" value={suffix} maxLength={MAX_PAGE_NUMBER_AFFIX_LENGTH} placeholder="For example: of Report" disabled={busy} onChange={(event) => { markChanged(); setSuffix(event.target.value); }} />
                </div>
              </div>
              <small>Spaces and punctuation are kept exactly as entered.</small>
            </details>

            <fieldset className="pdf-split-modes pdf-watermark-pages">
              <legend>Pages to number</legend>
              <label className={pageMode === "all" ? "is-selected" : ""}>
                <input type="radio" name="pdf-page-number-pages" checked={pageMode === "all"} disabled={busy} onChange={() => { markChanged(); setPageMode("all"); setPageError(null); }} />
                <span><strong>All pages</strong><small>Number all {source.pageCount} pages.</small></span>
              </label>
              <label className={pageMode === "selected" ? "is-selected" : ""}>
                <input type="radio" name="pdf-page-number-pages" checked={pageMode === "selected"} disabled={busy} onChange={() => { markChanged(); setPageMode("selected"); }} />
                <span><strong>Selected pages</strong><small>Number a sequence of chosen pages.</small></span>
              </label>
            </fieldset>

            {pageMode === "selected" && (
              <div className="pdf-page-input">
                <label htmlFor="pdf-page-number-selection">Page selection</label>
                <input id="pdf-page-number-selection" value={pageExpression} placeholder="For example: 1-3,6,8-10" inputMode="numeric" disabled={busy} aria-invalid={Boolean(pageError)} aria-describedby="pdf-page-number-selection-help pdf-page-number-selection-error" onChange={(event) => updatePageExpression(event.target.value)} />
                <small id="pdf-page-number-selection-help">Selected pages are numbered sequentially in document order.</small>
                {pageError && <small className="is-error" id="pdf-page-number-selection-error">{pageError.message}</small>}
              </div>
            )}
          </div>

          <div className="pdf-watermark-actions">
            <Button size="lg" onClick={() => void generate()} disabled={busy || Boolean(pageError)}>
              {status === "numbering" ? "Adding page numbers…" : result ? "Add again" : "Add page numbers"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>Reset</Button>
          </div>

          {result && download.download && (
            <div className="pdf-merge-result pdf-watermark-result" role="status">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Numbered PDF ready</strong>
                <p>{result.filename}</p>
                <small>{formatPdfBytes(result.size)} · {result.numberedPageCount} of {result.pageCount} page{result.pageCount === 1 ? "" : "s"} numbered</small>
              </div>
              <a className={buttonClassName()} href={download.download.url} download={download.download.filename}>Download PDF</a>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>Reading your PDF…</p>}
        {status === "numbering" && <p>Adding page numbers locally…</p>}
        {error && <p className="converter-error"><strong>Couldn’t create the numbered PDF.</strong> {error.message}</p>}
      </div>
    </section>
  );
}
