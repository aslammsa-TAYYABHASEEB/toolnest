"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { convertImage, formatBytes, readImageMetadata } from "@/lib/image/process-image";
import { IMAGE_FORMATS, MAX_IMAGE_FILE_SIZE, type ConvertedImage, type ImageFormat, type ImageMetadata } from "@/lib/image/types";

type Status = "idle" | "loading" | "ready" | "processing" | "success" | "error";

export function ImageConverter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertedImage | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(90);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const busy = status === "loading" || status === "processing";

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  function discardResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResult(null);
    setResultUrl(null);
  }

  function reset(openPicker = false) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    discardResult();
    setPreviewUrl(null);
    setMetadata(null);
    setError(null);
    setStatus("idle");
    setOutputFormat("webp");
    setQuality(90);
    if (inputRef.current) inputRef.current.value = "";
    if (openPicker) window.setTimeout(() => inputRef.current?.click(), 0);
  }

  async function selectFile(file?: File) {
    if (!file || busy) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    discardResult();
    setPreviewUrl(null);
    setMetadata(null);
    setError(null);
    setStatus("loading");

    try {
      const nextMetadata = await readImageMetadata(file);
      setMetadata(nextMetadata);
      setPreviewUrl(URL.createObjectURL(file));
      setOutputFormat(nextMetadata.format === "webp" ? "jpeg" : "webp");
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This image could not be opened.");
      setStatus("error");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    void selectFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    void selectFile(event.dataTransfer.files?.[0]);
  }

  async function handleConvert() {
    if (!metadata || busy) return;
    discardResult();
    setError(null);
    setStatus("processing");
    try {
      const converted = await convertImage({ file: metadata.file, format: outputFormat, quality: quality / 100 });
      setResult(converted);
      setResultUrl(URL.createObjectURL(converted.blob));
      setStatus("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be converted.");
      setStatus("error");
    }
  }

  return (
    <section className="converter-shell" aria-labelledby="converter-title">
      <h2 className="sr-only" id="converter-title">Convert your image</h2>
      <div className="privacy-banner"><span aria-hidden="true">✓</span><strong>Your image is processed locally and never leaves your device.</strong></div>
      <input ref={inputRef} className="sr-only" id="image-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handleInput} disabled={busy} />

      {!metadata ? (
        <label
          className={`converter-dropzone${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
          htmlFor="image-file"
          tabIndex={busy ? -1 : 0}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
          onDrop={handleDrop}
        >
          <span className="converter-upload-icon" aria-hidden="true">↑</span>
          <span className="converter-drop-title">{status === "loading" ? "Checking your image…" : "Drop an image here"}</span>
          <span>or choose one from your device</span>
          <span className={buttonClassName({ size: "lg" })} aria-hidden="true">Select image</span>
          <small>JPG, JPEG, PNG, or WebP · Maximum {formatBytes(MAX_IMAGE_FILE_SIZE)}</small>
        </label>
      ) : (
        <div className="converter-workspace">
          <Card className="image-preview-card">
            <div className="image-preview-frame"><img src={previewUrl ?? ""} alt={`Preview of ${metadata.file.name}`} /></div>
            <dl className="file-facts">
              <div><dt>Filename</dt><dd title={metadata.file.name}>{metadata.file.name}</dd></div>
              <div><dt>Format</dt><dd>{IMAGE_FORMATS[metadata.format].label}</dd></div>
              <div><dt>Dimensions</dt><dd>{metadata.width} × {metadata.height} px</dd></div>
              <div><dt>File size</dt><dd>{formatBytes(metadata.file.size)}</dd></div>
            </dl>
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>Replace image</Button>
          </Card>

          <Card className="converter-controls">
            <fieldset disabled={busy}>
              <legend>Output format</legend>
              <div className="format-options">
                {(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((format) => (
                  <label key={format} className={outputFormat === format ? "is-selected" : ""}>
                    <input type="radio" name="format" value={format} checked={outputFormat === format} onChange={() => { setOutputFormat(format); discardResult(); setStatus("ready"); }} />
                    <span>{IMAGE_FORMATS[format].label}</span>
                  </label>
                ))}
              </div>

              {IMAGE_FORMATS[outputFormat].supportsQuality && (
                <div className="quality-control">
                  <div><label htmlFor="quality">Quality</label><output htmlFor="quality">{quality}%</output></div>
                  <input id="quality" type="range" min="10" max="100" step="5" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); discardResult(); setStatus("ready"); }} />
                  <p>Higher quality usually creates a larger file.</p>
                </div>
              )}
            </fieldset>

            <Button size="lg" onClick={() => void handleConvert()} disabled={busy}>{status === "processing" ? "Converting…" : `Convert to ${IMAGE_FORMATS[outputFormat].label}`}</Button>

            {result && resultUrl && (
              <div className="conversion-result" role="status">
                <span className="success-mark" aria-hidden="true">✓</span>
                <div><strong>Conversion complete</strong><p>{IMAGE_FORMATS[result.format].label} · {formatBytes(result.blob.size)}</p></div>
                <a className={buttonClassName({ variant: "secondary" })} href={resultUrl} download={result.filename}>Download</a>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {error && <p className="converter-error"><strong>Couldn’t process that image.</strong> {error}</p>}
      </div>

      {(metadata || error) && (
        <div className="converter-reset-actions">
          {metadata && <Button variant="secondary" onClick={() => reset(true)} disabled={busy}>Convert another image</Button>}
          <Button variant="ghost" onClick={() => reset()} disabled={busy}>Clear</Button>
        </div>
      )}
    </section>
  );
}
