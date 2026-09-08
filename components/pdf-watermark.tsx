"use client";

import { useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import { parsePageSelection } from "@/lib/pdf/page-selection";
import {
  MAX_PDF_TOTAL_SIZE,
  MAX_PDF_WATERMARK_SOURCE_PAGES,
  type PdfWatermarkAngle,
  type PdfWatermarkPosition,
  type PdfWatermarkResult,
  type PdfWatermarkSource,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";
import {
  applyPdfWatermark,
  readPdfWatermarkMetadata,
} from "@/lib/pdf/watermark";

type Status = "idle" | "loading" | "ready" | "watermarking" | "success" | "error";
type PageMode = "all" | "selected";

const ANGLES: Array<{ value: PdfWatermarkAngle; label: string }> = [
  { value: 0, label: "0°" },
  { value: 45, label: "45°" },
  { value: -45, label: "−45°" },
  { value: 90, label: "90°" },
];

const POSITIONS: Array<{ value: PdfWatermarkPosition; label: string }> = [
  { value: "center", label: "Center" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PdfWatermark() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfWatermarkSource | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfWatermarkResult | null>(null);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [angle, setAngle] = useState<PdfWatermarkAngle>(-45);
  const [position, setPosition] = useState<PdfWatermarkPosition>("center");
  const [pageMode, setPageMode] = useState<PageMode>("all");
  const [pageExpression, setPageExpression] = useState("");
  const [pageError, setPageError] = useState<PdfProcessingError | null>(null);
  const download = usePdfDownload();
  const busy = status === "loading" || status === "watermarking";

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
    setResult(null);
    setSource(null);
    setError(null);
    setPageError(null);
    setStatus("loading");

    try {
      const metadata = await readPdfWatermarkMetadata(file, createPdfId());
      setSource(metadata);
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF could not be prepared for watermarking.",
      ));
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
      parsePageSelection(value, source.pageCount, MAX_PDF_WATERMARK_SOURCE_PAGES);
      setPageError(null);
    } catch (caught) {
      setPageError(toPdfProcessingError(caught, "Check the selected page numbers."));
    }
  }

  function clear() {
    download.clear();
    setSource(null);
    setResult(null);
    setError(null);
    setPageError(null);
    setStatus("idle");
    setText("");
    setFontSize(48);
    setOpacity(0.25);
    setAngle(-45);
    setPosition("center");
    setPageMode("all");
    setPageExpression("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function generate() {
    if (!source || busy) return;
    markChanged();

    if (!text.trim()) {
      setError(new PdfProcessingError(
        "watermark-empty-text",
        "Enter the text you want to add as a watermark.",
      ));
      setStatus("error");
      return;
    }

    let pages: number[];
    if (pageMode === "all") {
      pages = Array.from({ length: source.pageCount }, (_, index) => index + 1);
    } else {
      try {
        pages = parsePageSelection(
          pageExpression,
          source.pageCount,
          MAX_PDF_WATERMARK_SOURCE_PAGES,
        ).pages;
        setPageError(null);
      } catch (caught) {
        const nextError = toPdfProcessingError(caught, "Check the selected page numbers.");
        setPageError(nextError);
        setStatus("error");
        return;
      }
    }

    setStatus("watermarking");
    try {
      const nextResult = await applyPdfWatermark(source, {
        text,
        fontSize,
        opacity,
        angle,
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

  return (
    <section className="pdf-watermark-shell" aria-labelledby="pdf-watermark-title">
      <h2 className="sr-only" id="pdf-watermark-title">Add a PDF watermark</h2>
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
        inputId="pdf-watermark-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-watermark-panel">
          <div className="pdf-source-summary">
            <span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span>
            <span className="pdf-file-details">
              <strong title={source.file.name}>{source.file.name}</strong>
              <small>
                {formatPdfBytes(source.file.size)} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"}
              </small>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              Replace PDF
            </Button>
          </div>

          <div className="pdf-watermark-controls">
            <div className="pdf-watermark-field">
              <label htmlFor="pdf-watermark-text">Watermark text</label>
              <input
                id="pdf-watermark-text"
                value={text}
                maxLength={200}
                placeholder="For example: CONFIDENTIAL"
                disabled={busy}
                aria-invalid={Boolean(error?.code === "watermark-empty-text")}
                onChange={(event) => {
                  markChanged();
                  setText(event.target.value);
                }}
              />
              <small>Up to 200 common Latin characters and punctuation.</small>
            </div>

            <div className="pdf-watermark-grid">
              <div className="pdf-watermark-field">
                <label htmlFor="pdf-watermark-size">Font size</label>
                <input
                  id="pdf-watermark-size"
                  type="number"
                  min={12}
                  max={144}
                  step={1}
                  value={fontSize}
                  disabled={busy}
                  onChange={(event) => {
                    markChanged();
                    setFontSize(Number(event.target.value));
                  }}
                />
                <small>12–144 pt. Long text is fitted inside each page.</small>
              </div>

              <div className="pdf-watermark-field">
                <label htmlFor="pdf-watermark-position">Position</label>
                <select
                  id="pdf-watermark-position"
                  value={position}
                  disabled={busy}
                  onChange={(event) => {
                    markChanged();
                    setPosition(event.target.value as PdfWatermarkPosition);
                  }}
                >
                  {POSITIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pdf-watermark-field">
              <label htmlFor="pdf-watermark-opacity">
                Opacity <output>{Math.round(opacity * 100)}%</output>
              </label>
              <input
                id="pdf-watermark-opacity"
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                disabled={busy}
                onChange={(event) => {
                  markChanged();
                  setOpacity(Number(event.target.value) / 100);
                }}
              />
              <small>Lower opacity keeps the original page easier to read.</small>
            </div>

            <fieldset className="pdf-watermark-options">
              <legend>Angle</legend>
              <div>
                {ANGLES.map((option) => (
                  <label key={option.value} className={angle === option.value ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="pdf-watermark-angle"
                      value={option.value}
                      checked={angle === option.value}
                      disabled={busy}
                      onChange={() => {
                        markChanged();
                        setAngle(option.value);
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="pdf-split-modes pdf-watermark-pages">
              <legend>Pages to watermark</legend>
              <label className={pageMode === "all" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="pdf-watermark-pages"
                  checked={pageMode === "all"}
                  disabled={busy}
                  onChange={() => {
                    markChanged();
                    setPageMode("all");
                    setPageError(null);
                  }}
                />
                <span><strong>All pages</strong><small>Apply to all {source.pageCount} pages.</small></span>
              </label>
              <label className={pageMode === "selected" ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="pdf-watermark-pages"
                  checked={pageMode === "selected"}
                  disabled={busy}
                  onChange={() => {
                    markChanged();
                    setPageMode("selected");
                  }}
                />
                <span><strong>Selected pages</strong><small>Enter page numbers or ranges.</small></span>
              </label>
            </fieldset>

            {pageMode === "selected" && (
              <div className="pdf-page-input">
                <label htmlFor="pdf-watermark-page-selection">Page selection</label>
                <input
                  id="pdf-watermark-page-selection"
                  value={pageExpression}
                  placeholder="For example: 1-3,6,8-10"
                  inputMode="numeric"
                  disabled={busy}
                  aria-invalid={Boolean(pageError)}
                  aria-describedby="pdf-watermark-page-help pdf-watermark-page-error"
                  onChange={(event) => updatePageExpression(event.target.value)}
                />
                <small id="pdf-watermark-page-help">Use commas between pages and ranges.</small>
                {pageError && <small className="is-error" id="pdf-watermark-page-error">{pageError.message}</small>}
              </div>
            )}
          </div>

          <div className="pdf-watermark-actions">
            <Button
              size="lg"
              onClick={() => void generate()}
              disabled={busy || !text.trim() || Boolean(pageError)}
            >
              {status === "watermarking" ? "Applying watermark…" : result ? "Apply again" : "Apply watermark"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>Reset</Button>
          </div>

          {result && download.download && (
            <div className="pdf-merge-result pdf-watermark-result" role="status">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Watermarked PDF ready</strong>
                <p>{result.filename}</p>
                <small>
                  {formatPdfBytes(result.size)} · {result.watermarkedPageCount} of {result.pageCount} page{result.pageCount === 1 ? "" : "s"} watermarked
                </small>
              </div>
              <a
                className={buttonClassName()}
                href={download.download.url}
                download={download.download.filename}
              >
                Download PDF
              </a>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>Reading your PDF…</p>}
        {status === "watermarking" && <p>Adding your watermark locally…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t create the watermarked PDF.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
