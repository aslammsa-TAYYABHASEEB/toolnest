"use client";

import { useRef, useState } from "react";
import { readPdfMetadata } from "@/lib/pdf/metadata";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PdfProcessingError,
  toPdfProcessingError,
} from "@/lib/pdf/errors";
import { makeWordFilename } from "@/lib/pdf/filenames";
import { convertPdfToWord } from "@/lib/pdf/to-word";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import {
  MAX_PDF_TOTAL_SIZE,
  type WordConversionResult,
} from "@/lib/pdf/types";
import { formatPdfBytes } from "@/lib/pdf/validation";

type PdfToWordStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "converting"
  | "success"
  | "error";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PdfToWord() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ file: File; pageCount: number } | null>(null);
  const [status, setStatus] = useState<PdfToWordStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<WordConversionResult | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    phase: "extracting" | "ocr" | "ocr-download" | "ocr-orient";
    subProgress: number | null;
  } | null>(null);
  const download = usePdfDownload();
  const busy = status === "preparing" || status === "converting";

  function discardResult() {
    download.clear();
    setResult(null);
    setProgress(null);
  }

  async function selectPdf(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    discardResult();
    setSource(null);
    setError(null);
    setStatus("preparing");

    try {
      const metadata = await readPdfMetadata(file, createPdfId());
      setSource({ file: metadata.file, pageCount: metadata.pageCount });
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
    setError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function convert() {
    if (!source || busy) return;
    discardResult();
    setError(null);
    setStatus("converting");

    try {
      const nextResult = await convertPdfToWord(
        source.file,
        (current, total, phase, subProgress) => {
          setProgress({
            current,
            total,
            phase: phase ?? "extracting",
            subProgress: typeof subProgress === "number" ? subProgress : null,
          });
        },
      );
      download.replace(nextResult.blob, makeWordFilename(source.file.name));
      setResult({
        ...nextResult,
        filename: makeWordFilename(source.file.name),
        size: nextResult.blob.size,
      });
      setStatus("success");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDF could not be converted to Word.",
      ));
      setStatus("error");
    }
  }

  const canConvert = Boolean(source && !busy);

  return (
    <section className="pdf-split-shell pdf-to-word-shell" aria-labelledby="pdf-to-word-title">
      <h2 className="sr-only" id="pdf-to-word-title">Convert PDF to Word</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDF is converted locally and never leaves your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={Boolean(source)}
        multiple={false}
        inputId="pdf-to-word-file"
        heading="Drop one PDF here"
        compactHeading="Replace PDF"
        buttonLabel={source ? "Choose another" : "Choose PDF"}
        helperText={`One PDF · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`}
        onSelect={(files) => void selectPdf(files)}
      />

      {source && (
        <Card className="pdf-split-panel pdf-to-word-panel">
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

          <div className="pdf-plan-summary" id="pdf-to-word-plan" aria-live="polite">
            <p>
              <strong>Word document</strong>
              {" · "}
              {source.pageCount} page{source.pageCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="pdf-safety-note">
            <strong>Browser safety limits</strong>
            <span>
              Up to 300 source pages and 50 MB output. Very long documents may
              exceed browser memory limits.
            </span>
          </div>

          <div className="pdf-split-actions">
            <Button size="lg" onClick={() => void convert()} disabled={!canConvert}>
              {status === "converting"
                ? progress
                  ? progress.phase === "ocr-download"
                    ? progress.subProgress !== null
                      ? `Downloading OCR engine (one-time)… ${Math.round(progress.subProgress * 100)}%`
                      : "Downloading OCR engine (one-time)…"
                    : progress.phase === "ocr"
                      ? progress.subProgress !== null
                        ? `Running on-device OCR… page ${progress.current} of ${progress.total} (${Math.round(progress.subProgress * 100)}%)`
                        : `Running on-device OCR… page ${progress.current} of ${progress.total}`
                      : progress.phase === "ocr-orient"
                        ? `Detecting page orientation… page ${progress.current} of ${progress.total}`
                        : `Converting… page ${progress.current} of ${progress.total}`
                  : "Converting…"
                : result
                  ? "Convert again"
                  : "Convert to Word"}
            </Button>
            <Button variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      {result && download.download && (
        <div className="pdf-split-result" role="status">
          <div className="pdf-result-heading">
            <span className="success-mark" aria-hidden="true">✓</span>
            <div>
              <strong>Word document is ready</strong>
              <p>
                {result.pageCount} page{result.pageCount === 1 ? "" : "s"}
                {" · "}
                {formatPdfBytes(result.size)}
              </p>
            </div>
            <a
              className={buttonClassName()}
              href={download.download.url}
              download={download.download.filename}
            >
              Download .docx
            </a>
          </div>

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

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "preparing" && <p>Preparing and checking your PDF…</p>}
        {status === "converting" && (
          <p>
            {progress?.phase === "ocr" ||
              progress?.phase === "ocr-download" ||
              progress?.phase === "ocr-orient"
              ? "Some pages have no selectable text, so text is being recognized on-device with OCR — nothing is uploaded."
              : "Converting PDF text to a Word document…"}
          </p>
        )}
        {error && (
          <p className="converter-error">
            <strong>Couldn't convert this PDF.</strong> {error.message}
          </p>
        )}
      </div>

      <div className="privacy-note">
        <p>
          <strong>Honest about scope.</strong> This tool extracts text from your
          PDF and builds a Word (.docx) document from it. It works best for
          text-heavy PDFs. Complex layouts, tables, images, and formatting are
          not preserved — what you get is the extracted text in paragraphs, not a
          pixel-perfect copy of the original page.
        </p>
      </div>
    </section>
  );
}