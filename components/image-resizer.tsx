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
import { createImageDownloadAction } from "@/lib/image/download";
import {
  formatBytes,
  resizeImage,
  validateOutputDimensions,
} from "@/lib/image/process-image";
import {
  IMAGE_FORMATS,
  type ImageFormat,
  type ImageMetadata,
  type ResizedImage,
} from "@/lib/image/types";
import { useImageProcessing } from "@/lib/image/use-image-processing";

type ResizeMode = "dimensions" | "percentage";

const SCALE_PRESETS = [25, 50, 75, 100, 150, 200];

function parseWholeNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function calculateScaledDimensions(metadata: ImageMetadata, percentage: number) {
  return {
    width: Math.max(1, Math.round(metadata.width * percentage / 100)),
    height: Math.max(1, Math.round(metadata.height * percentage / 100)),
  };
}

export function ImageResizer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const image = useImageProcessing<ResizedImage>();
  const [mode, setMode] = useState<ResizeMode>("dimensions");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [percentage, setPercentage] = useState("100");
  const [aspectRatioLocked, setAspectRatioLocked] = useState(true);
  const [outputFormat, setOutputFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(90);

  const target = (() => {
    if (!image.metadata) return { dimensions: null, error: null };

    let nextWidth: number;
    let nextHeight: number;
    if (mode === "percentage") {
      const scale = parseWholeNumber(percentage);
      if (!Number.isInteger(scale) || scale <= 0) {
        return {
          dimensions: null,
          error: "Scale must be a positive whole-number percentage.",
        };
      }
      ({ width: nextWidth, height: nextHeight } = calculateScaledDimensions(
        image.metadata,
        scale,
      ));
    } else {
      nextWidth = parseWholeNumber(width);
      nextHeight = parseWholeNumber(height);
    }

    try {
      return {
        dimensions: validateOutputDimensions(nextWidth, nextHeight),
        error: null,
      };
    } catch (caught) {
      return {
        dimensions: null,
        error: caught instanceof Error
          ? caught.message
          : "Choose valid output dimensions.",
      };
    }
  })();

  function discardResult() {
    image.discardResult("ready");
  }

  async function selectFile(file?: File) {
    if (!file || image.busy) return;
    const metadata = await image.loadFile(file);
    if (!metadata) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setMode("dimensions");
    setWidth(String(metadata.width));
    setHeight(String(metadata.height));
    setPercentage("100");
    setAspectRatioLocked(true);
    setOutputFormat(metadata.format);
    setQuality(90);
  }

  function reset(openPicker = false) {
    image.reset();
    setMode("dimensions");
    setWidth("");
    setHeight("");
    setPercentage("100");
    setAspectRatioLocked(true);
    setOutputFormat("webp");
    setQuality(90);
    if (inputRef.current) inputRef.current.value = "";
    if (openPicker) openImageFilePicker(inputRef.current, true);
  }

  function updateWidth(value: string) {
    setWidth(value);
    discardResult();
    if (!aspectRatioLocked || !image.metadata) return;
    const nextWidth = parseWholeNumber(value);
    if (Number.isInteger(nextWidth) && nextWidth > 0) {
      setHeight(String(Math.max(
        1,
        Math.round(nextWidth * image.metadata.height / image.metadata.width),
      )));
    }
  }

  function updateHeight(value: string) {
    setHeight(value);
    discardResult();
    if (!aspectRatioLocked || !image.metadata) return;
    const nextHeight = parseWholeNumber(value);
    if (Number.isInteger(nextHeight) && nextHeight > 0) {
      setWidth(String(Math.max(
        1,
        Math.round(nextHeight * image.metadata.width / image.metadata.height),
      )));
    }
  }

  function changeMode(nextMode: ResizeMode) {
    setMode(nextMode);
    discardResult();
  }

  function applyScale(value: number) {
    setMode("percentage");
    setPercentage(String(value));
    discardResult();
  }

  async function handleResize() {
    if (!image.metadata || !target.dimensions || image.busy) return;
    image.beginProcessing();

    try {
      const resized = await resizeImage({
        file: image.metadata.file,
        format: outputFormat,
        width: target.dimensions.width,
        height: target.dimensions.height,
        quality: quality / 100,
      });
      image.completeProcessing(resized);
    } catch (caught) {
      image.failProcessing(caught, "The image could not be resized.");
    }
  }

  return (
    <section
      className="converter-shell resizer-shell"
      aria-labelledby="resizer-title"
    >
      <h2 className="sr-only" id="resizer-title">Resize your image</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your image is resized locally and never leaves your device.</strong>
      </div>

      <ImageUploader
        inputRef={inputRef}
        inputId="resizer-image-file"
        busy={image.busy}
        loading={image.status === "loading"}
        icon="↗"
        showDropzone={!image.metadata}
        onSelect={(file) => void selectFile(file)}
      />

      {image.metadata && (
        <div className="converter-workspace resizer-workspace">
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

          <ProcessingCard className="resizer-controls">
            <fieldset disabled={image.busy}>
              <legend>Resize method</legend>
              <div className="resize-method-options">
                <label className={mode === "dimensions" ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="resize-method"
                    checked={mode === "dimensions"}
                    onChange={() => changeMode("dimensions")}
                  />
                  Exact dimensions
                </label>
                <label className={mode === "percentage" ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="resize-method"
                    checked={mode === "percentage"}
                    onChange={() => changeMode("percentage")}
                  />
                  Percentage
                </label>
              </div>

              {mode === "dimensions" ? (
                <div className="dimension-controls">
                  <div className="dimension-inputs">
                    <label>
                      <span>Width</span>
                      <span className="dimension-input">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={width}
                          onChange={(event) => updateWidth(event.target.value)}
                          aria-describedby="resize-dimension-error"
                        />
                        <span>px</span>
                      </span>
                    </label>
                    <span className="dimension-separator" aria-hidden="true">×</span>
                    <label>
                      <span>Height</span>
                      <span className="dimension-input">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          value={height}
                          onChange={(event) => updateHeight(event.target.value)}
                          aria-describedby="resize-dimension-error"
                        />
                        <span>px</span>
                      </span>
                    </label>
                  </div>
                  <label className="aspect-lock">
                    <input
                      type="checkbox"
                      checked={aspectRatioLocked}
                      onChange={(event) => {
                        const locked = event.target.checked;
                        setAspectRatioLocked(locked);
                        discardResult();
                        if (locked && image.metadata) {
                          const nextWidth = parseWholeNumber(width);
                          if (Number.isInteger(nextWidth) && nextWidth > 0) {
                            setHeight(String(Math.max(
                              1,
                              Math.round(
                                nextWidth
                                * image.metadata.height
                                / image.metadata.width,
                              ),
                            )));
                          }
                        }
                      }}
                    />
                    <span aria-hidden="true">{aspectRatioLocked ? "🔒" : "🔓"}</span>
                    Keep original aspect ratio
                  </label>
                </div>
              ) : (
                <div className="percentage-controls">
                  <label htmlFor="resize-percentage">Scale percentage</label>
                  <span className="percentage-input">
                    <input
                      id="resize-percentage"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={percentage}
                      onChange={(event) => {
                        setPercentage(event.target.value);
                        discardResult();
                      }}
                      aria-describedby="resize-dimension-error"
                    />
                    <span>%</span>
                  </span>
                  <div
                    className="resize-presets"
                    role="group"
                    aria-label="Percentage size presets"
                  >
                    {SCALE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={percentage === String(preset)}
                        onClick={() => applyScale(preset)}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="target-size" aria-live="polite">
                <span>Target size</span>
                <strong>
                  {target.dimensions
                    ? `${target.dimensions.width} × ${target.dimensions.height} px`
                    : "Enter valid dimensions"}
                </strong>
                <small>
                  Original: {image.metadata.width} × {image.metadata.height} px
                </small>
              </div>

              {target.error && (
                <p className="resize-validation" id="resize-dimension-error">
                  {target.error}
                </p>
              )}

              <div>
                <p className="control-heading">Output format</p>
                <div className="format-options">
                  {(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((format) => (
                    <label
                      key={format}
                      className={outputFormat === format ? "is-selected" : ""}
                    >
                      <input
                        type="radio"
                        name="resize-format"
                        value={format}
                        checked={outputFormat === format}
                        onChange={() => {
                          setOutputFormat(format);
                          discardResult();
                        }}
                      />
                      <span>{IMAGE_FORMATS[format].label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {IMAGE_FORMATS[outputFormat].supportsQuality ? (
                <div className="quality-control">
                  <div>
                    <label htmlFor="resize-quality">Output quality</label>
                    <output htmlFor="resize-quality">{quality}%</output>
                  </div>
                  <input
                    id="resize-quality"
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={quality}
                    onChange={(event) => {
                      setQuality(Number(event.target.value));
                      discardResult();
                    }}
                  />
                  <p>Higher quality usually creates a larger file.</p>
                </div>
              ) : (
                <p className="png-resize-note">
                  PNG export is lossless. File size can rise or fall as the pixel
                  dimensions change.
                </p>
              )}
            </fieldset>

            <Button
              size="lg"
              onClick={() => void handleResize()}
              disabled={image.busy || !target.dimensions}
            >
              {image.status === "processing"
                ? "Resizing…"
                : image.result
                  ? "Resize again"
                  : "Resize image"}
            </Button>

            {image.result && image.resultUrl && (
              <ResultCard
                className="conversion-result resize-result"
                icon="✓"
                title="Resize complete"
                description={(
                  <p>
                    {image.result.originalWidth} × {image.result.originalHeight}
                    {" → "}
                    {image.result.width} × {image.result.height} px
                    <br />
                    {formatBytes(image.result.originalSize)}
                    {" → "}
                    {formatBytes(image.result.outputSize)}
                    {" · "}
                    {IMAGE_FORMATS[image.result.format].label}
                  </p>
                )}
                actions={(
                  <DownloadActions actions={[
                    createImageDownloadAction(
                      image.resultUrl,
                      image.result.filename,
                      "Download resized",
                    ),
                  ]} />
                )}
              />
            )}
          </ProcessingCard>
        </div>
      )}

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {image.error && (
          <p className="converter-error">
            <strong>Couldn’t resize that image.</strong> {image.error.message}
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
              Resize another image
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
