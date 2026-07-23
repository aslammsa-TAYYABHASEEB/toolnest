"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { compressImage, formatBytes, readImageMetadata } from "@/lib/image/process-image";
import { IMAGE_FORMATS, MAX_IMAGE_FILE_SIZE, type CompressedImage, type ImageMetadata } from "@/lib/image/types";

type Status = "idle" | "loading" | "ready" | "processing" | "success" | "no-savings" | "error";

export function ImageCompressor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<CompressedImage | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState(75);
  const [resultQuality, setResultQuality] = useState<number | null>(null);
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
    setResultQuality(null);
  }

  function reset(openPicker = false) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    discardResult();
    setPreviewUrl(null);
    setMetadata(null);
    setQuality(75);
    setError(null);
    setStatus("idle");
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
      setQuality(75);
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

  async function handleCompress() {
    if (!metadata || busy) return;
    discardResult();
    setError(null);
    setStatus("processing");

    try {
      const compressed = await compressImage({
        file: metadata.file,
        format: metadata.format,
        quality: quality / 100,
      });
      setResult(compressed);
      setResultUrl(URL.createObjectURL(compressed.blob));
      setResultQuality(metadata.format === "png" ? null : quality);
      setStatus(compressed.hasSavings ? "success" : "no-savings");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be compressed.");
      setStatus("error");
    }
  }

  const outputLabel = metadata ? IMAGE_FORMATS[metadata.format].label : "";
  const resultIsCurrentQuality = metadata?.format === "png" || resultQuality === quality;

  return (
    <section className="converter-shell compressor-shell" aria-labelledby="compressor-title">
      <h2 className="sr-only" id="compressor-title">Compress your image</h2>
      <div className="privacy-banner"><span aria-hidden="true">✓</span><strong>Your image is compressed locally and never leaves your device.</strong></div>
      <input ref={inputRef} className="sr-only" id="compressor-image-file" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={handleInput} disabled={busy} />

      {!metadata ? (
        <label
          className={`converter-dropzone${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
          htmlFor="compressor-image-file"
          tabIndex={busy ? -1 : 0}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false); }}
          onDrop={handleDrop}
        >
          <span className="converter-upload-icon" aria-hidden="true">↓</span>
          <span className="converter-drop-title">{status === "loading" ? "Checking your image…" : "Drop an image here"}</span>
          <span>or choose one from your device</span>
          <span className={buttonClassName({ size: "lg" })} aria-hidden="true">Select image</span>
          <small>JPG, JPEG, PNG, or WebP · Maximum {formatBytes(MAX_IMAGE_FILE_SIZE)}</small>
        </label>
      ) : (
        <div className="converter-workspace compressor-workspace">
          <Card className="image-preview-card">
            <div className="image-preview-frame"><img src={previewUrl ?? ""} alt={`Preview of ${metadata.file.name}`} /></div>
            <dl className="file-facts">
              <div><dt>Filename</dt><dd title={metadata.file.name}>{metadata.file.name}</dd></div>
              <div><dt>Format</dt><dd>{IMAGE_FORMATS[metadata.format].label}</dd></div>
              <div><dt>Dimensions</dt><dd>{metadata.width} × {metadata.height} px</dd></div>
              <div><dt>Original size</dt><dd>{formatBytes(metadata.file.size)}</dd></div>
            </dl>
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>Replace image</Button>
          </Card>

          <Card className="converter-controls compressor-controls">
            {metadata.format === "png" ? (
              <div className="png-limit-note">
                <span className="ui-badge ui-badge-warning">Lossless PNG</span>
                <h3>PNG quality cannot be tuned reliably</h3>
                <p>ToolNest will try a lossless browser re-encode. It may save little or nothing. For stronger compression, use Image Converter to make a WebP copy.</p>
                <a href="/tools/image-converter">Open Image Converter <span aria-hidden="true">→</span></a>
              </div>
            ) : (
              <div className="quality-control compressor-quality">
                <div><label htmlFor="compression-quality">Compression quality</label><output htmlFor="compression-quality">{quality}%</output></div>
                <input id="compression-quality" type="range" min="10" max="95" step="5" value={quality} onChange={(event) => setQuality(Number(event.target.value))} disabled={busy} />
                <div className="quality-scale" aria-hidden="true"><span>Smaller file</span><span>Higher quality</span></div>
                <div className="quality-presets" role="group" aria-label="Compression quality presets">
                  {[
                    { label: "Low", value: 35 },
                    { label: "Medium", value: 65 },
                    { label: "High", value: 90 },
                  ].map((preset) => (
                    <button key={preset.label} type="button" aria-pressed={quality === preset.value} onClick={() => setQuality(preset.value)} disabled={busy}>
                      {preset.label} <span>{preset.value}%</span>
                    </button>
                  ))}
                </div>
                {result && !resultIsCurrentQuality && <p className="quality-changed">Quality changed. Compress again to update the result.</p>}
              </div>
            )}

            <div className="size-comparison" aria-label="Before and after file size comparison">
              <div><span>Original</span><strong>{formatBytes(metadata.file.size)}</strong><small>{outputLabel} · {metadata.width} × {metadata.height}</small></div>
              <span className="comparison-arrow" aria-hidden="true">→</span>
              <div className={result ? (result.hasSavings ? "has-savings" : "no-savings") : ""}>
                <span>Compressed</span><strong>{result ? formatBytes(result.compressedSize) : "—"}</strong><small>{result ? `${outputLabel}${resultQuality ? ` · ${resultQuality}% quality` : " · lossless"}` : "Waiting to compress"}</small>
              </div>
            </div>

            <Button size="lg" onClick={() => void handleCompress()} disabled={busy}>
              {status === "processing" ? "Compressing…" : result ? "Compress again" : `Compress ${outputLabel}`}
            </Button>

            {result && resultUrl && (
              <div className={`compression-result ${result.hasSavings ? "is-success" : "is-no-savings"}`} role="status">
                <span className="success-mark" aria-hidden="true">{result.hasSavings ? "✓" : "i"}</span>
                <div>
                  <strong>{result.hasSavings ? "Image compressed" : "No useful reduction achieved"}</strong>
                  {result.hasSavings ? (
                    <p>Saved {formatBytes(result.savedBytes)} ({result.savedPercentage.toFixed(1)}%)</p>
                  ) : (
                    <p>The new {outputLabel} is {formatBytes(result.compressedSize - result.originalSize)} larger. Your original remains the better choice.</p>
                  )}
                </div>
                <div className="result-downloads">
                  {result.hasSavings ? (
                    <a className={buttonClassName({ variant: "secondary" })} href={resultUrl} download={result.filename}>Download compressed</a>
                  ) : (
                    <>
                      <a className={buttonClassName({ variant: "secondary" })} href={previewUrl ?? ""} download={metadata.file.name}>Download original</a>
                      <a className="result-secondary-link" href={resultUrl} download={result.filename}>Download result anyway</a>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {error && <p className="converter-error"><strong>Couldn’t compress that image.</strong> {error}</p>}
      </div>

      {(metadata || error) && (
        <div className="converter-reset-actions">
          {metadata && <Button variant="secondary" onClick={() => reset(true)} disabled={busy}>Compress another image</Button>}
          <Button variant="ghost" onClick={() => reset()} disabled={busy}>Clear</Button>
        </div>
      )}
    </section>
  );
}
