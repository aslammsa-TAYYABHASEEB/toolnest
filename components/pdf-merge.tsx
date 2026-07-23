"use client";

import {
  useRef,
  useState,
  type DragEvent,
} from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  toPdfProcessingError,
  type PdfProcessingError,
} from "@/lib/pdf/errors";
import { mergePdfFiles } from "@/lib/pdf/merge";
import { readPdfMetadata } from "@/lib/pdf/metadata";
import {
  MIN_PDFS_TO_MERGE,
  type MergedPdf,
  type PdfFileMetadata,
  type PdfMergeStatus,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import {
  formatPdfBytes,
  getPdfTotalSize,
  validatePdfTotalSize,
} from "@/lib/pdf/validation";

function createPdfId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PdfMerge() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PdfFileMetadata[]>([]);
  const [status, setStatus] = useState<PdfMergeStatus>("idle");
  const [error, setError] = useState<PdfProcessingError | null>(null);
  const [result, setResult] = useState<MergedPdf | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const download = usePdfDownload();
  const busy = status === "preparing" || status === "merging";
  const totalSize = getPdfTotalSize(files);
  const totalPages = files.reduce((sum, item) => sum + item.pageCount, 0);

  async function addFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0 || busy) return;
    download.clear();
    setResult(null);
    setError(null);
    setStatus("preparing");

    try {
      validatePdfTotalSize([...files, ...selectedFiles]);
      const prepared: PdfFileMetadata[] = [];
      for (const file of selectedFiles) {
        prepared.push(await readPdfMetadata(file, createPdfId()));
      }
      setFiles((current) => [...current, ...prepared]);
      setStatus("ready-to-merge");
    } catch (caught) {
      setError(toPdfProcessingError(
        caught,
        "The selected PDFs could not be prepared.",
      ));
      setStatus("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateFiles(nextFiles: PdfFileMetadata[]) {
    download.clear();
    setFiles(nextFiles);
    setResult(null);
    setError(null);
    setStatus(nextFiles.length > 0 ? "ready-to-merge" : "idle");
  }

  function removeFile(id: string) {
    updateFiles(files.filter((item) => item.id !== id));
  }

  function moveFile(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= files.length || fromIndex === toIndex) return;
    const next = [...files];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateFiles(next);
  }

  function handleReorderDrop(
    event: DragEvent<HTMLLIElement>,
    targetId: string,
  ) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
    setDraggedId(null);
    if (!sourceId || sourceId === targetId) return;
    const fromIndex = files.findIndex((item) => item.id === sourceId);
    const toIndex = files.findIndex((item) => item.id === targetId);
    if (fromIndex !== -1 && toIndex !== -1) moveFile(fromIndex, toIndex);
  }

  function clearAll() {
    download.clear();
    setFiles([]);
    setResult(null);
    setError(null);
    setDraggedId(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleMerge() {
    if (busy || files.length < MIN_PDFS_TO_MERGE) return;
    download.clear();
    setResult(null);
    setError(null);
    setStatus("preparing");

    try {
      const merged = await mergePdfFiles({
        files,
        onMerging: () => setStatus("merging"),
      });
      setResult(merged);
      download.replace(merged.blob, merged.filename);
      setStatus("ready");
    } catch (caught) {
      setError(toPdfProcessingError(caught, "The PDFs could not be merged."));
      setStatus("error");
    }
  }

  return (
    <section className="pdf-merge-shell" aria-labelledby="pdf-merge-title">
      <h2 className="sr-only" id="pdf-merge-title">Merge PDF files</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your PDFs are merged locally and never leave your device.</strong>
      </div>

      <PdfUploader
        inputRef={inputRef}
        busy={busy}
        compact={files.length > 0}
        onSelect={(selected) => void addFiles(selected)}
      />

      {files.length > 0 && (
        <Card className="pdf-file-panel">
          <div className="pdf-file-panel-heading">
            <div>
              <span className="kicker">Merge order</span>
              <h3>{files.length} PDF{files.length === 1 ? "" : "s"} selected</h3>
            </div>
            <div className="pdf-total-summary">
              <strong>{totalPages} page{totalPages === 1 ? "" : "s"}</strong>
              <span>{formatPdfBytes(totalSize)} total</span>
            </div>
          </div>

          <p className="pdf-reorder-help" id="pdf-reorder-help">
            Drag files into order, or use the arrow buttons for keyboard-friendly reordering.
          </p>

          <ol className="pdf-file-list" aria-describedby="pdf-reorder-help">
            {files.map((item, index) => (
              <li
                key={item.id}
                className={draggedId === item.id ? "is-dragging" : ""}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleReorderDrop(event, item.id)}
              >
                <span
                  className="pdf-drag-handle"
                  draggable={!busy}
                  aria-label={`Drag ${item.file.name} to reorder`}
                  aria-disabled={busy}
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    setDraggedId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                >
                  <span aria-hidden="true">⋮⋮</span>
                </span>
                <span className="pdf-order-number" aria-label={`Order ${index + 1}`}>
                  {index + 1}
                </span>
                <span className="pdf-file-icon" aria-hidden="true">PDF</span>
                <span className="pdf-file-details">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>
                    {formatPdfBytes(item.file.size)}
                    {" · "}
                    {item.pageCount} page{item.pageCount === 1 ? "" : "s"}
                  </small>
                </span>
                <span className="pdf-reorder-buttons">
                  <button
                    type="button"
                    onClick={() => moveFile(index, index - 1)}
                    disabled={busy || index === 0}
                    aria-label={`Move ${item.file.name} up`}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFile(index, index + 1)}
                    disabled={busy || index === files.length - 1}
                    aria-label={`Move ${item.file.name} down`}
                    title="Move down"
                  >
                    ↓
                  </button>
                </span>
                <button
                  className="pdf-remove-button"
                  type="button"
                  onClick={() => removeFile(item.id)}
                  disabled={busy}
                  aria-label={`Remove ${item.file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>

          <div className="pdf-merge-actions">
            <Button
              size="lg"
              onClick={() => void handleMerge()}
              disabled={busy || files.length < MIN_PDFS_TO_MERGE}
            >
              {status === "preparing"
                ? "Preparing…"
                : status === "merging"
                  ? "Merging…"
                  : result
                    ? "Merge again"
                    : "Merge PDFs"}
            </Button>
            <Button variant="ghost" onClick={clearAll} disabled={busy}>
              Clear all
            </Button>
          </div>

          {files.length < MIN_PDFS_TO_MERGE && !error && (
            <p className="pdf-minimum-note">
              Add at least one more PDF to enable merging.
            </p>
          )}

          {result && download.download && (
            <div className="pdf-merge-result" role="status">
              <span className="success-mark" aria-hidden="true">✓</span>
              <div>
                <strong>Ready to download</strong>
                <p>{result.filename}</p>
                <small>
                  {formatPdfBytes(result.size)}
                  {" · "}
                  {result.pageCount} page{result.pageCount === 1 ? "" : "s"}
                </small>
              </div>
              <a
                className={buttonClassName()}
                href={download.download.url}
                download={download.download.filename}
              >
                Download merged PDF
              </a>
            </div>
          )}
        </Card>
      )}

      <div className="pdf-status" aria-live="polite" aria-atomic="true">
        {status === "preparing" && <p>Preparing your PDF files…</p>}
        {status === "merging" && <p>Merging pages in your selected order…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t process those PDFs.</strong> {error.message}
          </p>
        )}
      </div>
    </section>
  );
}
