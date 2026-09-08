"use client";

import { useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfProcessingError, toPdfProcessingError } from "@/lib/pdf/errors";
import { parsePageSelection } from "@/lib/pdf/page-selection";
import { MAX_PDF_TOTAL_SIZE } from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";
import {
  MAX_PDF_WATERMARK_OUTPUT_SIZE,
  MAX_PDF_WATERMARK_SOURCE_PAGES,
  MAX_WATERMARK_FONT_SIZE,
  MAX_WATERMARK_TEXT_LENGTH,
  MIN_WATERMARK_FONT_SIZE,
  applyPdfTextWatermark,
  readPdfWatermarkMetadata,
  type PdfWatermarkPosition,
  type PdfWatermarkResult,
  type PdfWatermarkSource,
} from "@/lib/pdf/watermark";

type WatermarkStatus = "idle" | "loading" | "ready" | "processing" | "success" | "error";
type PageMode = "all" | "selected";

const ANGLES = [
  { value: -45, label: "−45° diagonal" },
  { value: 0, label: "0° horizontal" },
  { value: 45, label: "45° diagonal" },
  { value: 90, label: "90° vertical" },
];

const POSITIONS: { value: PdfWatermarkPosition; label: string }[] = [
  { value: "center", label: "Center" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

export function PdfWatermark() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfWatermarkSource | null>(null);
  const [status, setStatus] = useState<WatermarkStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [selectionError, setSelectionError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfWatermarkResult | null>(null);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(-45);
  const [position, setPosition] = useState<PdfWatermarkPosition>("center");
  const [pageMode, setPageMode] = useState<PageMode>("all");
  const [pageExpression, setPageExpression] = useState("");
  const download = usePdfDownload();
  const busy = status === "loading" || status === "processing";

  function discardResult() {
    download.clear();
    setResult(null);
  }

  function markChanged() {
    discardResult();
    setError(null);
    setStatus(source ? "ready" : "idle");
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    discardResult();
    setSource(null);
    setError(null);
    setSelectionError(null);
    setPageExpression("");
    setPageMode("all");
    setStatus("loading");
    try {
      const metadata = await readPdfWatermarkMetadata(file);
      setSource(metadata);
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The selected PDF could not be prepared for watermarking."));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updatePageExpression(value: string) {
    markChanged();
    setPageExpression(value);
    if (!source || !value.trim()) {
      setSelectionError(null);
      return;
    }
    try {
      parsePageSelection(value, source.pageCount);
      setSelectionError(null);
    } catch (caught) {
      setSelectionError(toPdfProcessingError(caught, "Check the selected page numbers."));
    }
  }

  function clear() {
    discardResult();
    setSource(null);
    setStatus("idle");
    setError(null);
    setSelectionError(null);
    setText("");
    setFontSize(48);
    setOpacity(0.25);
    setRotation(-45);
    setPosition("center");
    setPageMode("all");
    setPageExpression("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function applyWatermark() {
    if (!source || busy) return;
    discardResult();
    setError(null);

    if (!text.trim()) {
      setError(new PdfProcessingError("merge-failed", "Enter watermark text before creating the PDF."));
      setStatus("error");
      return;
    }

    let pages: number[];
    try {
      pages = pageMode === "all"
        ? Array.from({ length: source.pageCount }, (_, index) => index + 1)
        : parsePageSelection(pageExpression, source.pageCount).pages;
      setSelectionError(null);
    } catch (caught) {
      const nextError = toPdfProcessingError(caught, "Check the selected page numbers.");
      setSelectionError(nextError);
      setError(nextError);
      setStatus("error");
      return;
    }

    setStatus("processing");
    try {
      const nextResult = await applyPdfTextWatermark(source, {
        text,
        fontSize,
        opacity,
        rotation,
        position,
        pages,
      });
      download.replace(nextResult.blob, nextResult.filename);
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The watermarked PDF could not be created."));
      setStatus("error");
    }
  }

  const selectedCount = source
    ? pageMode === "all"
      ? source.pageCount
      : (() => {
          if (!pageExpression.trim() || selectionError) return 0;
          try {
            return parsePageSelection(pageExpression, source.pageCount).pages.length;
          } catch {
            return 0;
          }
        })()
    : 0;

  return (
    <section className="pdf-split-shell pdf-watermark-shell" aria-labelledby="pdf-watermark-title">
      <h2 className="sr-only" id="pdf-watermark-title">Add a text watermark to PDF</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is watermarked in your browser and is not uploaded to ToolNest.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-watermark-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-split-panel pdf-rotate-panel">
          <div className="pdf-source-summary">
            <span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span>
            <span className="pdf-file-details">
              <strong title={source.file.name}>{source.file.name}</strong>
              <small>{formatPdfBytes(source.file.size)} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"}</small>
            </span>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              Replace PDF
            </Button>
          </div>

          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="pdf-rotate-selection">
              <div className="input-field">
                <label className="input-label" htmlFor="watermark-text">Watermark text</label>
                <input
                  className="input-control"
                  id="watermark-text"
                  type="text"
                  value={text}
                  maxLength={MAX_WATERMARK_TEXT_LENGTH}
                  placeholder="For example: CONFIDENTIAL"
                  onChange={(event) => { markChanged(); setText(event.target.value); }}
                />
                <small className="input-hint">Basic Latin letters, numbers, and common punctuation · {text.length}/{MAX_WATERMARK_TEXT_LENGTH}</small>
              </div>

              <div className="input-field">
                <label className="input-label" htmlFor="watermark-font-size">Font size</label>
                <input
                  className="input-control"
                  id="watermark-font-size"
                  type="number"
                  min={MIN_WATERMARK_FONT_SIZE}
                  max={MAX_WATERMARK_FONT_SIZE}
                  step={1}
                  value={fontSize}
                  onChange={(event) => { markChanged(); setFontSize(Number(event.target.value)); }}
                />
                <small className="input-hint">{MIN_WATERMARK_FONT_SIZE}–{MAX_WATERMARK_FONT_SIZE} pt</small>
              </div>

              <div className="input-field">
                <label className="input-label" htmlFor="watermark-opacity">Opacity · {Math.round(opacity * 100)}%</label>
                <input
                  id="watermark-opacity"
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(event) => { markChanged(); setOpacity(Number(event.target.value)); }}
                />
                <small className="input-hint">Lower opacity keeps underlying content easier to read.</small>
              </div>

              <div className="input-field">
                <label className="input-label" htmlFor="watermark-angle">Angle</label>
                <select
                  className="input-control"
                  id="watermark-angle"
                  value={rotation}
                  onChange={(event) => { markChanged(); setRotation(Number(event.target.value)); }}
                >
                  {ANGLES.map((angle) => <option key={angle.value} value={angle.value}>{angle.label}</option>)}
                </select>
              </div>

              <div className="input-field">
                <label className="input-label" htmlFor="watermark-position">Position</label>
                <select
                  className="input-control"
                  id="watermark-position"
                  value={position}
                  onChange={(event) => { markChanged(); setPosition(event.target.value as PdfWatermarkPosition); }}
                >
                  {POSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="pdf-split-modes" disabled={busy}>
            <legend>Pages to watermark</legend>
            <label className={pageMode === "all" ? "is-selected" : ""}>
              <input
                type="radio"
                name="pdf-watermark-pages"
                checked={pageMode === "all"}
                onChange={() => { markChanged(); setPageMode("all"); setSelectionError(null); }}
              />
              <span><strong>All pages</strong><small>Apply the watermark across the full document.</small></span>
            </label>
            <label className={pageMode === "selected" ? "is-selected" : ""}>
              <input
                type="radio"
                name="pdf-watermark-pages"
                checked={pageMode === "selected"}
                onChange={() => { markChanged(); setPageMode("selected"); }}
              />
              <span><strong>Selected pages</strong><small>Use page numbers and ranges such as 1-3,6,8-10.</small></span>
            </label>
          </fieldset>

          {pageMode === "selected" && (
            <div className="pdf-rotate-selection">
              <div className="pdf-page-input">
                <label htmlFor="pdf-watermark-selection">Page selection</label>
                <input
                  id="pdf-watermark-selection"
                  value={pageExpression}
                  onChange={(event) => updatePageExpression(event.target.value)}
                  placeholder="For example: 1-3,6,8-10"
                  inputMode="numeric"
                  disabled={busy}
                  aria-invalid={Boolean(selectionError)}
                  aria-describedby="pdf-watermark-selection-help"
                />
                <small id="pdf-watermark-selection-help">Use individual pages, ranges, or a comma-separated mix.</small>
                {selectionError && <small className="input-hint is-error">{selectionError.message}</small>}
              </div>
            </div>
          )}

          <div className="pdf-plan-summary" aria-live="polite">
            <p><strong>{selectedCount} page{selectedCount === 1 ? "" : "s"} selected</strong> · {Math.round(opacity * 100)}% opacity · {rotation}° · {POSITIONS.find((item) => item.value === position)?.label}</p>
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to {MAX_PDF_WATERMARK_SOURCE_PAGES} pages and {Math.round(MAX_PDF_WATERMARK_OUTPUT_SIZE / 1024 / 1024)} MB output. The original PDF pages are not rasterized; text is drawn onto the existing page content.
            </span>
          </div>

          <div className="pdf-split-actions">
            <Button
              size="lg"
              onClick={() => void applyWatermark()}
              disabled={busy || !text.trim() || (pageMode === "selected" && (!pageExpression.trim() || Boolean(selectionError)))}
            >
              {status === "processing" ? "Applying watermark…" : result ? "Apply again" : "Apply Watermark"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>Clear</Button>
          </div>

          {result && download.download && (
            <div className="pdf-merge-result pdf-rotate-result" role="status">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Watermarked PDF is ready</strong>
                <p>{result.watermarkedPageCount} page{result.watermarkedPageCount === 1 ? "" : "s"} watermarked · {formatPdfBytes(result.size)}</p>
              </div>
              <a className={buttonClassName()} href={download.download.url} download={download.download.filename}>
                Download PDF
              </a>
            </div>
          )}

          <div className="pdf-status" aria-live="polite" aria-atomic="true">
            {status === "loading" && <p>Preparing and checking your PDF…</p>}
            {status === "processing" && <p>Adding the watermark to the selected pages in your browser…</p>}
            {error && <p className="converter-error"><strong>Couldn't create the watermarked PDF.</strong> {error.message}</p>}
          </div>
        </Card>
      )}
    </section>
  );
}
