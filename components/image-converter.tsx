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
import {
  openImageFilePicker,
} from "@/lib/image/browser";
import { createImageDownloadAction } from "@/lib/image/download";
import { convertImage, formatBytes } from "@/lib/image/process-image";
import {
  IMAGE_FORMATS,
  type ConvertedImage,
  type ImageFormat,
} from "@/lib/image/types";
import { useImageProcessing } from "@/lib/image/use-image-processing";

export function ImageConverter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const image = useImageProcessing<ConvertedImage>();
  const [outputFormat, setOutputFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(90);

  async function selectFile(file?: File) {
    if (!file || image.busy) return;
    const metadata = await image.loadFile(file);
    if (!metadata) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setOutputFormat(metadata.format === "webp" ? "jpeg" : "webp");
  }

  function reset(openPicker = false) {
    image.reset();
    setOutputFormat("webp");
    setQuality(90);
    if (inputRef.current) inputRef.current.value = "";
    if (openPicker) openImageFilePicker(inputRef.current, true);
  }

  async function handleConvert() {
    if (!image.metadata || image.busy) return;
    image.beginProcessing();

    try {
      const converted = await convertImage({
        file: image.metadata.file,
        format: outputFormat,
        quality: quality / 100,
      });
      image.completeProcessing(converted);
    } catch (caught) {
      image.failProcessing(caught, "The image could not be converted.");
    }
  }

  return (
    <section className="converter-shell" aria-labelledby="converter-title">
      <h2 className="sr-only" id="converter-title">Convert your image</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your image is processed locally and never leaves your device.</strong>
      </div>

      <ImageUploader
        inputRef={inputRef}
        inputId="image-file"
        busy={image.busy}
        loading={image.status === "loading"}
        icon="↑"
        showDropzone={!image.metadata}
        onSelect={(file) => void selectFile(file)}
      />

      {image.metadata && (
        <div className="converter-workspace">
          <Card className="image-preview-card">
            <ImagePreview
              url={image.previewUrl ?? ""}
              filename={image.metadata.file.name}
            />
            <ImageInfo metadata={image.metadata} sizeLabel="File size" />
            <Button
              variant="secondary"
              onClick={() => openImageFilePicker(inputRef.current)}
              disabled={image.busy}
            >
              Replace image
            </Button>
          </Card>

          <ProcessingCard>
            <fieldset disabled={image.busy}>
              <legend>Output format</legend>
              <div className="format-options">
                {(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((format) => (
                  <label
                    key={format}
                    className={outputFormat === format ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={format}
                      checked={outputFormat === format}
                      onChange={() => {
                        setOutputFormat(format);
                        image.discardResult("ready");
                      }}
                    />
                    <span>{IMAGE_FORMATS[format].label}</span>
                  </label>
                ))}
              </div>

              {IMAGE_FORMATS[outputFormat].supportsQuality && (
                <div className="quality-control">
                  <div>
                    <label htmlFor="quality">Quality</label>
                    <output htmlFor="quality">{quality}%</output>
                  </div>
                  <input
                    id="quality"
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={quality}
                    onChange={(event) => {
                      setQuality(Number(event.target.value));
                      image.discardResult("ready");
                    }}
                  />
                  <p>Higher quality usually creates a larger file.</p>
                </div>
              )}
            </fieldset>

            <Button
              size="lg"
              onClick={() => void handleConvert()}
              disabled={image.busy}
            >
              {image.status === "processing"
                ? "Converting…"
                : `Convert to ${IMAGE_FORMATS[outputFormat].label}`}
            </Button>

            {image.result && image.resultUrl && (
              <ResultCard
                className="conversion-result"
                icon="✓"
                title="Conversion complete"
                description={(
                  <p>
                    {IMAGE_FORMATS[image.result.format].label}
                    {" · "}
                    {formatBytes(image.result.outputSize)}
                  </p>
                )}
                actions={(
                  <DownloadActions actions={[
                    createImageDownloadAction(
                      image.resultUrl,
                      image.result.filename,
                      "Download",
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
            <strong>Couldn’t process that image.</strong> {image.error.message}
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
              Convert another image
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
