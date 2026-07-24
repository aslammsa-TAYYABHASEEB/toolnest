"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QrPreview } from "@/components/qr-tool/qr-preview";
import { QrTypeFields } from "@/components/qr-tool/qr-type-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { assessQrContrast, isHexColor } from "@/lib/qr/colors";
import {
  canCopyQrImage,
  copyQrPng,
  createSvgBlob,
  downloadQrBlob,
  makeQrFilename,
} from "@/lib/qr/download";
import { qrProcessingMessage, renderQrCode } from "@/lib/qr/render";
import {
  DEFAULT_QR_SETTINGS,
  EMPTY_QR_FORM,
  QR_TYPES,
  type QrAssets,
  type QrFormState,
  type QrSettings,
  type QrType,
} from "@/lib/qr/types";
import { validateQrForm } from "@/lib/qr/validation";

type PreviewStatus = "empty" | "generating" | "ready" | "error";

const ERROR_CORRECTION_OPTIONS = [
  { value: "L", label: "Low", detail: "7%" },
  { value: "M", label: "Medium", detail: "15%" },
  { value: "Q", label: "Quartile", detail: "25%" },
  { value: "H", label: "High", detail: "30%" },
] as const;

export function QrCodeGenerator() {
  const [type, setType] = useState<QrType>("text");
  const [form, setForm] = useState<QrFormState>({ ...EMPTY_QR_FORM });
  const [settings, setSettings] = useState<QrSettings>({ ...DEFAULT_QR_SETTINGS });
  const [assets, setAssets] = useState<QrAssets | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PreviewStatus>("empty");
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [copySupported, setCopySupported] = useState(false);
  const previewUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  const validation = useMemo(
    () => validateQrForm(type, form),
    [type, form],
  );
  const contrast = useMemo(
    () => assessQrContrast(settings.foreground, settings.background),
    [settings.foreground, settings.background],
  );
  const selectedType = QR_TYPES.find((option) => option.value === type) ?? QR_TYPES[0];

  useEffect(() => {
    setCopySupported(canCopyQrImage());
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;

    if (!validation.valid || contrast.blocking) {
      setAssets(null);
      setStatus("empty");
      setProcessingError(null);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        setPreviewUrl(null);
      }
      return;
    }

    setStatus("generating");
    setProcessingError(null);
    const timer = window.setTimeout(() => {
      void renderQrCode(validation.payload, settings)
        .then((nextAssets) => {
          if (generation !== generationRef.current) return;
          const nextUrl = URL.createObjectURL(createSvgBlob(nextAssets.svg));
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = nextUrl;
          setAssets(nextAssets);
          setPreviewUrl(nextUrl);
          setStatus("ready");
        })
        .catch((caught: unknown) => {
          if (generation !== generationRef.current) return;
          setAssets(null);
          setStatus("error");
          setProcessingError(qrProcessingMessage(caught));
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
            setPreviewUrl(null);
          }
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [contrast.blocking, settings, validation]);

  function updateForm<Field extends keyof QrFormState>(
    field: Field,
    value: QrFormState[Field],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setInteracted(true);
    setFeedback(null);
  }

  function updateSetting<Field extends keyof QrSettings>(
    field: Field,
    value: QrSettings[Field],
  ) {
    setSettings((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  function clearContent(goToText = false) {
    setForm({ ...EMPTY_QR_FORM });
    if (goToText) setType("text");
    setInteracted(false);
    setFeedback(null);
  }

  function resetAll() {
    setType("text");
    setForm({ ...EMPTY_QR_FORM });
    setSettings({ ...DEFAULT_QR_SETTINGS });
    setInteracted(false);
    setFeedback("QR generator reset to its defaults.");
  }

  function downloadPng() {
    if (!assets) return;
    downloadQrBlob(assets.png, makeQrFilename(type, "png"));
    setFeedback("PNG download started.");
  }

  function downloadSvg() {
    if (!assets) return;
    downloadQrBlob(createSvgBlob(assets.svg), makeQrFilename(type, "svg"));
    setFeedback("SVG download started.");
  }

  async function copyImage() {
    if (!assets) return;
    try {
      await copyQrPng(assets.png);
      setFeedback("QR code image copied to the clipboard.");
    } catch {
      setFeedback("This browser could not copy the image. Download PNG instead.");
    }
  }

  return (
    <section className="qr-generator-shell" aria-labelledby="qr-generator-title">
      <h2 className="sr-only" id="qr-generator-title">Create a QR code</h2>
      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your QR code is generated locally in your browser.</strong>
          <p>Your content is not uploaded to ToolNest servers, and no account is required.</p>
        </div>
      </div>

      <div className="qr-workspace">
        <Card as="section" className="qr-form-card" aria-label="QR code settings">
          <fieldset className="qr-type-selector">
            <legend>What should the QR code contain?</legend>
            <div>
              {QR_TYPES.map((option) => (
                <label
                  key={option.value}
                  className={type === option.value ? "is-selected" : ""}
                >
                  <input
                    type="radio"
                    name="qr-type"
                    value={option.value}
                    checked={type === option.value}
                    onChange={() => {
                      setType(option.value);
                      setInteracted(false);
                      setFeedback(null);
                    }}
                  />
                  <span aria-hidden="true">{option.icon}</span>
                  <strong>{option.label}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="qr-fields">
            <QrTypeFields
              type={type}
              form={form}
              errors={interacted ? validation.errors : {}}
              onChange={updateForm}
            />
          </div>

          <details className="qr-customization" open>
            <summary>Customize QR code</summary>
            <div className="qr-customization-body">
              <div className="qr-range-grid">
                <label className="quality-control" htmlFor="qr-size">
                  <span><strong>Size</strong><output htmlFor="qr-size">{settings.size} px</output></span>
                  <input
                    id="qr-size"
                    type="range"
                    min="192"
                    max="1024"
                    step="32"
                    value={settings.size}
                    onChange={(event) => updateSetting("size", Number(event.target.value))}
                  />
                </label>
                <label className="quality-control" htmlFor="qr-margin">
                  <span><strong>Quiet zone</strong><output htmlFor="qr-margin">{settings.margin} modules</output></span>
                  <input
                    id="qr-margin"
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={settings.margin}
                    onChange={(event) => updateSetting("margin", Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="qr-color-grid">
                <label className="qr-color-field">
                  <span className="input-label">Foreground color</span>
                  <span>
                    <input
                      type="color"
                      aria-label="Choose foreground color"
                      value={
                        isHexColor(settings.foreground)
                          ? settings.foreground
                          : "#111827"
                      }
                      onChange={(event) => updateSetting("foreground", event.target.value)}
                    />
                    <input
                      className="input-control"
                      aria-label="Foreground color hex value"
                      value={settings.foreground}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(event) => updateSetting("foreground", event.target.value)}
                    />
                  </span>
                </label>
                <label className="qr-color-field">
                  <span className="input-label">Background color</span>
                  <span>
                    <input
                      type="color"
                      aria-label="Choose background color"
                      value={
                        isHexColor(settings.background)
                          ? settings.background
                          : "#ffffff"
                      }
                      onChange={(event) => updateSetting("background", event.target.value)}
                    />
                    <input
                      className="input-control"
                      aria-label="Background color hex value"
                      value={settings.background}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(event) => updateSetting("background", event.target.value)}
                    />
                  </span>
                </label>
              </div>

              <fieldset className="qr-error-correction">
                <legend>Error correction</legend>
                <div>
                  {ERROR_CORRECTION_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={settings.errorCorrection === option.value ? "is-selected" : ""}
                    >
                      <input
                        type="radio"
                        name="qr-error-correction"
                        value={option.value}
                        checked={settings.errorCorrection === option.value}
                        onChange={() => updateSetting("errorCorrection", option.value)}
                      />
                      <strong>{option.label}</strong>
                      <span>{option.detail} recovery</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>

          <div className="qr-form-actions">
            <Button variant="secondary" onClick={() => clearContent()}>
              Clear
            </Button>
            <Button variant="ghost" onClick={resetAll}>
              Reset
            </Button>
          </div>
        </Card>

        <QrPreview
          typeLabel={selectedType.label}
          status={status}
          assets={assets}
          previewUrl={previewUrl}
          error={processingError}
          warning={contrast.warning}
          copySupported={copySupported}
          onDownloadPng={downloadPng}
          onDownloadSvg={downloadSvg}
          onCopy={() => void copyImage()}
          onGenerateAnother={() => clearContent(true)}
        />
      </div>

      <div className="converter-status" aria-live="polite" aria-atomic="true">
        {feedback && <p>{feedback}</p>}
      </div>
    </section>
  );
}
