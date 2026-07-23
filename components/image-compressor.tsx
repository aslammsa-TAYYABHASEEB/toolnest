"use client";

import { useRef, useState } from "react";
import { DownloadActions } from "@/components/image-tool/download-actions";
import { ImageInfo } from "@/components/image-tool/image-info";
import { ImagePreview } from "@/components/image-tool/image-preview";
import { ImageUploader } from "@/components/image-tool/image-uploader";
import { ProcessingCard } from "@/components/image-tool/processing-card";
import { ResultCard } from "@/components/image-tool/result-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { openImageFilePicker } from "@/lib/image/browser";
import {
  createImageDownloadAction,
  type ImageDownloadAction,
} from "@/lib/image/download";
import { compressImage, formatBytes } from "@/lib/image/process-image";
import {
  IMAGE_FORMATS,
  type CompressedImage,
} from "@/lib/image/types";
import { useImageProcessing } from "@/lib/image/use-image-processing";

export function ImageCompressor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const image = useImageProcessing<CompressedImage>();
  const [quality, setQuality] = useState(75);
  const [resultQuality, setResultQuality] = useState<number | null>(null);

  async function selectFile(file?: File) {
    if (!file || image.busy) return;
    const metadata = await image.loadFile(file);
    if (!metadata) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setQuality(75);
    setResultQuality(null);
  }

  function reset(openPicker = false) {
    image.reset();
    setQuality(75);
    setResultQuality(null);
    if (inputRef.current) inputRef.current.value = "";
    if (openPicker) openImageFilePicker(inputRef.current, true);
  }

  async function handleCompress() {
    if (!image.metadata || image.busy) return;
    image.beginProcessing();

    try {
      const compressed = await compressImage({
        file: image.metadata.file,
        format: image.metadata.format,
        quality: quality / 100,
      });
      setResultQuality(image.metadata.format === "png" ? null : quality);
      image.completeProcessing(
        compressed,
        compressed.hasSavings ? "success" : "no-savings",
      );
    } catch (caught) {
      image.failProcessing(caught, "The image could not be compressed.");
    }
  }

  const outputLabel = image.metadata
    ? IMAGE_FORMATS[image.metadata.format].label
    : "";
  const resultIsCurrentQuality =
    image.metadata?.format === "png" || resultQuality === quality;

  function getDownloadActions(): ImageDownloadAction[] {
    if (!image.result || !image.resultUrl || !image.metadata) return [];

    if (image.result.hasSavings) {
      return [
        createImageDownloadAction(
          image.resultUrl,
          image.result.filename,
          "Download compressed",
        ),
      ];
    }

    return [
      createImageDownloadAction(
        image.previewUrl ?? "",
        image.metadata.file.name,
        "Download original",
      ),
      createImageDownloadAction(
        image.resultUrl,
        image.result.filename,
        "Download result anyway",
        "link",
      ),
    ];
  }

  return (
    <section
      className="converter-shell compressor-shell"
      aria-labelledby="compressor-title"
    >
      <h2 className="sr-only" id="compressor-title">Compress your image</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your image is compressed locally and never leaves your device.</strong>
      </div>

      <ImageUploader
        inputRef={inputRef}
        inputId="compressor-image-file"
        busy={image.busy}
        loading={image.status === "loading"}
        icon="↓"
        showDropzone={!image.metadata}
        onSelect={(file) => void selectFile(file)}
      />

      {image.metadata && (
        <div className="converter-workspace compressor-workspace">
          <Card className="image-preview-card">
            <ImagePreview
              url={image.previewUrl ?? ""}
              filename={image.metadata.file.name}
            />
            <ImageInfo metadata={image.metadata} sizeLabel="Original size" />
            <Button
              variant="secondary"
              onClick={() => openImageFilePicker(inputRef.current)}
              disabled={image.busy}
            >
              Replace image
            </Button>
          </Card>

          <ProcessingCard className="compressor-controls">
            {image.metadata.format === "png" ? (
              <div className="png-limit-note">
                <span className="ui-badge ui-badge-warning">Lossless PNG</span>
                <h3>PNG quality cannot be tuned reliably</h3>
                <p>
                  ToolNest will try a lossless browser re-encode. It may save
                  little or nothing. For stronger compression, use Image
                  Converter to make a WebP copy.
                </p>
                <a href="/tools/image-converter">
                  Open Image Converter <span aria-hidden="true">→</span>
                </a>
              </div>
            ) : (
              <div className="quality-control compressor-quality">
                <div>
                  <label htmlFor="compression-quality">Compression quality</label>
                  <output htmlFor="compression-quality">{quality}%</output>
                </div>
                <input
                  id="compression-quality"
                  type="range"
                  min="10"
                  max="95"
                  step="5"
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                  disabled={image.busy}
                />
                <div className="quality-scale" aria-hidden="true">
                  <span>Smaller file</span>
                  <span>Higher quality</span>
                </div>
                <div
                  className="quality-presets"
                  role="group"
                  aria-label="Compression quality presets"
                >
                  {[
                    { label: "Low", value: 35 },
                    { label: "Medium", value: 65 },
                    { label: "High", value: 90 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      aria-pressed={quality === preset.value}
                      onClick={() => setQuality(preset.value)}
                      disabled={image.busy}
                    >
                      {preset.label} <span>{preset.value}%</span>
                    </button>
                  ))}
                </div>
                {image.result && !resultIsCurrentQuality && (
                  <p className="quality-changed">
                    Quality changed. Compress again to update the result.
                  </p>
                )}
              </div>
            )}

            <div
              className="size-comparison"
              aria-label="Before and after file size comparison"
            >
              <div>
                <span>Original</span>
                <strong>{formatBytes(image.metadata.file.size)}</strong>
                <small>
                  {outputLabel} · {image.metadata.width} × {image.metadata.height}
                </small>
              </div>
              <span className="comparison-arrow" aria-hidden="true">→</span>
              <div className={image.result
                ? (image.result.hasSavings ? "has-savings" : "no-savings")
                : ""}
              >
                <span>Compressed</span>
                <strong>
                  {image.result
                    ? formatBytes(image.result.compressedSize)
                    : "—"}
                </strong>
                <small>
                  {image.result
                    ? `${outputLabel}${resultQuality
                      ? ` · ${resultQuality}% quality`
                      : " · lossless"}`
                    : "Waiting to compress"}
                </small>
              </div>
            </div>

            <Button
              size="lg"
              onClick={() => void handleCompress()}
              disabled={image.busy}
            >
              {image.status === "processing"
                ? "Compressing…"
                : image.result
                  ? "Compress again"
                  : `Compress ${outputLabel}`}
            </Button>

            {image.result && image.resultUrl && (
              <ResultCard
                className={`compression-result ${image.result.hasSavings
                  ? "is-success"
                  : "is-no-savings"}`}
                icon={image.result.hasSavings ? "✓" : "i"}
                title={image.result.hasSavings
                  ? "Image compressed"
                  : "No useful reduction achieved"}
                description={image.result.hasSavings ? (
                  <p>
                    Saved {formatBytes(image.result.savedBytes)}
                    {" "}
                    ({image.result.savedPercentage.toFixed(1)}%)
                  </p>
                ) : (
                  <p>
                    The new {outputLabel} is{" "}
                    {formatBytes(
                      image.result.compressedSize - image.result.originalSize,
                    )} larger. Your original remains the better choice.
                  </p>
                )}
                actions={(
                  <DownloadActions
                    className="result-downloads"
                    actions={getDownloadActions()}
                  />
                )}
              />
            )}
          </ProcessingCard>
        </div>
      )}

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {image.error && (
          <p className="converter-error">
            <strong>Couldn’t compress that image.</strong> {image.error.message}
          </p>
        )}
      </div>

      {(image.metadata || image.error) && (
        <div className="converter-reset-actions">
          {image.metadata && (
            <Button
              variant="secondary"
              onClick={() => reset(true)}
              disabled={image.busy}
            >
              Compress another image
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => reset()}
            disabled={image.busy}
          >
            Clear
          </Button>
        </div>
      )}
    </section>
  );
}
