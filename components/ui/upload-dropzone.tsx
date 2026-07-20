import { Badge } from "@/components/ui/badge";

export function UploadDropzone() {
  return (
    <section className="upload-dropzone" aria-labelledby="upload-preview-title">
      <div className="upload-icon" aria-hidden="true"><span /></div>
      <div>
        <h2 id="upload-preview-title">Drop files here</h2>
        <p>or choose files from your device</p>
      </div>
      <Badge tone="warning">UI preview only</Badge>
      <p className="upload-note">File processing will be enabled in a future sprint.</p>
    </section>
  );
}
