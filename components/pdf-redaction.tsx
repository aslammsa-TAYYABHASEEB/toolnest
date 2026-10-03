"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { formatPdfBytes } from "@/lib/pdf/validation";
import { inspectRedactionPdf, openRedactionDocument } from "@/lib/redaction/inspect";
import { redactionPoint } from "@/lib/redaction/geometry";
import { runPdfRedaction, redactionResultMatches } from "@/lib/redaction/run";
import { redactionBrowserSupport, type RedactionInspection, type RedactionMark, type RedactionRectangle, type RedactionResult } from "@/lib/redaction/types";

type Gesture = { mode: "draw" | "move" | "resize"; start: readonly [number, number]; rect: RedactionRectangle; id?: string; next?: RedactionRectangle };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function PdfRedaction() {
  const input = useRef<HTMLInputElement>(null), canvas = useRef<HTMLCanvasElement>(null), scroll = useRef<HTMLDivElement>(null);
  const generation = useRef(0), controller = useRef<AbortController | null>(null), gesture = useRef<Gesture | null>(null);
  const history = useRef<readonly RedactionMark[][]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [source, setSource] = useState<File | null>(null), [inspection, setInspection] = useState<RedactionInspection | null>(null);
  const [status, setStatus] = useState<"idle" | "inspecting" | "ready" | "processing" | "complete" | "error">("idle");
  const [marks, setMarks] = useState<RedactionMark[]>([]), [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<RedactionRectangle | null>(null), [pageNumber, setPageNumber] = useState(1), [zoom, setZoom] = useState(1);
  const [availableWidth, setAvailableWidth] = useState(700);
  const [renderedPreview, setRenderedPreview] = useState<{ source: File; page: number; width: number } | null>(null);
  const [reviewing, setReviewing] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<RedactionResult | null>(null), [message, setMessage] = useState(""), [error, setError] = useState("");
  const download = usePdfDownload(), busy = status === "inspecting" || status === "processing";
  const geometry = inspection?.pages[pageNumber - 1];
  const pageMarks = marks.filter(mark => mark.page === pageNumber);
  const previewWidth = geometry ? Math.max(1, Math.min(availableWidth - 32, geometry.width * 1.35)) * zoom : 0;
  const previewReady = renderedPreview?.source === source && renderedPreview?.page === pageNumber && renderedPreview?.width === previewWidth;

  function invalidate() {
    generation.current++; controller.current?.abort(); download.clear(); setResult(null); setError("");
    setReviewing(false); setAcknowledged(false); setMessage("");
    if (inspection) setStatus("ready");
  }
  function changeMarks(next: RedactionMark[]) {
    invalidate(); history.current = [...history.current.slice(-19), marks]; setMarks(next);
  }
  function reset() {
    invalidate(); setSource(null); setInspection(null); setMarks([]); setSelected(null); setDraft(null);
    gesture.current = null; history.current = []; setPageNumber(1); setZoom(1); setStatus("idle");
    if (input.current) input.current.value = "";
  }
  useEffect(() => {
    function update() {
      const next = redactionBrowserSupport(); setSupported(next);
      if (!next) { generation.current++; controller.current?.abort(); download.clear(); setResult(null); setStatus("idle"); setReviewing(false); setAcknowledged(false); }
    }
    update(); window.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); generation.current++; controller.current?.abort(); };
    // This mount-only listener uses refs; every resize rechecks desktop eligibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(() => {
      // Measure the current viewport rather than a queued transient/hidden entry.
      const width = scroll.current?.clientWidth ?? 0;
      if (width > 32) setAvailableWidth(width);
    });
    observer.observe(scroll.current); return () => observer.disconnect();
  }, [inspection]);
  useEffect(() => { setSelected(null); }, [pageNumber]);

  useEffect(() => {
    setRenderedPreview(null);
    if (!source || !geometry || !canvas.current) return;
    const surface = canvas.current, previewController = new AbortController();
    let doc: Awaited<ReturnType<typeof openRedactionDocument>> | undefined;
    let cancelRender: (() => void) | undefined;
    const draw = async () => {
      try {
        doc = await openRedactionDocument(source);
        if (previewController.signal.aborted) return;
        const page = await doc.getPage(pageNumber);
        try {
          if (previewController.signal.aborted) return;
          let scale = previewWidth / geometry.width * Math.min(window.devicePixelRatio || 1, 2);
          scale = Math.min(scale, Math.sqrt(3_900_000 / (geometry.width * geometry.height)));
          const viewport = page.getViewport({ scale });
          surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height);
          const drawing = surface.getContext("2d");
          if (!drawing) throw new Error("The PDF preview could not be displayed.");
          const render = page.render({ canvas: surface, canvasContext: drawing, viewport, annotationMode: 0, intent: "display", background: "rgb(255,255,255)" });
          cancelRender = () => render.cancel();
          await render.promise;
          if (!previewController.signal.aborted) setRenderedPreview({ source, page: pageNumber, width: previewWidth });
        } finally { page.cleanup(); }
      } catch (caught) {
        if (!previewController.signal.aborted) {
          invalidate(); setStatus("error"); setError(caught instanceof Error ? caught.message : "The PDF preview could not be displayed.");
        }
      } finally { if (doc) await doc.loadingTask.destroy(); }
    };
    void draw();
    return () => { previewController.abort(); cancelRender?.(); surface.width = 0; surface.height = 0; };
    // Canvas and source geometry are stable for the duration of each preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, geometry, pageNumber, previewWidth]);

  async function selectPdf(files: File[]) {
    if (!supported || busy || !files[0]) return;
    reset(); const file = files[0], version = generation.current, abort = new AbortController();
    controller.current = abort; setSource(file); setStatus("inspecting"); setMessage("Checking whether this PDF can be redacted...");
    try {
      const next = await inspectRedactionPdf(file, { signal: abort.signal, isCurrent: () => generation.current === version });
      if (generation.current !== version) return;
      setInspection(next); setStatus("ready"); setMessage("Drag over each area you want removed. Unmarked visible information remains.");
    } catch (caught) {
      if (generation.current !== version) return;
      setStatus("error"); setMessage(""); setError(caught instanceof Error ? caught.message : "This PDF could not be checked.");
    } finally { if (input.current) input.current.value = ""; }
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!geometry || busy || !previewReady || event.button !== 0) return;
    const point = redactionPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), geometry);
    const element = (event.target as HTMLElement).closest<HTMLElement>("[data-redaction-id]");
    const mark = marks.find(mark => mark.id === element?.dataset.redactionId);
    invalidate();
    gesture.current = mark ? { mode: (event.target as HTMLElement).dataset.resize ? "resize" : "move", id: mark.id, start: point, rect: mark.rect }
      : { mode: "draw", start: point, rect: [point[0], point[1], point[0], point[1]] };
    setSelected(mark?.id ?? null); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current; if (!active || !geometry) return;
    const [x, y] = redactionPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), geometry);
    const [x0, y0, x1, y1] = active.rect;
    let rect: RedactionRectangle;
    if (active.mode === "draw") rect = [Math.min(active.start[0], x), Math.min(active.start[1], y), Math.max(active.start[0], x), Math.max(active.start[1], y)];
    else if (active.mode === "resize") rect = [x0, y0, clamp(x, x0 + 1, geometry.width), clamp(y, y0 + 1, geometry.height)];
    else { const dx = clamp(x - active.start[0], -x0, geometry.width - x1), dy = clamp(y - active.start[1], -y0, geometry.height - y1); rect = [x0 + dx, y0 + dy, x1 + dx, y1 + dy]; }
    active.next = rect; setDraft(rect);
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current; if (!active) return;
    gesture.current = null; setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.next && active.next[2] - active.next[0] >= 1 && active.next[3] - active.next[1] >= 1) {
      if (active.id) changeMarks(marks.map(mark => mark.id === active.id ? { ...mark, rect: active.next! } : mark));
      else { const id = crypto.randomUUID(); changeMarks([...marks, { id, page: pageNumber, rect: active.next }]); setSelected(id); }
    }
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, mark: RedactionMark) {
    if (busy || !geometry) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); changeMarks(marks.filter(m => m.id !== mark.id)); setSelected(null); return; }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    const [x0, y0, x1, y1] = mark.rect;
    let next: RedactionRectangle;
    if (event.altKey) next = [x0, y0, clamp(x1 + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0), x0 + 1, geometry.width), clamp(y1 + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0), y0 + 1, geometry.height)];
    else {
      const dx = clamp(event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0, -x0, geometry.width - x1);
      const dy = clamp(event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0, -y0, geometry.height - y1);
      next = [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
    }
    changeMarks(marks.map(m => m.id === mark.id ? { ...mark, rect: next } : m));
  }
  function undo() {
    const previous = history.current.at(-1); if (!previous || busy) return;
    invalidate(); history.current = history.current.slice(0, -1); setMarks([...previous]); setSelected(null);
  }
  async function process() {
    if (!source || !inspection || !supported || busy || !marks.length || !acknowledged || !previewReady || gesture.current) return;
    download.clear(); setResult(null); setError("");
    const version = generation.current, abort = new AbortController(); controller.current = abort; setStatus("processing");
    try {
      const next = await runPdfRedaction(source, marks, { signal: abort.signal, isCurrent: () => generation.current === version,
        onProgress: progress => setMessage(progress.phase === "inspect" ? "Rechecking PDF safety..." : progress.phase === "verify" ? `Checking generated page ${progress.page} of ${progress.total}...` : progress.phase === "build" ? "Creating the new image-only PDF..." : `Redacting page ${progress.page} of ${progress.total}...`) });
      if (generation.current !== version || abort.signal.aborted || !redactionResultMatches(next, source, marks)) return;
      setResult(next); download.replace(next.blob, next.filename); setStatus("complete"); setMessage("");
    } catch (caught) {
      if (generation.current !== version) return;
      download.clear(); setResult(null); setStatus("error"); setMessage(""); setError(caught instanceof Error ? caught.message : "Redaction or verification did not finish. No download is available.");
    }
  }
  function cancel() {
    invalidate(); setStatus(inspection ? "ready" : "idle"); setMessage("Cancelled. No downloadable copy was created.");
  }
  const downloadable = result && source && redactionResultMatches(result, source, marks) && supported && status === "complete";
  const style = (rect: RedactionRectangle) => geometry ? { left: rect[0] / geometry.width * 100 + "%", top: rect[1] / geometry.height * 100 + "%", width: (rect[2] - rect[0]) / geometry.width * 100 + "%", height: (rect[3] - rect[1]) / geometry.height * 100 + "%" } : {};

  return <section className="redaction-shell" aria-label="PDF redaction workspace">
    <Card className="redaction-disclosure"><span className="kicker">Before you begin</span><h2>A new image-only copy</h2><p>Every page becomes an image. The copy will not preserve selectable or searchable text, interactive links, forms, native vector scalability, or source metadata, attachments and comments.</p><p><strong>You choose what to remove.</strong> Unmarked visible information remains. ToolNest does not find sensitive information for you.</p><small>Files stay on your device. 10 pages maximum · 20 MiB input/output · fixed 200 DPI export.</small></Card>
    <p className="muted">Best on desktop Chrome or Edge. Performance depends on available memory. If processing stalls, close other tabs or try a shorter document.</p>
    {supported === false && <Card className="redaction-notice" role="status"><h3>Desktop Chrome or Edge required</h3><p>You can read about PDF Redaction here. Selecting, redacting and exporting PDFs requires desktop Chrome or Edge in this version. Use a desktop window at least 768 pixels wide.</p></Card>}
    {supported && <PdfUploader inputRef={input} inputId="pdf-redaction-file" multiple={false} busy={busy} compact={Boolean(source)} compactHeading="Replace PDF" heading="Choose a PDF to redact" buttonLabel={source ? "Choose another PDF" : "Choose PDF"} helperText="One PDF · 20 MiB maximum · up to 10 pages" onSelect={files => void selectPdf(files)} />}
    {source && <div className="redaction-file-row"><span><strong>{source.name}</strong><small>{formatPdfBytes(source.size)}{inspection ? ` · ${inspection.pages.length} pages` : ""}</small></span><Button variant="ghost" onClick={reset}>Reset</Button></div>}
    {inspection && supported && <div className="redaction-editor">
      <div className="redaction-toolbar"><div className="redaction-navigation"><Button variant="secondary" size="sm" disabled={busy || pageNumber === 1} onClick={() => setPageNumber(pageNumber - 1)}>Previous page</Button><label>Page <select aria-label="Page" disabled={busy} value={pageNumber} onChange={event => setPageNumber(Number(event.target.value))}>{inspection.pages.map(p => <option key={p.page} value={p.page}>{p.page}{marks.some(mark => mark.page === p.page) ? " - marked" : ""}</option>)}</select> of {inspection.pages.length}</label><Button variant="secondary" size="sm" disabled={busy || pageNumber === inspection.pages.length} onClick={() => setPageNumber(pageNumber + 1)}>Next page</Button></div><label>Zoom <select aria-label="Preview zoom" value={zoom} disabled={busy} onChange={event => setZoom(Number(event.target.value))}><option value={.75}>75%</option><option value={1}>Fit page</option><option value={1.25}>125%</option><option value={1.5}>150%</option></select></label></div>
      <p className="redaction-instructions" id="redaction-instructions">Drag a rectangle to mark an area. Drag a mark to move it; drag its bottom-right handle to resize. Keyboard: Tab to a mark, arrows to move, Alt + arrows to resize, Delete to remove.</p>
      <div ref={scroll} className="redaction-scroll" aria-busy={!previewReady}>
        <div className={`redaction-page${busy ? " is-busy" : ""}`} data-preview-ready={previewReady ? "true" : "false"} style={{ width: previewWidth, height: geometry ? previewWidth / geometry.width * geometry.height : 0 }} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setDraft(null); }} aria-label={`Page ${pageNumber} preview`} aria-describedby="redaction-instructions">
          <canvas ref={canvas} aria-label={`PDF page ${pageNumber}`} />
          {!previewReady && <span className="redaction-preview-loading">Loading page...</span>}
          {previewReady && pageMarks.map((mark, index) => <button type="button" key={mark.id} data-redaction-id={mark.id} className={`redaction-mark${selected === mark.id ? " is-selected" : ""}`} disabled={busy} style={style(gesture.current?.id === mark.id && draft ? draft : mark.rect)} aria-label={`Marked area ${index + 1} on page ${pageNumber}`} aria-pressed={selected === mark.id} onFocus={() => setSelected(mark.id)} onKeyDown={event => keyboard(event, mark)}><span>{index + 1}</span><i data-resize="true" aria-hidden="true" /></button>)}
          {draft && gesture.current?.mode === "draw" && <div className="redaction-draft" style={style(draft)} />}
        </div>
      </div>
      <div className="redaction-edit-actions"><span>{pageMarks.length} marked on this page · {marks.length} total</span><Button variant="ghost" size="sm" disabled={busy || !history.current.length} onClick={undo}>Undo last change</Button><Button variant="secondary" size="sm" disabled={busy || !selected} onClick={() => { changeMarks(marks.filter(mark => mark.id !== selected)); setSelected(null); }}>Delete selected mark</Button><Button disabled={busy || !marks.length || !previewReady || Boolean(draft)} onClick={() => setReviewing(true)}>Review marked areas</Button></div>
      {reviewing && <Card className="redaction-review"><span className="kicker">Review your selection</span><h3>{marks.length} marked {marks.length === 1 ? "area" : "areas"} across {new Set(marks.map(mark => mark.page)).size} {new Set(marks.map(mark => mark.page)).size === 1 ? "page" : "pages"}</h3><div className="redaction-review-pages">{inspection.pages.filter(p => marks.some(mark => mark.page === p.page)).map(p => <Button key={p.page} variant="secondary" size="sm" disabled={busy} onClick={() => setPageNumber(p.page)}>Page {p.page}: {marks.filter(mark => mark.page === p.page).length} marks</Button>)}</div><p>Every page will be rebuilt, including unmarked pages. Check that each rectangle covers the entire area you intend to remove.</p><label className="redaction-confirm"><input type="checkbox" disabled={busy} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>I understand the copy is image-only and unmarked visible information remains.</span></label><div className="redaction-action-row"><Button size="lg" disabled={busy || !acknowledged || !previewReady} onClick={() => void process()}>Redact &amp; Verify</Button></div></Card>}
    </div>}
    {busy && <div className="redaction-processing" role="status"><span>{message}</span><Button variant="secondary" onClick={cancel}>Cancel</Button></div>}
    {downloadable && result && <Card className="redaction-success"><span className="kicker">Supported checks passed</span><h3>Marked areas removed. The generated PDF passed ToolNest&apos;s supported redaction checks.</h3><p>Unmarked visible information remains. The original PDF is unchanged.</p><details><summary>What was checked</summary><ul>{result.verification.checks.map(check => <li key={check}>{check}</li>)}</ul></details><div className="redaction-action-row">{download.download && <a className={buttonClassName({ size: "lg" })} href={download.download.url} download={download.download.filename}>Download verified copy</a>}<small>{formatPdfBytes(result.blob.size)} · image-only PDF</small></div></Card>}
    <div className="pdf-status" aria-live="polite" aria-atomic="true">{!busy && message && <p>{message}</p>}{error && <p className="converter-error" role="alert">{error}</p>}</div>
  </section>;
}
