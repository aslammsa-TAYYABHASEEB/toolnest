"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { MultiImageUploader } from "@/components/image-tool/multi-image-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toImageProcessingError } from "@/lib/image/errors";
import {
  getImageCollectionPixels,
  getImageCollectionSize,
  preparePdfImage,
  validateDecodedWorkload,
  validateImageCollection,
} from "@/lib/image/image-to-pdf-input";
import { revokeImageObjectUrl } from "@/lib/image/object-url";
import { formatBytes } from "@/lib/image/process-image";
import {
  IMAGE_FORMATS,
  MAX_IMAGE_TO_PDF_TOTAL_PIXELS,
  type PdfImageItem,
} from "@/lib/image/types";
import { createPdfFromImages } from "@/lib/pdf/images-to-pdf";
import {
  IMAGE_PDF_MARGINS,
  IMAGE_PDF_PAGE_SIZES,
} from "@/lib/pdf/image-page-layout";
import {
  type ImagePdfBackground,
  type ImagePdfFit,
  type ImagePdfMargin,
  type ImagePdfOptions,
  type ImagePdfOrientation,
  type ImagePdfPageSize,
  type ImagePdfResult,
} from "@/lib/pdf/types";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";

type ToolStatus = "idle" | "loading" | "ready" | "converting" | "success" | "error";

const DEFAULT_OPTIONS: ImagePdfOptions = {
  pageSize: "auto",
  orientation: "auto",
  fit: "fit",
  margin: "none",
  background: "white",
};

function createImageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatMegapixels(pixels: number) {
  const megapixels = pixels / (1024 * 1024);
  return `${megapixels.toFixed(megapixels >= 10 ? 0 : 1)} MP`;
}

export function JpgToPdf() {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [images, setImages] = useState<PdfImageItem[]>([]);
  const [options, setOptions] = useState<ImagePdfOptions>(DEFAULT_OPTIONS);
  const [status, setStatus] = useState<ToolStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImagePdfResult | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const download = usePdfDownload();
  const busy = status === "loading" || status === "converting";

  useEffect(() => () => {
    previewUrls.current.forEach(revokeImageObjectUrl);
    previewUrls.current.clear();
  }, []);

  function clearResult() {
    download.clear();
    setResult(null);
  }

  async function addImages(files: File[]) {
    if (files.length === 0 || busy) return;
    clearResult();
    setError(null);
    setStatus("loading");
    const prepared: PdfImageItem[] = [];

    try {
      validateImageCollection(images, files);
      for (const file of files) {
        const item = await preparePdfImage(file, createImageId());
        prepared.push(item);
        previewUrls.current.add(item.previewUrl);
      }
      validateDecodedWorkload([...images, ...prepared]);
      setImages((current) => [...current, ...prepared]);
      setStatus("ready");
    } catch (caught) {
      prepared.forEach((item) => {
        revokeImageObjectUrl(item.previewUrl);
        previewUrls.current.delete(item.previewUrl);
      });
      setError(toImageProcessingError(
        caught,
        "The selected images could not be prepared.",
      ).message);
      setStatus(images.length > 0 ? "ready" : "error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateImages(next: PdfImageItem[]) {
    clearResult();
    setImages(next);
    setError(null);
    setStatus(next.length > 0 ? "ready" : "idle");
  }

  function removeImage(id: string) {
    const removed = images.find((item) => item.id === id);
    if (removed) {
      revokeImageObjectUrl(removed.previewUrl);
      previewUrls.current.delete(removed.previewUrl);
    }
    updateImages(images.filter((item) => item.id !== id));
  }

  function moveImage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= images.length || fromIndex === toIndex) return;
    const next = [...images];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateImages(next);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, targetId: string) {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain") || draggedId;
    setDraggedId(null);
    if (!sourceId || sourceId === targetId) return;
    const fromIndex = images.findIndex((item) => item.id === sourceId);
    const toIndex = images.findIndex((item) => item.id === targetId);
    if (fromIndex >= 0 && toIndex >= 0) moveImage(fromIndex, toIndex);
  }

  function changeOption<Key extends keyof ImagePdfOptions>(
    key: Key,
    value: ImagePdfOptions[Key],
  ) {
    clearResult();
    setOptions((current) => ({ ...current, [key]: value }));
    setError(null);
    setStatus(images.length > 0 ? "ready" : "idle");
  }

  function clearAll() {
    previewUrls.current.forEach(revokeImageObjectUrl);
    previewUrls.current.clear();
    download.clear();
    setImages([]);
    setOptions(DEFAULT_OPTIONS);
    setResult(null);
    setError(null);
    setDraggedId(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function convert() {
    if (busy || images.length === 0) return;
    clearResult();
    setError(null);
    setStatus("converting");
    try {
      const output = await createPdfFromImages(images, options);
      setResult(output);
      download.replace(output.blob, output.filename);
      setStatus("success");
    } catch (caught) {
      const message = caught instanceof Error
        ? caught.message
        : "The PDF could not be created.";
      setError(message);
      setStatus("error");
    }
  }

  const totalSize = getImageCollectionSize(images);
  const totalPixels = getImageCollectionPixels(images);

  return (
    <section className="image-pdf-shell" aria-labelledby="jpg-to-pdf-title">
      <h2 className="sr-only" id="jpg-to-pdf-title">Convert images to PDF</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <strong>Your images are converted locally and never leave your device.</strong>
      </div>

      <MultiImageUploader
        inputRef={inputRef}
        busy={busy}
        compact={images.length > 0}
        onSelect={(files) => void addImages(files)}
      />

      {images.length > 0 && (
        <div className="image-pdf-workspace">
          <Card className="image-pdf-list-card">
            <div className="image-pdf-heading">
              <div>
                <span className="kicker">PDF page order</span>
                <h3>{images.length} image{images.length === 1 ? "" : "s"}</h3>
              </div>
              <div className="image-pdf-totals">
                <strong>{formatBytes(totalSize)}</strong>
                <span>{formatMegapixels(totalPixels)} decoded</span>
              </div>
            </div>
            <p className="image-pdf-reorder-help" id="image-pdf-reorder-help">
              Drag images into order, or use the arrow buttons. One PDF page will be created for each image.
            </p>
            <ol className="image-pdf-list" aria-describedby="image-pdf-reorder-help">
              {images.map((item, index) => (
                <li
                  key={item.id}
                  className={draggedId === item.id ? "is-dragging" : ""}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, item.id)}
                >
                  <span
                    className="pdf-drag-handle"
                    draggable={!busy}
                    aria-label={`Drag ${item.file.name} to reorder`}
                    aria-disabled={busy}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt="" />
                  <span className="image-pdf-file-details">
                    <strong title={item.file.name}>{item.file.name}</strong>
                    <small>
                      {IMAGE_FORMATS[item.format].label}
                      {" · "}{item.width} × {item.height} px
                      {" · "}{formatBytes(item.file.size)}
                    </small>
                  </span>
                  <span className="pdf-reorder-buttons">
                    <button
                      type="button"
                      onClick={() => moveImage(index, index - 1)}
                      disabled={busy || index === 0}
                      aria-label={`Move ${item.file.name} up`}
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => moveImage(index, index + 1)}
                      disabled={busy || index === images.length - 1}
                      aria-label={`Move ${item.file.name} down`}
                    >↓</button>
                  </span>
                  <button
                    className="pdf-remove-button"
                    type="button"
                    onClick={() => removeImage(item.id)}
                    disabled={busy}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="image-pdf-controls">
            <div>
              <span className="kicker">Page layout</span>
              <h3>Choose how images appear</h3>
            </div>

            <OptionGroup
              legend="Page size"
              value={options.pageSize}
              options={[
                ["auto", "Auto"],
                ["a4", IMAGE_PDF_PAGE_SIZES.a4.label],
                ["letter", IMAGE_PDF_PAGE_SIZES.letter.label],
                ["legal", IMAGE_PDF_PAGE_SIZES.legal.label],
              ]}
              disabled={busy}
              onChange={(value) => changeOption("pageSize", value as ImagePdfPageSize)}
            />
            <OptionGroup
              legend="Orientation"
              value={options.orientation}
              options={[
                ["auto", "Auto"],
                ["portrait", "Portrait"],
                ["landscape", "Landscape"],
              ]}
              disabled={busy}
              onChange={(value) => changeOption("orientation", value as ImagePdfOrientation)}
            />
            <OptionGroup
              legend="Image fit"
              value={options.fit}
              options={[
                ["fit", "Fit"],
                ["fill", "Fill"],
                ["original", "Original"],
              ]}
              disabled={busy}
              onChange={(value) => changeOption("fit", value as ImagePdfFit)}
            />
            {options.fit === "fill" && (
              <p className="image-pdf-warning">Fill covers the available page area and may crop image edges.</p>
            )}
            <OptionGroup
              legend="Margins"
              value={options.margin}
              options={[
                ["none", "None"],
                ["small", "Small"],
                ["medium", "Medium"],
                ["large", "Large"],
              ]}
              disabled={busy}
              onChange={(value) => changeOption("margin", value as ImagePdfMargin)}
            />
            <p className="image-pdf-measure">
              Margin: {IMAGE_PDF_MARGINS[options.margin]} points
            </p>
            <OptionGroup
              legend="Transparent image background"
              value={options.background}
              options={[
                ["white", "White"],
                ["light-gray", "Light gray"],
                ["black", "Black"],
              ]}
              disabled={busy}
              onChange={(value) => changeOption("background", value as ImagePdfBackground)}
            />

            <div className="image-pdf-safety">
              <strong>Browser-safe workload</strong>
              <span>
                {formatMegapixels(totalPixels)} of
                {" "}{formatMegapixels(MAX_IMAGE_TO_PDF_TOTAL_PIXELS)} decoded pixels
              </span>
            </div>

            <div className="image-pdf-actions">
              <Button
                size="lg"
                onClick={() => void convert()}
                disabled={busy || images.length === 0}
              >
                {status === "converting"
                  ? "Creating PDF…"
                  : result
                    ? "Convert again"
                    : "Create PDF"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                Add more images
              </Button>
              <Button variant="ghost" onClick={clearAll} disabled={busy}>
                Clear all
              </Button>
            </div>
          </Card>
        </div>
      )}

      {result && download.download && (
        <Card className="image-pdf-result" aria-live="polite">
          <span className="success-mark" aria-hidden="true">✓</span>
          <div>
            <strong>PDF ready to download</strong>
            <p>{result.filename}</p>
            <small>
              {formatBytes(result.size)}
              {" · "}{result.pageCount} page{result.pageCount === 1 ? "" : "s"}
              {" · "}{result.imageCount} image{result.imageCount === 1 ? "" : "s"}
            </small>
            <small>
              {result.options.pageSize.toUpperCase()}
              {" · "}{result.options.orientation}
              {" · "}{result.options.fit}
            </small>
          </div>
          <a
            className={buttonClassName()}
            href={download.download.url}
            download={download.download.filename}
          >
            Download PDF
          </a>
          <div className="image-pdf-result-actions">
            <Button
              variant="secondary"
              onClick={() => {
                clearResult();
                setError(null);
                setStatus("ready");
              }}
            >
              Convert again
            </Button>
            <Button variant="ghost" onClick={clearAll}>
              Convert another set
            </Button>
          </div>
        </Card>
      )}

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p className="processing-message">Checking and decoding images…</p>}
        {status === "converting" && <p className="processing-message">Creating one PDF page per image…</p>}
        {error && (
          <p className="converter-error">
            <strong>Couldn’t create the PDF.</strong> {error}
          </p>
        )}
      </div>
    </section>
  );
}

type OptionGroupProps = {
  legend: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function OptionGroup({
  legend,
  value,
  options,
  disabled = false,
  onChange,
}: OptionGroupProps) {
  const name = `image-pdf-${legend.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <fieldset className="image-pdf-option-group" disabled={disabled}>
      <legend>{legend}</legend>
      <div>
        {options.map(([optionValue, label]) => (
          <label
            key={optionValue}
            className={value === optionValue ? "is-selected" : ""}
          >
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
