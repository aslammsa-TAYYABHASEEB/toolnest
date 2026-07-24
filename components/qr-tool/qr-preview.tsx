import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { QrAssets } from "@/lib/qr/types";

type QrPreviewStatus = "empty" | "generating" | "ready" | "error";

type QrPreviewProps = {
  typeLabel: string;
  status: QrPreviewStatus;
  assets: QrAssets | null;
  previewUrl: string | null;
  error: string | null;
  warning: string | null;
  copySupported: boolean;
  onDownloadPng: () => void;
  onDownloadSvg: () => void;
  onCopy: () => void;
  onGenerateAnother: () => void;
};

export function QrPreview({
  typeLabel,
  status,
  assets,
  previewUrl,
  error,
  warning,
  copySupported,
  onDownloadPng,
  onDownloadSvg,
  onCopy,
  onGenerateAnother,
}: QrPreviewProps) {
  const ready = Boolean(assets && previewUrl);

  return (
    <Card as="section" className="qr-preview-card" aria-labelledby="qr-preview-title">
      <div className="qr-preview-heading">
        <div>
          <span className="kicker">Live preview</span>
          <h2 id="qr-preview-title">Your QR code</h2>
        </div>
        {ready && <span className="qr-ready-badge">Ready</span>}
      </div>

      <div
        className="qr-preview-stage"
        aria-busy={status === "generating"}
      >
        {ready && previewUrl ? (
          <img
            src={previewUrl}
            alt={`Generated ${typeLabel} QR code preview`}
            width={320}
            height={320}
          />
        ) : (
          <div className="qr-preview-empty">
            <span aria-hidden="true">QR</span>
            <strong>
              {status === "generating"
                ? "Generating QR code…"
                : status === "error"
                  ? "QR code unavailable"
                  : "Enter valid content to begin"}
            </strong>
            <p>The preview updates automatically as you type.</p>
          </div>
        )}
        {status === "generating" && ready && (
          <span className="qr-preview-updating">Updating…</span>
        )}
      </div>

      {warning && (
        <p className="qr-contrast-warning">
          <strong>Contrast notice:</strong> {warning}
        </p>
      )}
      {error && (
        <p className="converter-error">
          <strong>Couldn’t generate this QR code.</strong> {error}
        </p>
      )}

      <div className="qr-download-actions">
        <Button onClick={onDownloadPng} disabled={!ready}>
          Download PNG
        </Button>
        <Button variant="secondary" onClick={onDownloadSvg} disabled={!ready}>
          Download SVG
        </Button>
        <Button
          variant="secondary"
          onClick={onCopy}
          disabled={!ready || !copySupported}
          title={copySupported ? undefined : "Image copying is not supported in this browser or context."}
        >
          Copy image
        </Button>
      </div>
      {!copySupported && (
        <p className="qr-copy-note">
          Image copying is unavailable here. PNG and SVG downloads still work.
        </p>
      )}
      {ready && (
        <Button variant="ghost" onClick={onGenerateAnother}>
          Generate another QR code
        </Button>
      )}
    </Card>
  );
}
