"use client";

import { useMemo, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import {
  formatPageSelection,
  parsePageSelection,
} from "@/lib/pdf/page-selection";
import {
  combinePdfRotations,
  countPendingRotations,
  readPdfRotationMetadata,
  resetPendingRotations,
  rotatePdfFile,
  updatePendingRotations,
} from "@/lib/pdf/rotation";
import { renderPdfRotationThumbnails } from "@/lib/pdf/thumbnails";
import {
  MAX_PDF_ROTATE_OUTPUT_SIZE,
  MAX_PDF_ROTATE_SOURCE_PAGES,
  MAX_PDF_ROTATE_THUMBNAILS,
  MAX_PDF_TOTAL_SIZE,
  type PdfPendingRotation,
  type PdfQuarterRotation,
  type PdfRotationResult,
  type PdfRotationSource,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { usePdfThumbnails } from "@/lib/pdf/use-pdf-thumbnails";
import { formatPdfBytes } from "@/lib/pdf/validation";

type PdfRotateStatus =
  | "idle"
  | "loading"
  | "ready"
  | "rotating"
  | "success"
  | "error";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function adjustmentLabel(rotation: PdfQuarterRotation) {
  if (rotation === 0) return "None";
  if (rotation === 90) return "+90°";
  if (rotation === 180) return "180°";
  return "−90°";
}

export function PdfRotate() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfRotationSource | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [selectionExpression, setSelectionExpression] = useState("");
  const [selectionError, setSelectionError] =
    useState<PdfProcessingError | null>(null);
  const [pending, setPending] = useState<PdfPendingRotation>({});
  const [status, setStatus] = useState<PdfRotateStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfRotationResult | null>(null);
  const thumbnails = usePdfThumbnails();
  const download = usePdfDownload();
  const busy = status === "loading" || status === "rotating";
  const rotatedPageCount = countPendingRotations(pending);
  const selectedPendingCount = selectedPages.filter(
    (pageNumber) => Boolean(pending[pageNumber]),
  ).length;

  const selectedSet = useMemo(
    () => new Set(selectedPages),
    [selectedPages],
  );

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
    thumbnails.clear();
    setSource(null);
    setPending({});
    setSelectedPages([]);
    setSelectionExpression("");
    setSelectionError(null);
    setError(null);
    setStatus("loading");

    try {
      const metadata = await readPdfRotationMetadata(file, createPdfId());
      const nextThumbnails = await renderPdfRotationThumbnails(file);
      const allPages = Array.from(
        { length: metadata.pageCount },
        (_, index) => index + 1,
      );
      thumbnails.replace(nextThumbnails);
      setSource(metadata);
      setSelectedPages(allPages);
      setSelectionExpression(formatPageSelection(allPages));
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF could not be prepared for rotation.",
      ));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateExpression(value: string) {
    if (!source || busy) return;
    markChanged();
    setSelectionExpression(value);
    if (value.trim() === "") {
      setSelectedPages([]);
      setSelectionError(null);
      return;
    }
    try {
      const parsed = parsePageSelection(value, source.pageCount);
      setSelectedPages(parsed.pages);
      setSelectionError(null);
    } catch (caught) {
      setSelectionError(toPdfProcessingError(
        caught,
        "Check the selected page numbers.",
      ));
    }
  }

  function setSelection(pages: number[]) {
    if (busy) return;
    const normalized = Array.from(new Set(pages)).sort((a, b) => a - b);
    markChanged();
    setSelectedPages(normalized);
    setSelectionExpression(formatPageSelection(normalized));
    setSelectionError(null);
  }

  function togglePage(pageNumber: number) {
    setSelection(
      selectedSet.has(pageNumber)
        ? selectedPages.filter((page) => page !== pageNumber)
        : [...selectedPages, pageNumber],
    );
  }

  function rotatePages(
    pages: number[],
    adjustment: PdfQuarterRotation,
  ) {
    if (busy || pages.length === 0) return;
    markChanged();
    setPending((current) => (
      updatePendingRotations(current, pages, adjustment)
    ));
  }

  function resetPages(pages: number[]) {
    if (busy || pages.length === 0) return;
    markChanged();
    setPending((current) => resetPendingRotations(current, pages));
  }

  function clear() {
    discardResult();
    thumbnails.clear();
    setSource(null);
    setSelectedPages([]);
    setSelectionExpression("");
    setSelectionError(null);
    setPending({});
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function generate() {
    if (!source || busy) return;
    discardResult();
    setError(null);
    if (rotatedPageCount === 0) {
      setError(new PdfProcessingError(
        "rotation-no-op",
        "Rotate at least one page before creating the output PDF.",
      ));
      setStatus("error");
      return;
    }

    setStatus("rotating");
    try {
      const nextResult = await rotatePdfFile(source, pending);
      download.replace(nextResult.blob, nextResult.filename);
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The rotated PDF could not be created.",
      ));
      setStatus("error");
    }
  }

  return (
    <section className="pdf-rotate-shell" aria-labelledby="pdf-rotate-title">
      <h2 className="sr-only" id="pdf-rotate-title">Rotate PDF pages</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is rotated locally and never leaves your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-rotate-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-rotate-panel">
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

          <div className="pdf-rotate-selection">
            <div className="pdf-page-input">
              <label htmlFor="pdf-rotate-selection">Selected pages</label>
              <input
                id="pdf-rotate-selection"
                value={selectionExpression}
                onChange={(event) => updateExpression(event.target.value)}
                placeholder="For example: 1,3-5,8"
                inputMode="numeric"
                disabled={busy}
                aria-invalid={Boolean(selectionError)}
                aria-describedby="pdf-rotate-selection-help pdf-rotate-summary"
              />
              <small id="pdf-rotate-selection-help">
                Use pages and ranges. Reverse ranges are normalized, duplicates removed, and pages sorted.
              </small>
            </div>
            <div className="pdf-selection-buttons">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelection(Array.from(
                  { length: source.pageCount },
                  (_, index) => index + 1,
                ))}
                disabled={busy || selectedPages.length === source.pageCount}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelection([])}
                disabled={busy || selectedPages.length === 0}
              >
                Clear selection
              </Button>
            </div>
          </div>

          <div
            className="pdf-plan-summary"
            id="pdf-rotate-summary"
            aria-live="polite"
          >
            {selectionError ? (
              <p className="is-error">{selectionError.message}</p>
            ) : (
              <p>
                <strong>
                  {selectedPages.length} selected page{selectedPages.length === 1 ? "" : "s"}
                </strong>
                {" · "}
                {rotatedPageCount} page{rotatedPageCount === 1 ? "" : "s"} will differ from the original
              </p>
            )}
          </div>

          <div className="pdf-rotate-toolbar" aria-label="Selected page rotation controls">
            <Button
              variant="secondary"
              onClick={() => rotatePages(selectedPages, 90)}
              disabled={busy || selectedPages.length === 0 || Boolean(selectionError)}
            >
              Rotate selected clockwise
            </Button>
            <Button
              variant="secondary"
              onClick={() => rotatePages(selectedPages, 270)}
              disabled={busy || selectedPages.length === 0 || Boolean(selectionError)}
            >
              Rotate selected counter-clockwise
            </Button>
            <Button
              variant="secondary"
              onClick={() => rotatePages(selectedPages, 180)}
              disabled={busy || selectedPages.length === 0 || Boolean(selectionError)}
            >
              Rotate selected 180°
            </Button>
            <Button
              variant="ghost"
              onClick={() => resetPages(selectedPages)}
              disabled={busy || selectedPendingCount === 0 || Boolean(selectionError)}
            >
              Reset selected
            </Button>
          </div>

          <div className="pdf-thumbnail-heading">
            <div>
              <h3>Page previews</h3>
              <p>Click a page to select it. Quick actions change that page immediately.</p>
            </div>
            {source.pageCount > MAX_PDF_ROTATE_THUMBNAILS && (
              <small>
                Showing the first {MAX_PDF_ROTATE_THUMBNAILS} pages. Text selection and
                all-page rotation still work across all {source.pageCount} pages.
              </small>
            )}
          </div>

          <div className="pdf-thumbnail-grid">
            {thumbnails.previews.map((preview) => {
              const pageIndex = preview.pageNumber - 1;
              const original = source.originalRotations[pageIndex];
              const adjustment = pending[preview.pageNumber] ?? 0;
              const effective = combinePdfRotations(original, adjustment);
              const selected = selectedSet.has(preview.pageNumber);
              return (
                <article
                  key={preview.pageNumber}
                  className={`pdf-thumbnail-card${selected ? " is-selected" : ""}${adjustment ? " has-rotation" : ""}`}
                >
                  <button
                    type="button"
                    className="pdf-thumbnail-select"
                    onClick={() => togglePage(preview.pageNumber)}
                    aria-pressed={selected}
                    disabled={busy}
                    aria-label={`${selected ? "Deselect" : "Select"} page ${preview.pageNumber}`}
                  >
                    <span className="pdf-thumbnail-stage">
                      <img
                        src={preview.url}
                        alt={`Preview of page ${preview.pageNumber}`}
                        style={{ transform: `rotate(${adjustment}deg)` }}
                      />
                    </span>
                    <strong>Page {preview.pageNumber}</strong>
                    <small>
                      Original {original}° · Change {adjustmentLabel(adjustment)}
                    </small>
                    <span>Final {effective}°</span>
                  </button>
                  <div className="pdf-thumbnail-actions">
                    <button
                      type="button"
                      onClick={() => rotatePages([preview.pageNumber], 270)}
                      disabled={busy}
                      aria-label={`Rotate page ${preview.pageNumber} counter-clockwise`}
                      title="Rotate counter-clockwise"
                    >
                      ↶
                    </button>
                    <button
                      type="button"
                      onClick={() => resetPages([preview.pageNumber])}
                      disabled={busy || adjustment === 0}
                      aria-label={`Reset page ${preview.pageNumber} rotation`}
                      title="Reset to original"
                    >
                      0°
                    </button>
                    <button
                      type="button"
                      onClick={() => rotatePages([preview.pageNumber], 90)}
                      disabled={busy}
                      aria-label={`Rotate page ${preview.pageNumber} clockwise`}
                      title="Rotate clockwise"
                    >
                      ↷
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to {MAX_PDF_ROTATE_SOURCE_PAGES} pages and
              {" "}{MAX_PDF_ROTATE_THUMBNAILS} sequential thumbnails are supported.
              Output is limited to {Math.round(MAX_PDF_ROTATE_OUTPUT_SIZE / 1024 / 1024)} MB.
              The final PDF keeps vector content and uses page rotation metadata.
            </span>
          </div>

          <div className="pdf-rotate-generate">
            <div>
              <strong>
                {rotatedPageCount
                  ? `${rotatedPageCount} page${rotatedPageCount === 1 ? "" : "s"} ready to save`
                  : "No page rotations are pending"}
              </strong>
              <small>
                {rotatedPageCount
                  ? "The original file remains unchanged."
                  : "Rotate at least one page to create a new PDF."}
              </small>
            </div>
            <Button
              size="lg"
              onClick={() => void generate()}
              disabled={busy || rotatedPageCount === 0}
            >
              {status === "rotating" ? "Creating rotated PDF…" : "Create rotated PDF"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          </div>

          {result && download.download && (
            <div className="pdf-merge-result pdf-rotate-result" role="status">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Rotated PDF is ready</strong>
                <p title={result.filename}>{result.filename}</p>
                <small>
                  {formatPdfBytes(result.size)}
                  {" · "}
                  {result.pageCount} page{result.pageCount === 1 ? "" : "s"}
                  {" · "}
                  {result.rotatedPageCount} rotated
                </small>
              </div>
              <a
                className={buttonClassName()}
                href={download.download.url}
                download={download.download.filename}
              >
                Download PDF
              </a>
              <div className="pdf-result-actions">
                <Button
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose another PDF
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    discardResult();
                    setError(null);
                    setStatus("ready");
                  }}
                >
                  Rotate again
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>Loading the PDF and preparing compact page previews…</p>}
        {status === "rotating" && <p>Applying page rotations and saving locally…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t rotate this PDF.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
