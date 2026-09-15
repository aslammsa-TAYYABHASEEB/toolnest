"use client";

import { useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PdfProcessingError, toPdfProcessingError } from "@/lib/pdf/errors";
import { readPdfMetadata } from "@/lib/pdf/metadata";
import { createSearchablePdf, MAX_SEARCHABLE_PDF_SOURCE_PAGES, type SearchablePdfProgressPhase, type SearchablePdfResult } from "@/lib/pdf/searchable";
import { MAX_PDF_TOTAL_SIZE } from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";

type Status = "idle" | "preparing" | "ready" | "converting" | "success" | "error";
const pdfId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pdf-${Date.now()}`;

export function SearchablePdf() {
  const inputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [source, setSource] = useState<{ file: File; pageCount: number } | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<SearchablePdfResult | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; phase: SearchablePdfProgressPhase; part?: number } | null>(null);
  const download = usePdfDownload();
  const busy = status === "preparing" || status === "converting";

  function discardResult() { download.clear(); setResult(null); setProgress(null); }
  async function selectPdf(files: File[]) {
    const file = files[0]; if (!file || busy) return;
    discardResult(); setSource(null); setError(null); setStatus("preparing");
    try { const metadata = await readPdfMetadata(file, pdfId()); setSource({ file: metadata.file, pageCount: metadata.pageCount }); setStatus("ready"); }
    catch (caught) { setError(toPdfProcessingError(caught, "The selected PDF could not be prepared.")); setStatus("error"); }
    finally { if (inputRef.current) inputRef.current.value = ""; }
  }
  function reset() {
    controllerRef.current?.abort(); controllerRef.current = null; discardResult(); setSource(null); setError(null); setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }
  async function convert() {
    if (!source || busy) return;
    discardResult(); setError(null); setStatus("converting");
    const controller = new AbortController(); controllerRef.current = controller;
    try {
      const next = await createSearchablePdf(source.file, (current, total, phase, part) => setProgress({ current, total, phase, part }), controller.signal);
      if (controller.signal.aborted) return;
      download.replace(next.blob, next.filename); setResult(next); setStatus("success");
    } catch (caught) {
      if (controller.signal.aborted) { setError(null); setStatus("ready"); setProgress(null); }
      else { setError(toPdfProcessingError(caught, "The searchable PDF could not be created.")); setStatus("error"); }
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  }
  const progressLabel = progress?.phase === "ocr-download" ? `Preparing English OCR${progress.part !== undefined ? `… ${Math.round(progress.part * 100)}%` : "…"}`
    : progress?.phase === "ocr-orient" ? `Checking orientation · page ${progress.current} of ${progress.total}`
      : progress?.phase === "ocr" ? `Reading scanned page ${progress.current} of ${progress.total}${progress.part !== undefined ? ` · ${Math.round(progress.part * 100)}%` : ""}`
        : progress?.phase === "saving" ? "Adding the searchable text layer…"
          : progress ? `Checking page ${progress.current} of ${progress.total}…` : "Preparing…";

  return <section className="pdf-split-shell searchable-pdf-shell" aria-labelledby="searchable-pdf-title">
    <h2 className="sr-only" id="searchable-pdf-title">Make a scanned PDF searchable</h2>
    <div className="privacy-banner"><span aria-hidden="true">✓</span><strong>Your PDF is processed on your device and is not uploaded.</strong></div>
    <PdfUploader inputRef={inputRef} busy={busy} compact={Boolean(source)} multiple={false} inputId="searchable-pdf-file" heading="Drop one scanned PDF here" compactHeading="Replace PDF" buttonLabel={source ? "Choose another" : "Choose PDF"} helperText={`One PDF · English OCR · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} maximum`} onSelect={(files) => void selectPdf(files)} />
    {source && <Card className="pdf-split-panel searchable-pdf-panel">
      <div className="pdf-source-summary"><span className="pdf-file-icon is-visible" aria-hidden="true">PDF</span><span className="pdf-file-details"><strong title={source.file.name}>{source.file.name}</strong><small>{formatPdfBytes(source.file.size)} · {source.pageCount} page{source.pageCount === 1 ? "" : "s"}</small></span><Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>Replace PDF</Button></div>
      <div className="pdf-safety-note"><strong>Original appearance stays in place</strong><span>Pages with usable text are left alone. Scanned pages receive an invisible selectable English text layer without flattening the original PDF.</span></div>
      <div className="pdf-split-actions"><Button size="lg" onClick={() => void convert()} disabled={busy}>{status === "converting" ? progressLabel : result ? "Create again" : "Make PDF searchable"}</Button>{status === "converting" ? <Button variant="secondary" onClick={() => controllerRef.current?.abort()}>Cancel</Button> : <Button variant="ghost" onClick={reset}>Reset</Button>}</div>
      <small>Browser safety limit: {MAX_SEARCHABLE_PDF_SOURCE_PAGES} pages and 200 MB output.</small>
    </Card>}
    {result && download.download && <div className="pdf-split-result" role="status"><div className="pdf-result-heading"><span className="success-mark" aria-hidden="true">✓</span><div><strong>Searchable PDF is ready</strong><p>{result.pageCount} pages · {result.ocrPageCount} OCR · {result.preservedTextPageCount} already searchable{result.unreadablePageCount ? ` · ${result.unreadablePageCount} unreadable` : ""} · {formatPdfBytes(result.size)}</p></div><a className={buttonClassName()} href={download.download.url} download={download.download.filename}>Download searchable PDF</a></div><div className="pdf-result-actions"><Button variant="secondary" onClick={() => inputRef.current?.click()}>Choose another PDF</Button><Button variant="ghost" onClick={() => { discardResult(); setError(null); setStatus("ready"); }}>Create again</Button></div></div>}
    <div className="pdf-status" aria-live="polite" aria-atomic="true">{status === "preparing" && <p>Preparing and checking your PDF…</p>}{status === "converting" && <p>{progress?.phase?.startsWith("ocr") ? "On-device English OCR is reading an image-only page. OCR language data may download when needed, but your PDF is not uploaded." : "Checking which pages already contain usable searchable text…"}</p>}{error && <p className="converter-error"><strong>Couldn&apos;t create this searchable PDF.</strong> {error.message}</p>}</div>
    <div className="privacy-note"><p><strong>English OCR, local processing.</strong> The original page graphics, dimensions, and rotation are retained. An invisible text layer is added only to image-only pages. Search accuracy and text alignment depend on scan clarity, typography, and orientation.</p></div>
  </section>;
}
