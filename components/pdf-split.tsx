"use client";

import { useMemo, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import { makeSplitZipFilename } from "@/lib/pdf/filenames";
import { readSplittablePdfMetadata } from "@/lib/pdf/metadata";
import {
  createEveryPageGroups,
  parsePageRanges,
  parsePageSelection,
} from "@/lib/pdf/page-selection";
import { splitPdfFile } from "@/lib/pdf/split";
import {
  MAX_PDF_SPLIT_OUTPUT_FILES,
  MAX_PDF_SPLIT_SOURCE_PAGES,
  MAX_PDF_SPLIT_WORK_PAGES,
  MAX_PDF_TOTAL_SIZE,
  type PdfFileMetadata,
  type PdfPageGroup,
  type PdfSplitMode,
  type PdfSplitResult,
  type PdfSplitStatus,
} from "@/lib/pdf/types";
import { usePdfDownloads } from "@/lib/pdf/use-pdf-downloads";
import {
  formatPdfBytes,
  validatePdfTotalSize,
} from "@/lib/pdf/validation";
import { createPdfZip } from "@/lib/pdf/zip";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPagePlan(
  mode: PdfSplitMode,
  pageCount: number,
  selection: string,
  ranges: string,
): PdfPageGroup[] {
  if (mode === "every-page") return createEveryPageGroups(pageCount);
  if (mode === "ranges") return parsePageRanges(ranges, pageCount);
  return [parsePageSelection(selection, pageCount)];
}

export function PdfSplit() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfFileMetadata | null>(null);
  const [mode, setMode] = useState<PdfSplitMode>("extract");
  const [selection, setSelection] = useState("");
  const [ranges, setRanges] = useState("");
  const [status, setStatus] = useState<PdfSplitStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<PdfSplitResult | null>(null);
  const downloads = usePdfDownloads();
  const busy = status === "loading" || status === "splitting";

  const plan = useMemo(() => {
    if (!source) return { groups: null, error: null };
    if (mode === "extract" && selection.trim() === "") {
      return { groups: null, error: null };
    }
    if (mode === "ranges" && ranges.trim() === "") {
      return { groups: null, error: null };
    }
    try {
      return {
        groups: getPagePlan(mode, source.pageCount, selection, ranges),
        error: null,
      };
    } catch (caught) {
      return {
        groups: null,
        error: toPdfProcessingError(caught, "Check the page selection."),
      };
    }
  }, [mode, ranges, selection, source]);

  function discardResult() {
    downloads.clear();
    setResult(null);
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    discardResult();
    setSource(null);
    setSelection("");
    setRanges("");
    setError(null);
    setStatus("loading");

    try {
      validatePdfTotalSize([file]);
      const metadata = await readSplittablePdfMetadata(file, createPdfId());
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

  function changeMode(nextMode: PdfSplitMode) {
    if (busy) return;
    discardResult();
    setMode(nextMode);
    setError(null);
    setStatus(source ? "ready" : "idle");
  }

  function clear() {
    discardResult();
    setSource(null);
    setMode("extract");
    setSelection("");
    setRanges("");
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSplit() {
    if (!source || busy) return;
    discardResult();
    setError(null);

    let groups: PdfPageGroup[];
    try {
      groups = getPagePlan(mode, source.pageCount, selection, ranges);
    } catch (caught) {
      setError(toPdfProcessingError(caught, "Check the page selection."));
      setStatus("error");
      return;
    }

    setStatus("splitting");
    try {
      const nextResult = await splitPdfFile(source.file, mode, groups);
      const needsZip = mode === "every-page" || nextResult.files.length > 1;
      const zipBlob = needsZip ? await createPdfZip(nextResult.files) : null;
      downloads.replace(
        nextResult.files,
        zipBlob
          ? {
              blob: zipBlob,
              filename: makeSplitZipFilename(source.file.name),
            }
          : undefined,
      );
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The PDF could not be split."));
      setStatus("error");
    }
  }

  const canSplit = Boolean(source && plan.groups && !plan.error && !busy);
  const planPages = plan.groups?.reduce(
    (total, group) => total + group.pages.length,
    0,
  ) ?? 0;

  return (
    <section className="pdf-split-shell" aria-labelledby="pdf-split-title">
      <h2 className="sr-only" id="pdf-split-title">Split a PDF</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is split locally and never leaves your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-split-file"
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
            <legend>How should this PDF be split?</legend>
            {([
              ["extract", "Extract selected pages", "Combine chosen pages into one new PDF."],
              ["every-page", "Split every page", "Create one PDF for each page and a ZIP download."],
              ["ranges", "Split by ranges", "Create one PDF for each non-overlapping range."],
            ] as const).map(([value, label, description]) => (
              <label
                key={value}
                className={mode === value ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="pdf-split-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => changeMode(value)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "extract" && (
            <div className="pdf-page-input">
              <label htmlFor="pdf-page-selection">Pages to extract</label>
              <input
                id="pdf-page-selection"
                value={selection}
                onChange={(event) => {
                  discardResult();
                  setSelection(event.target.value);
                  setError(null);
                  setStatus("ready");
                }}
                placeholder="For example: 1,3-5,8"
                inputMode="numeric"
                disabled={busy}
                aria-describedby="pdf-page-selection-help pdf-plan-summary"
                aria-invalid={Boolean(plan.error)}
              />
              <small id="pdf-page-selection-help">
                Use commas and ranges. Reverse ranges are normalized; repeated pages are included once in document order.
              </small>
            </div>
          )}

          {mode === "ranges" && (
            <div className="pdf-page-input">
              <label htmlFor="pdf-page-ranges">Output ranges</label>
              <input
                id="pdf-page-ranges"
                value={ranges}
                onChange={(event) => {
                  discardResult();
                  setRanges(event.target.value);
                  setError(null);
                  setStatus("ready");
                }}
                placeholder="For example: 1-3,4-6,7-10"
                inputMode="numeric"
                disabled={busy}
                aria-describedby="pdf-page-ranges-help pdf-plan-summary"
                aria-invalid={Boolean(plan.error)}
              />
              <small id="pdf-page-ranges-help">
                Each comma-separated range becomes one PDF. Ranges cannot overlap.
              </small>
            </div>
          )}

          <div className="pdf-plan-summary" id="pdf-plan-summary" aria-live="polite">
            {plan.error ? (
              <p className="is-error">{plan.error.message}</p>
            ) : plan.groups ? (
              <>
                <strong>
                  {plan.groups.length} output file{plan.groups.length === 1 ? "" : "s"}
                  {" · "}
                  {planPages} page{planPages === 1 ? "" : "s"}
                </strong>
                {mode !== "every-page" && (
                  <ul>
                    {plan.groups.map((group, index) => (
                      <li key={`${group.filenameLabel}-${index}`}>{group.summary}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>
                {mode === "every-page"
                  ? `${source.pageCount} one-page PDFs will be created.`
                  : "Enter pages to preview the output."}
              </p>
            )}
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to {MAX_PDF_SPLIT_SOURCE_PAGES.toLocaleString()} source pages,
              {" "}{MAX_PDF_SPLIT_OUTPUT_FILES} output files, and
              {" "}{MAX_PDF_SPLIT_WORK_PAGES} copied pages per operation. These
              limits reduce the chance of exhausting device memory.
            </span>
          </div>

          <div className="pdf-split-actions">
            <Button
              size="lg"
              onClick={() => void handleSplit()}
              disabled={!canSplit}
            >
              {status === "splitting"
                ? "Splitting…"
                : result
                  ? "Split again"
                  : "Split PDF"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          </div>

          {result && downloads.downloads.length === result.files.length && (
            <div className="pdf-split-result" role="status">
              <div className="pdf-result-heading">
                <span className="success-mark" aria-hidden="true">✓</span>
                <div>
                  <strong>Split PDFs are ready</strong>
                  <p>
                    {result.files.length} file{result.files.length === 1 ? "" : "s"}
                    {" · "}
                    {result.pageCount} page{result.pageCount === 1 ? "" : "s"}
                    {" · "}
                    {formatPdfBytes(result.totalSize)}
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

              <ul className="pdf-result-list">
                {result.files.map((file, index) => (
                  <li key={file.filename}>
                    <span>
                      <strong title={file.filename}>{file.filename}</strong>
                      <small>
                        {formatPdfBytes(file.size)}
                        {" · "}
                        {file.pageCount} page{file.pageCount === 1 ? "" : "s"}
                      </small>
                    </span>
                    <a
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                      href={downloads.downloads[index].url}
                      download={downloads.downloads[index].filename}
                      aria-label={`Download ${file.filename}`}
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
                  Split again
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>Loading and checking your PDF…</p>}
        {status === "splitting" && <p>Splitting pages inside your browser…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t split this PDF.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
