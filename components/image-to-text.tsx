"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUploader } from "@/components/image-tool/image-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { prepareOcrImage } from "@/lib/ocr/image-input";
import type { ImageMetadata } from "@/lib/image/types";
import type { ImageOcrOptions, ImageOcrProgress } from "@/lib/ocr/image-to-text";

export function ImageToText() {
  const inputRef = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const [source, setSource] = useState<ImageMetadata | null>(null);
  const [preview, setPreview] = useState("");
  const [download, setDownload] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImageOcrProgress | null>(null);
  const [rotation, setRotation] = useState<ImageOcrOptions["rotation"]>(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [text, setText] = useState("");
  const [hasResult, setHasResult] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const disabled = busy || loading;
  const characters = Array.from(text).length;
  const words = (text.match(/\S+/gu) ?? []).length;
  const filename = `${(source?.file.name.replace(/\.[^.]+$/, "") || "image").replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100)}-text.txt`;

  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    if (!source) { setPreview(""); return; }
    const url = URL.createObjectURL(source.file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  useEffect(() => {
    if (!text.trim()) { setDownload(""); return; }
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    setDownload(url); return () => URL.revokeObjectURL(url);
  }, [text]);
  async function choose(file?: File) {
    if (!file || locked.current) return;
    locked.current = true; setLoading(true); setError("");
    try {
      const prepared = await prepareOcrImage(file);
      if (!alive.current) return;
      setSource(prepared); setText(""); setHasResult(false); setRotation(0); setNotice("");
      setMessage("Image ready. Choose Extract Text to start.");
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "This image could not be opened."); }
    finally {
      locked.current = false;
      if (alive.current) setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  function reset() {
    if (locked.current) return;
    setSource(null); setText(""); setHasResult(false); setRotation(0); setAutoRotate(true);
    setNotice(""); setError(""); setMessage("Reset complete. Choose another image."); setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function extract() {
    if (!source || locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage(""); setNotice("");
    setProgress({ phase: "preparing" });
    const abort = new AbortController(); controller.current = abort;
    try {
      const { extractImageText } = await import("@/lib/ocr/image-to-text");
      const result = await extractImageText(source.file, { rotation, autoRotate }, value => { if (alive.current) setProgress(value); }, abort.signal);
      if (!alive.current) return;
      setText(result.text); setHasResult(true);
      setMessage(result.empty ? "No readable text was detected. Try a clearer or higher-resolution image." : "Text extracted. Review and edit it before use.");
      setNotice([result.warning, result.rotation ? `Read with ${result.rotation}° clockwise rotation.` : "", result.lowConfidence && !result.empty ? "Some text is uncertain. Check names, numbers, and important wording against your image." : ""].filter(Boolean).join(" "));
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "OCR could not read this image. Try again with a clearer image."); }
    finally {
      locked.current = false; controller.current = null;
      if (alive.current) { setBusy(false); setProgress(null); }
    }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMessage("Text copied to clipboard."); }
    catch { setError("Clipboard access is unavailable. Select the result text and copy it manually."); }
  }
  const stage = progress?.phase === "reading" ? "Reading your image…" : progress?.phase === "orientation" ? "Checking image orientation…" : "Preparing OCR engine for first use…";
  return <section className="image-ocr" aria-label="Image to Text workspace" onPaste={event => {
    const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/"));
    if (image && !disabled) { event.preventDefault(); void choose(image); }
  }}>
    <div className="image-ocr-heading"><div><span className="kicker">On-device OCR</span><h2>Turn pixels into editable text</h2></div><span className="image-ocr-language">English</span></div>
    <p className="image-ocr-privacy">Your image is processed on your device. OCR language data may be downloaded when needed, but your image is not uploaded.</p>
    <div className="image-ocr-columns"><div className="image-ocr-source">
      <ImageUploader inputRef={inputRef} inputId="image-ocr-file" busy={disabled} loading={loading} icon="Aa" showDropzone={!source} onSelect={file => void choose(file)} />
      {!source && <p className="image-ocr-help" tabIndex={0}>You can also focus this workspace and paste a copied image with Ctrl+V or ⌘V.</p>}
      {source && <>
        <div className="image-ocr-preview">{preview && <img src={preview} alt={`Selected image: ${source.file.name}`} style={{ transform: `rotate(${rotation}deg)` }} />}</div>
        <p className="image-ocr-filename"><strong>{source.file.name}</strong><small>{source.width.toLocaleString()} × {source.height.toLocaleString()} px · {source.format.toUpperCase()}</small></p>
        {Math.max(source.width, source.height) < 700 && <p className="image-ocr-help">This is a small image. We can upscale it gently, but a higher-resolution original will usually read better.</p>}
        <div className="image-ocr-actions"><Button variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>Replace image</Button><Button variant="ghost" disabled={disabled} onClick={reset}>Reset</Button></div>
      </>}
      <div className="image-ocr-options"><label>Image rotation<select value={rotation} disabled={disabled} onChange={e => setRotation(Number(e.target.value) as ImageOcrOptions["rotation"])}><option value={0}>Original orientation</option><option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>270° clockwise</option></select></label>
        <label className="image-ocr-check"><input type="checkbox" checked={autoRotate} disabled={disabled || rotation !== 0} onChange={e => setAutoRotate(e.target.checked)} />Check orientation when text reads poorly</label>
        <p className="image-ocr-help">For printed English text and screenshots. Handwriting, blur, skew, and complex tables may need manual correction.</p>
      </div>
      <Button size="lg" disabled={disabled || !source} onClick={() => void extract()}>{busy ? "Extracting…" : "Extract Text"}</Button>
      {busy && <div className="image-ocr-progress"><p>{stage}</p><progress aria-label={stage} max={1} value={progress?.progress} /><small>First use can take longer while the engine prepares.</small></div>}
    </div><div className="image-ocr-result">
      <div className="image-ocr-result-heading"><label htmlFor="image-ocr-text">Recognized text</label><span>{words.toLocaleString()} words · {characters.toLocaleString()} characters</span></div>
      <textarea id="image-ocr-text" value={text} disabled={busy} spellCheck={false} onChange={event => { setText(event.target.value); setMessage(""); }} placeholder="Your text will appear here. You can edit it before copying or downloading." />
      <div className="image-ocr-actions"><Button variant="secondary" disabled={disabled || !text.trim()} onClick={() => void copy()}>Copy text</Button>{download && !disabled ? <a className={buttonClassName({ variant: "secondary" })} href={download} download={filename}>Download TXT</a> : <Button variant="secondary" disabled>Download TXT</Button>}</div>
      {!hasResult && <p className="image-ocr-help">Line and paragraph breaks are kept where OCR detects them. The result is plain text, not a replica of the image layout.</p>}
    </div></div>
    <p className="image-ocr-status" role="status" aria-live="polite">{busy ? stage : loading ? "Checking your image…" : message}</p>
    {notice && <p className="image-ocr-help">{notice}</p>}
    {error && <p className="image-ocr-error" role="alert">{error}</p>}
    <p className="image-ocr-help">One JPG, PNG, or WebP at a time · 20 MB maximum · 24 megapixels · 10,000 px per side. No account or paid API.</p>
  </section>;
}
