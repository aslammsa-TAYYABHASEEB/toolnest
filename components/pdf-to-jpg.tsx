"use client";

import { useMemo, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import { makePdfImagesZipFilename } from "@/lib/pdf/filenames";
import { renderPdfPages } from "@/lib/pdf/render-pages";
import { createPdfRenderPageSelection } from "@/lib/pdf/render-selection";
import { readRenderablePdfMetadata } from "@/lib/pdf/renderer";
import {
  MAX_PDF_RENDER_DIMENSION,
  MAX_PDF_RENDER_OUTPUTS,
  MAX_PDF_RENDER_SOURCE_PAGES,
  MAX_PDF_RENDER_TOTAL_PIXELS,
  MAX_PDF_TOTAL_SIZE,
  type PdfImageFormat,
  type PdfPageSelectionMode,
  type PdfRenderResult,
  type PdfRenderScale,
  type PdfRenderSource,
} from "@/lib/pdf/types";
import { useRenderedImageDownloads } from "@/lib/pdf/use-rendered-image-downloads";
import {
  formatPdfBytes,
  validatePdfTotalSize,
} from "@/lib/pdf/validation";
import { createPdfZip } from "@/lib/pdf/zip";

type PdfToImageStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "rendering"
  | "packaging"
  | "success"
  | "error";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PdfToJpg() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfRenderSource | null>(null);
  const [selectionMode, setSelectionMode] =
    useState<PdfPageSelectionMode>("all");
  const [pageExpression, setPageExpression] = useState("");
  const [format, setFormat] = useState<PdfImageFormat>("jpeg");
  const [quality, setQuality] = useState(90);
  const [scale, setScale] = useState<PdfRenderScale>(1.5);
  const [status, setStatus] = useState<PdfToImageStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfRenderResult | null>(null);
  const downloads = useRenderedImageDownloads();
  const busy =
    status === "preparing" ||
    status === "rendering" ||
    status === "packaging";

  const plan = useMemo(() => {
    if (!source) return { pages: null, error: null };
    if (selectionMode !== "all" && pageExpression.trim() === "") {
      return { pages: null, error: null };
    }
    try {
      return {
        pages: createPdfRenderPageSelection(
          selectionMode,
          pageExpression,
          source.pageCount,
        ),
        error: null,
      };
    } catch (caught) {
      return {
        pages: null,
        error: toPdfProcessingError(caught, "Check the page selection."),
      };
    }
  }, [pageExpression, selectionMode, source]);

  function discardResult() {
    downloads.clear();
    setResult(null);
  }

  function markSettingsChanged() {
    discardResult();
    setError(null);
    setStatus(source ? "ready" : "idle");
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    discardResult();
    setSource(null);
    setPageExpression("");
    setError(null);
    setStatus("preparing");

    try {
      validatePdfTotalSize([file]);
      const metadata = await readRenderablePdfMetadata(file, createPdfId());
      setSource(metadata);
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF could not be prepared.",
      ));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    discardResult();
    setSource(null);
    setSelectionMode("all");
    setPageExpression("");
    setFormat("jpeg");
    setQuality(90);
    setScale(1.5);
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function convert() {
    if (!source || !plan.pages || busy) return;
    discardResult();
    setError(null);
    setStatus("rendering");

    try {
      const nextResult = await renderPdfPages(source.file, plan.pages, {
        format,
        quality: quality / 100,
        scale,
      });
      let zip: { blob: Blob; filename: string } | undefined;
      if (nextResult.images.length > 1) {
        setStatus("packaging");
        zip = {
          blob: await createPdfZip(nextResult.images),
          filename: makePdfImagesZipFilename(source.file.name),
        };
      }
      downloads.replace(nextResult.images, zip);
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF pages could not be converted.",
      ));
      setStatus("error");
    }
  }

  const estimatedWidth = source
    ? Math.ceil(source.firstPageWidth * scale)
    : 0;
  const estimatedHeight = source
    ? Math.ceil(source.firstPageHeight * scale)
    : 0;
  const canConvert = Boolean(
    source && plan.pages && !plan.error && !busy,
  );

  return (
    <section className="pdf-split-shell pdf-to-image-shell" aria-labelledby="pdf-to-image-title">
      <h2 className="sr-only" id="pdf-to-image-title">Convert PDF pages to images</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is converted locally and never leaves your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-to-image-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-split-panel">
          <div className="pdf-source-summary">
            <span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span>
            <span className="pdf-file-details">
              <strong title={source.file.name}>{source.file.name}</strong>
              <small>
                {formatPdfBytes(source.file.size)}
                {" · "}
                {source.pageCount} page{source.pageCount === 1 ? "" : "s"}
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

          <fieldset className="pdf-split-modes" disabled={busy}>
            <legend>Which pages should become images?</legend>
            {([
              ["all", "All pages", "Convert the whole PDF in document order."],
              ["selected", "Selected pages", "Use pages and mixed ranges such as 1,3-5,8."],
              ["range", "Page range", "Convert one range, including reverse input such as 8-3."],
            ] as const).map(([value, label, description]) => (
              <label
                key={value}
                className={selectionMode === value ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="pdf-render-pages"
                  value={value}
                  checked={selectionMode === value}
                  onChange={() => {
                    markSettingsChanged();
                    setSelectionMode(value);
                    setPageExpression("");
                  }}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {selectionMode !== "all" && (
            <div className="pdf-page-input">
              <label htmlFor="pdf-render-selection">
                {selectionMode === "range" ? "Page range" : "Pages to convert"}
              </label>
              <input
                id="pdf-render-selection"
                value={pageExpression}
                onChange={(event) => {
                  markSettingsChanged();
                  setPageExpression(event.target.value);
                }}
                placeholder={selectionMode === "range" ? "For example: 3-10" : "For example: 1,3-5,8"}
                inputMode="numeric"
                disabled={busy}
                aria-describedby="pdf-render-selection-help pdf-render-plan"
                aria-invalid={Boolean(plan.error)}
              />
              <small id="pdf-render-selection-help">
                Reverse ranges are normalized, duplicates are removed, and pages are sorted in document order.
              </small>
            </div>
          )}

          <div className="pdf-render-controls">
            <fieldset className="image-pdf-option-group" disabled={busy}>
              <legend>Image format</legend>
              <div>
                {([
                  ["jpeg", "JPG"],
                  ["png", "PNG"],
                ] as const).map(([value, label]) => (
                  <label key={value} className={format === value ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="pdf-image-format"
                      checked={format === value}
                      onChange={() => {
                        markSettingsChanged();
                        setFormat(value);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {format === "jpeg" && (
              <div className="quality-control">
                <div>
                  <label htmlFor="pdf-jpg-quality">JPG quality</label>
                  <output htmlFor="pdf-jpg-quality">{quality}%</output>
                </div>
                <input
                  id="pdf-jpg-quality"
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={quality}
                  disabled={busy}
                  onChange={(event) => {
                    markSettingsChanged();
                    setQuality(Number(event.target.value));
                  }}
                />
                <p>Higher quality usually creates a larger JPG file.</p>
              </div>
            )}

            <fieldset className="image-pdf-option-group" disabled={busy}>
              <legend>Render scale</legend>
              <div>
                {([1, 1.5, 2, 3] as const).map((value) => (
                  <label key={value} className={scale === value ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="pdf-render-scale"
                      checked={scale === value}
                      onChange={() => {
                        markSettingsChanged();
                        setScale(value);
                      }}
                    />
                    {value}×
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="pdf-plan-summary" id="pdf-render-plan" aria-live="polite">
            {plan.error ? (
              <p className="is-error">{plan.error.message}</p>
            ) : plan.pages ? (
              <p>
                <strong>
                  {plan.pages.length} image{plan.pages.length === 1 ? "" : "s"}
                  {" · "}
                  {format === "jpeg" ? "JPG" : "PNG"}
                </strong>
                {" · "}
                first-page estimate {estimatedWidth.toLocaleString()} × {estimatedHeight.toLocaleString()} px
              </p>
            ) : (
              <p>Enter pages to preview the conversion plan.</p>
            )}
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to {MAX_PDF_RENDER_SOURCE_PAGES.toLocaleString()} source pages,
              {" "}{MAX_PDF_RENDER_OUTPUTS} output images,
              {" "}{MAX_PDF_RENDER_DIMENSION.toLocaleString()} px per dimension,
              and {Math.round(MAX_PDF_RENDER_TOTAL_PIXELS / 1024 / 1024)} million
              total output pixels. Lower scale or fewer pages can help on
              memory-constrained devices.
            </span>
          </div>

          <div className="pdf-split-actions">
            <Button size="lg" onClick={() => void convert()} disabled={!canConvert}>
              {status === "rendering"
                ? "Rendering…"
                : status === "packaging"
                  ? "Packaging…"
                  : result
                    ? "Convert again"
                    : "Convert pages"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          </div>

          {result && downloads.downloads.length === result.images.length && (
            <div className="pdf-split-result" role="status">
              <div className="pdf-result-heading">
                <span className="success-mark" aria-hidden="true">✓</span>
                <div>
                  <strong>Images are ready</strong>
                  <p>
                    {result.pageCount} image{result.pageCount === 1 ? "" : "s"}
                    {" · "}
                    {formatPdfBytes(result.totalSize)}
                    {" · "}
                    {result.options.format === "jpeg" ? "JPG" : "PNG"}
                  </p>
                </div>
                {downloads.zipDownload && (
                  <a
                    className={buttonClassName()}
                    href={downloads.zipDownload.url}
                    download={downloads.zipDownload.filename}
                  >
                    Download all as ZIP
                  </a>
                )}
              </div>

              <ul className="pdf-render-result-list">
                {result.images.map((image, index) => (
                  <li key={image.filename}>
                    <img
                      src={downloads.downloads[index].previewUrl}
                      alt={`Preview of PDF page ${image.pageNumber}`}
                    />
                    <span>
                      <strong title={image.filename}>{image.filename}</strong>
                      <small>
                        Page {image.pageNumber}
                        {" · "}
                        {image.width.toLocaleString()} × {image.height.toLocaleString()} px
                        {" · "}
                        {formatPdfBytes(image.size)}
                        {" · "}
                        {image.format === "jpeg" ? "JPG" : "PNG"}
                      </small>
                    </span>
                    <a
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                      href={downloads.downloads[index].url}
                      download={downloads.downloads[index].filename}
                      aria-label={`Download ${image.filename}`}
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>

              <div className="pdf-result-actions">
                <Button
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                >
                  Convert another PDF
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    discardResult();
                    setError(null);
                    setStatus("ready");
                  }}
                >
                  Convert again
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "preparing" && <p>Preparing and checking your PDF…</p>}
        {status === "rendering" && <p>Rendering selected pages inside your browser…</p>}
        {status === "packaging" && <p>Packaging the images into a ZIP…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t convert this PDF.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
