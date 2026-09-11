"use client";

import { useEffect, useRef, useState } from "react";
import { PdfUploader } from "@/components/pdf-tool/pdf-uploader";
import { Button, buttonClassName } from "@/components/ui/button";
import { usePdfDownload } from "@/lib/pdf/use-pdf-download";
import { renderPdfRotationThumbnails } from "@/lib/pdf/thumbnails";
import { formatPdfBytes } from "@/lib/pdf/validation";
import { ORGANIZER_PAGE_LIMIT, ORGANIZER_UNDO_LIMIT, prepareOrganizerSource, sourceOrganizerPages, moveOrganizerPage, changeOrganizerPages, insertOrganizerPages, exportOrganizedPdf, type OrganizerPage, type OrganizerSource, type InsertPosition } from "@/lib/pdf/organize";

const GRID_SIZE = 24;
const newId = () => crypto.randomUUID();
const previewKey = (p: OrganizerPage) => `${p.sourceId}:${p.pageIndex}`;

export function PdfOrganize() {
  const inputRef = useRef<HTMLInputElement>(null);
  const insertRef = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const [sources, setSources] = useState<OrganizerSource[]>([]);
  const [pages, setPages] = useState<OrganizerPage[]>([]);
  const [history, setHistory] = useState<OrganizerPage[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<InsertPosition>("end");
  const [batch, setBatch] = useState(0);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewWarning, setPreviewWarning] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const download = usePdfDownload();
  const lastBatch = Math.max(0, Math.ceil(pages.length / GRID_SIZE) - 1);
  const visibleBatch = Math.min(batch, lastBatch);
  const visible = pages.slice(visibleBatch * GRID_SIZE, (visibleBatch + 1) * GRID_SIZE);
  const requests = JSON.stringify([...new Map(visible.map(p => [previewKey(p), { sourceId: p.sourceId, pageIndex: p.pageIndex }])).values()]);
  const selectedCount = pages.filter(p => selected.has(p.id)).length;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    setPreviews({}); setPreviewWarning("");
    const requested: Pick<OrganizerPage, "sourceId" | "pageIndex">[] = JSON.parse(requests);
    if (!requested.length) { setPreviewBusy(false); return; }
    setPreviewBusy(true);
    void (async () => {
      const next: Record<string, string> = {};
      for (const source of sources) {
        const numbers = requested.filter(p => p.sourceId === source.id).map(p => p.pageIndex + 1);
        if (!numbers.length || cancelled) continue;
        try {
          const thumbnails = await renderPdfRotationThumbnails(source.file, numbers);
          if (cancelled) return;
          for (const thumbnail of thumbnails) {
            const url = URL.createObjectURL(thumbnail.blob); urls.push(url);
            next[`${source.id}:${thumbnail.pageNumber - 1}`] = url;
          }
        } catch {
          if (!cancelled) setPreviewWarning("Some previews are unavailable. Original page labels still work, and export uses the original PDF content.");
        }
      }
      if (!cancelled) { setPreviews(next); setPreviewBusy(false); }
    })();
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [requests, sources]);

  function commit(next: OrganizerPage[], announcement: string) {
    if (locked.current || next === pages) return;
    setHistory(h => [...h, pages].slice(-ORGANIZER_UNDO_LIMIT));
    setPages(next); setSelected(s => new Set([...s].filter(id => next.some(p => p.id === id))));
    download.clear(); setError(""); setMessage(announcement);
  }

  async function openFile(files: File[], insert = false) {
    const file = files[0]; if (!file || locked.current) return;
    locked.current = true; setBusy(true); setError(""); setMessage(insert ? "Preparing inserted pages…" : "Opening PDF…");
    try {
      const source = await prepareOrganizerSource(file, newId(), insert ? sources : []);
      const added = sourceOrganizerPages(source, newId);
      const next = insert ? insertOrganizerPages(pages, added, selected, position) : added;
      if (!alive.current) return;
      if (insert) { setHistory(h => [...h, pages].slice(-ORGANIZER_UNDO_LIMIT)); setSources(s => [...s, source]); }
      else { setSources([source]); setHistory([]); setBatch(0); }
      setPages(next); setSelected(new Set(insert ? added.map(p => p.id) : [])); download.clear();
      if (insert) setBatch(Math.floor(next.findIndex(p => p.id === added[0].id) / GRID_SIZE));
      setMessage(`${source.pageCount} ${insert ? "pages inserted" : "pages ready"}.`);
    } catch (e) {
      if (alive.current) { setError(e instanceof Error ? e.message : "Could not open the PDF. Your existing session is unchanged."); setMessage(""); }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      if (insertRef.current) insertRef.current.value = "";
    }
  }

  function action(kind: "delete" | "clockwise" | "counterclockwise" | "duplicate", ids = selected) {
    try { commit(changeOrganizerPages(pages, ids, kind, newId), `${ids.size} page(s): ${kind}. Undo is available.`); }
    catch (e) { setError(e instanceof Error ? e.message : "The page action could not be completed."); }
  }
  function move(id: string, index: number) {
    commit(moveOrganizerPage(pages, id, index), `Page moved to position ${index + 1}.`);
    setBatch(Math.floor(Math.max(0, index) / GRID_SIZE));
  }
  function undo() {
    if (locked.current || !history.length) return;
    setPages(history[history.length - 1]); setHistory(h => h.slice(0, -1)); setSelected(new Set());
    download.clear(); setError(""); setMessage("Last edit undone.");
  }
  function reset() {
    if (locked.current || !sources.length) return;
    commit(sourceOrganizerPages(sources[0], newId), "Original document restored. Undo can restore your edits.");
    setSelected(new Set()); setBatch(0);
  }
  function clear() {
    if (locked.current) return;
    setPages([]); setSources([]); setHistory([]); setSelected(new Set()); setBatch(0);
    download.clear(); setError(""); setMessage("Session cleared. Choose another PDF.");
  }
  async function exportPdf(extract = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); download.clear(); setMessage("Preparing PDF…");
    try {
      const result = await exportOrganizedPdf(sources, extract ? pages.filter(p => selected.has(p.id)) : pages, extract, (done, total) => {
        if (alive.current) setMessage(`Copying original pages: ${done} of ${total}…`);
      });
      if (alive.current) { download.replace(result.blob, result.filename); setMessage(`${result.pageCount} pages ready · ${formatPdfBytes(result.size)}. Download your ${extract ? "extracted" : "organized"} PDF below.`); }
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : "Export failed. Your session is unchanged."); setMessage(""); } }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }

  return <div className="organizer" aria-busy={busy}>
    <div className="organizer-intro"><h2>Arrange your pages</h2><p>Your PDF stays on this device. Original pages—not preview images—are exported.</p></div>
    {!sources.length ? <PdfUploader inputRef={inputRef} inputId="organize-file" busy={busy} multiple={false} heading="Drop a PDF to organize" buttonLabel="Choose PDF" helperText={`100 MB total · ${ORGANIZER_PAGE_LIMIT} pages per session`} onSelect={files => void openFile(files)} /> : <>
      <div className="organizer-document"><div><strong>{sources[0].file.name}</strong><span>{pages.length} pages · {selectedCount} selected · {sources.length} source file(s)</span></div>
        <div className="organizer-actions"><Button variant="ghost" size="sm" disabled={busy || !history.length} onClick={undo}>Undo</Button><Button variant="secondary" size="sm" disabled={busy} onClick={reset}>Reset document</Button><Button variant="ghost" size="sm" disabled={busy} onClick={clear}>Clear session</Button></div>
      </div>
      <div className="organizer-toolbar" aria-label="Selected page actions">
        <div className="organizer-actions"><Button variant="secondary" size="sm" disabled={busy || !pages.length} onClick={() => setSelected(new Set(pages.map(p => p.id)))}>Select all</Button><Button variant="ghost" size="sm" disabled={busy || !selectedCount} onClick={() => setSelected(new Set())}>Clear selection</Button></div>
        <div className="organizer-actions"><Button variant="secondary" size="sm" disabled={busy || !selectedCount} onClick={() => action("counterclockwise")}>↶ Rotate left</Button><Button variant="secondary" size="sm" disabled={busy || !selectedCount} onClick={() => action("clockwise")}>↷ Rotate right</Button><Button variant="secondary" size="sm" disabled={busy || !selectedCount} onClick={() => action("duplicate")}>Duplicate</Button><Button variant="secondary" size="sm" disabled={busy || !selectedCount} onClick={() => action("delete")}>Delete selected</Button></div>
      </div>
      <details className="organizer-insert"><summary>Insert pages from another PDF</summary><p>Before/after uses the first selected page in the current order. Without a selection, pages append to the end.</p>
        <label>Insert position <select value={position} disabled={busy} onChange={e => setPosition(e.target.value as InsertPosition)}><option value="end">Append to end</option><option value="before">Before first selected page</option><option value="after">After first selected page</option></select></label>
        <PdfUploader inputRef={insertRef} inputId="organize-insert" compact busy={busy} multiple={false} compactHeading="Insert another PDF" buttonLabel="Choose PDF to insert" helperText="100 MB and 500 imported pages total; source files remain available for undo." onSelect={files => void openFile(files, true)} />
      </details>
      <p className="organizer-help">Drag the ⠿ handle to a new position, or use Previous/Next on a page. Arrow keys on a handle also move it. Changes can be undone for the last {ORGANIZER_UNDO_LIMIT} edits.</p>
      {previewWarning && <p role="status">{previewWarning}</p>}
      {!pages.length && <p className="organizer-empty">No pages remain. Undo, reset the document, or insert a PDF before exporting.</p>}
      <ol className="organizer-grid" aria-label="PDF pages in output order" start={visibleBatch * GRID_SIZE + 1}>
        {visible.map((p, slot) => {
          const index = visibleBatch * GRID_SIZE + slot;
          const source = sources.find(s => s.id === p.sourceId)!;
          return <li key={p.id} data-organizer-page={p.id} className={`organizer-page${selected.has(p.id) ? " is-selected" : ""}${dragTarget === p.id ? " is-target" : ""}`}>
            <div className="organizer-card-top"><span>Page {index + 1}</span><button type="button" className="organizer-handle" disabled={busy} aria-label={`Move page ${index + 1}; use arrow keys or drag`} onKeyDown={e => {
              if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(e.key)) { e.preventDefault(); move(p.id, Math.min(pages.length - 1, Math.max(0, index + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1)))); }
            }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDragTarget(p.id); }} onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              setDragTarget(document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-organizer-page]")?.dataset.organizerPage ?? null);
            }} onPointerUp={e => {
              const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-organizer-page]")?.dataset.organizerPage;
              if (target) move(p.id, pages.findIndex(item => item.id === target));
              setDragTarget(null);
            }} onPointerCancel={() => setDragTarget(null)}>⠿</button></div>
            <button type="button" className="organizer-select" aria-label={`Select page ${index + 1}, original page ${p.pageIndex + 1} of ${source.file.name}`} aria-pressed={selected.has(p.id)} disabled={busy} onClick={() => { setSelected(s => { const next = new Set(s); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; }); }}>
              <span className="organizer-preview">{previews[previewKey(p)] ? <img src={previews[previewKey(p)]} alt="" draggable={false} style={{ transform: `rotate(${p.rotation}deg)` }} /> : <span>{previewBusy ? "Loading preview…" : "Preview unavailable"}</span>}</span>
              <span className="organizer-source" title={source.file.name}>{source.file.name}</span><small>Original page {p.pageIndex + 1} · {p.rotation ? `+${p.rotation}°` : "No added rotation"}</small><strong>{selected.has(p.id) ? "✓ Selected" : "Select page"}</strong>
            </button>
            <div className="organizer-card-actions"><button type="button" disabled={busy || index === 0} aria-label={`Move page ${index + 1} earlier`} onClick={() => move(p.id, index - 1)}>Previous</button><button type="button" disabled={busy || index === pages.length - 1} aria-label={`Move page ${index + 1} later`} onClick={() => move(p.id, index + 1)}>Next</button><button type="button" disabled={busy} aria-label={`Rotate page ${index + 1} clockwise`} onClick={() => action("clockwise", new Set([p.id]))}>↷</button></div>
          </li>;
        })}
      </ol>
      {pages.length > GRID_SIZE && <nav className="organizer-pagination" aria-label="Page preview batches"><Button variant="secondary" disabled={busy || visibleBatch === 0} onClick={() => setBatch(visibleBatch - 1)}>Previous previews</Button><span>Pages {visibleBatch * GRID_SIZE + 1}–{Math.min(pages.length, (visibleBatch + 1) * GRID_SIZE)} of {pages.length}</span><Button variant="secondary" disabled={busy || visibleBatch === lastBatch} onClick={() => setBatch(visibleBatch + 1)}>Next previews</Button></nav>}
      <div className="organizer-export"><Button disabled={busy || !pages.length} onClick={() => void exportPdf()}>Create organized PDF</Button><Button variant="secondary" disabled={busy || !selectedCount} onClick={() => void exportPdf(true)}>Extract selected ({selectedCount})</Button></div>
    </>}
    <p role="status" aria-live="polite" className="organizer-status">{message}</p>
    {error && <p role="alert" className="organizer-error">{error}</p>}
    {download.download && <a className={buttonClassName()} href={download.download.url} download={download.download.filename}>Download {download.download.filename}</a>}
    <p className="organizer-limits">Session edits do not change your original files. Interactive forms, bookmarks, and digital signatures may not survive page copying. Use unsigned, non-interactive PDFs when those features matter.</p>
  </div>;
}
