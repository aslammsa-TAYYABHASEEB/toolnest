"use client";
import { useEffect, useRef, useState } from "react";
import type { RenderTask } from "pdfjs-dist";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import type { Evidence } from "@/lib/batch-verification/types";

/** Dedicated read-only preview; no table UI, no inferred glyph-level locations. */
export function BatchDocumentEvidence({ file, page, keyEvidence, fieldEvidence }: {
  file: File; page: number | null; keyEvidence: readonly Evidence[]; fieldEvidence: readonly Evidence[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState<{ file: File; page: number; width: number; height: number } | null>(null);
  const [error,setError] = useState<{ file: File; page: number; text: string } | null>(null);
  const ready = Boolean(page && painted?.file === file && painted.page === page);
  useEffect(() => {
    let stale = false, task: RenderTask | undefined;
    setPainted(null); setError(null);
    if (!page) return;
    void (async () => {
      const document = await loadPdfRendererDocument(file);
      try {
        if (stale) return;
        const source = await document.getPage(page);
        try {
          const view = source.getViewport({scale:1});
          const ratio = Math.min(2,window.devicePixelRatio || 1);
          const scale = Math.min(1,600/view.width,Math.sqrt(4_000_000/(view.width*view.height))/ratio);
          const viewport = source.getViewport({scale:scale*ratio});
          const surface = canvas.current;
          if (stale || !surface) return;
          surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height);
          const drawing = surface.getContext("2d"); if (!drawing) throw new Error("Page preview is unavailable.");
          task = source.render({canvas:surface,canvasContext:drawing,viewport,background:"rgb(255,255,255)"});
          await task.promise;
          if (!stale) setPainted({file,page,width:view.width*scale,height:view.height*scale});
        } finally { source.cleanup(); }
      } finally { await document.loadingTask.destroy(); }
    })().catch(caught => { if (!stale) setError({file,page,text:caught instanceof Error ? caught.message : "Page preview failed."}); });
    return () => { stale = true; task?.cancel(); };
  },[file,page]);
  const currentError = error?.file === file && error.page === page ? error.text : null;
  return <div className="batch-pdf-review" data-preview-page={ready ? page : ""} data-preview-ready={ready}>
    {!page ? <p>No assigned output page. No source location is invented.</p> : <>
      <p>PDF page {page} · key in amber, selected field in purple</p>
      {!ready && !currentError && <p role="status">Loading actual PDF page…</p>}
      {currentError && <p role="alert">{currentError}</p>}
    </>}
    <div className="batch-page" style={{display:ready?"block":"none",width:painted?.width,height:painted?.height}}>
      <canvas ref={canvas} aria-label={page ? `Actual PDF page ${page}` : "PDF preview"} />
      {ready && [...keyEvidence.map(e=>({e,kind:"key"})),...fieldEvidence.map(e=>({e,kind:"field"}))].filter(({e})=>e.page===page).flatMap(({e,kind},i)=>e.boxes.map((box,j)=><span key={`${kind}-${i}-${j}`} className={`batch-highlight is-${kind}`} style={{left:`${box.left*100}%`,top:`${box.top*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}} />))}
    </div>
    {ready && <small>Highlights cover original text items, including the label and observed value; they are not exact glyph boundaries.</small>}
  </div>;
}
