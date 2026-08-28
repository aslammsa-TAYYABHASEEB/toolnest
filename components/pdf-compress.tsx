"use client";

import { useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import { compressPdfFile } from "@/lib/pdf/compress";
import { readPdfMetadata } from "@/lib/pdf/metadata";
import {
  MAX_PDF_COMPRESS_OUTPUT_SIZE,
  MAX_PDF_COMPRESS_RASTER_PAGES,
  MAX_PDF_COMPRESS_SOURCE_PAGES,
  MAX_PDF_TOTAL_SIZE,
  type CompressedPdf,
  type CompressionLevel,
  type PdfFileMetadata,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";

type PdfCompressStatus =
  | "idle"
  | "loading"
  | "ready"
  | "compressing"
  | "success"
  | "error";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const COMPRESS_LEVELS: Array<{
  value: CompressionLevel;
  label: string;
  description: string;
}> = [
  {
    value: "light",
    label: "Structure optimization",
    description: "Re-saves the PDF with compressed object streams and streams. No image re-encoding, so text and vector graphics stay lossless. Best for text-heavy documents.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Re-renders pages to JPG at 1.5× scale with 80% quality. Good reduction for scanned documents and image-heavy PDFs.",
  },
  {
    value: "strong",
    label: "Strong",
    description: "Re-renders pages to JPG at 1× scale with 60% quality. Maximum reduction, but image quality is lower.",
  },
];

function levelPlanLabel(level: CompressionLevel) {
  if (level === "light") return "Lossless structure optimization";
  if (level === "balanced") return "1.5× JPG · 80% quality";
  return "1× JPG · 60% quality";
}

export function PdfCompress() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<PdfFileMetadata | null>(null);
  const [level, setLevel] = useState<CompressionLevel>("balanced");
  const [status, setStatus] = useState<PdfCompressStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<CompressedPdf | null>(null);
  const [progress, setProgress] = useState<{
    page: number;
    total: number;
  } | null>(null);
  const download = usePdfDownload();
  const busy = status === "loading" || status === "compressing";

  function discardResult() {
    download.clear();
    setResult(null);
    setProgress(null);
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
    setLevel("balanced");
    setError(null);
    setStatus("loading");

    try {
      const metadata = await readPdfMetadata(file, createPdfId());
      setSource(metadata);
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF could not be prepared for compression.",
      ));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clear() {
    discardResult();
    setSource(null);
    setLevel("balanced");
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function compress() {
    if (!source || busy) return;
    discardResult();
    setError(null);
    setStatus("compressing");

    try {
      const nextResult = await compressPdfFile({
        file: source.file,
        level,
        onProgress: (page, total) => setProgress({ page, total }),
      });
      download.replace(nextResult.blob, nextResult.filename);
      setResult(nextResult);
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The PDF could not be compressed.",
      ));
      setStatus("error");
    }
  }

  return (
    <section
      className="pdf-split-shell pdf-compress-shell"
      aria-labelledby="pdf-compress-title"
    >
      <h2 className="sr-only" id="pdf-compress-title">Compress PDF</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is compressed locally and never leaves your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-compress-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-split-panel pdf-compress-panel">
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
            <legend>Compression level</legend>
            {COMPRESS_LEVELS.map((option) => (
              <label
                key={option.value}
                className={level === option.value ? "is-selected" : ""}
              >
                <input
                  type="radio"
                  name="pdf-compress-level"
                  value={option.value}
                  checked={level === option.value}
                  onChange={() => {
                    markChanged();
                    setLevel(option.value);
                  }}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div
            className="pdf-plan-summary"
            id="pdf-compress-plan"
            aria-live="polite"
          >
            <p>
              <strong>
                {level === "light"
                  ? "Structure optimization"
                  : level === "balanced"
                    ? "Balanced"
                    : "Strong"}
              </strong>
              {" · "}
              {levelPlanLabel(level)}
            </p>
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to {MAX_PDF_COMPRESS_SOURCE_PAGES.toLocaleString()} pages for
              structure optimization,
              {" "}{MAX_PDF_COMPRESS_RASTER_PAGES} pages for image re-encoding,
              and {Math.round(MAX_PDF_COMPRESS_OUTPUT_SIZE / 1024 / 1024)} MB
              output. Image re-encoding needs more memory and is limited to
              fewer pages.
            </span>
          </div>

          <div className="pdf-split-actions">
            <Button
              size="lg"
              onClick={() => void compress()}
              disabled={busy}
            >
              {status === "compressing"
                ? progress
                  ? `Compressing… page ${progress.page} of ${progress.total}`
                  : "Compressing…"
                : result
                  ? "Compress again"
                  : "Compress PDF"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          </div>

          {result && download.download && (
            <div
              className={`compression-result ${result.hasSavings ? "is-success" : "is-no-savings"}`}
              role="status"
            >
              <span className="success-mark" aria-hidden="true">
                {result.hasSavings ? "✓" : "i"}
              </span>
              <div>
                <strong>
                  {result.hasSavings
                    ? "PDF compressed"
                    : "No useful reduction achieved"}
                </strong>
                <p>
                  {result.hasSavings
                    ? `Saved ${formatPdfBytes(result.savedBytes)} (${result.savedPercentage.toFixed(1)}%)`
                    : `The compressed PDF is ${formatPdfBytes(result.size - result.originalSize)} larger. Your original remains the better choice.`}
                </p>
              </div>
              <a
                className={buttonClassName({
                  variant: result.hasSavings ? "primary" : "secondary",
                  size: "sm",
                })}
                href={download.download.url}
                download={download.download.filename}
              >
                {result.hasSavings ? "Download compressed" : "Download result anyway"}
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
                  Compress again
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && (
          <p>Loading the PDF and checking its structure…</p>
        )}
        {status === "compressing" && (
          <p>
            {level === "light"
              ? "Re-saving the PDF with structure optimization…"
              : `Rendering and compressing page ${progress?.page ?? 0} of ${progress?.total ?? 0}…`}
          </p>
        )}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t compress this PDF.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
