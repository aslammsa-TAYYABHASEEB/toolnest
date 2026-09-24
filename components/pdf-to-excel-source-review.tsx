"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { toPdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import {
  SOURCE_REVIEW_COPY,
  SOURCE_REVIEW_MAX_ZOOM,
  SOURCE_REVIEW_MIN_ZOOM,
  SOURCE_REVIEW_ZOOM_STEP,
  clampSourceReviewPixelRatio,
  clampSourceReviewZoom,
  sourceReviewBoxStyle,
  sourceReviewCellLabel,
  sourceReviewNoticeMessage,
  sourceReviewOcrConfidence,
  sourceReviewPageLabel,
  sourceReviewRotation,
  sourceReviewSourceLabel,
  type SourceReviewCell,
  type SourceReviewNotice,
} from "@/lib/pdf/source-review";
import type { PdfCellEvidence } from "@/lib/pdf/to-excel";

type SourceReviewViewerProps = {
  file: File;
  totalPages: number;
  evidence: PdfCellEvidence | null;
  notice: SourceReviewNotice;
  cell: SourceReviewCell | null;
  mergedAnchor: SourceReviewCell | null;
};

type ViewerStatus = "idle" | "loading" | "ready" | "error";

const isRenderCancelled = (caught: unknown) => caught instanceof Error &&
  (caught.name === "RenderingCancelledException" || caught.name === "AbortException");

/** Identity of the PDF whose page is currently painted into the retained canvas. */
const sourceFileKey = (target: File) => `${target.name}|${target.size}|${target.lastModified}`;

/**
 * Source Review viewer: owns the local PDF.js document lifecycle for one source file,
 * renders only the evidence page, and aligns a normalized bbox overlay with that render.
 */
export function PdfToExcelSourceReview({ file, totalPages, evidence, notice, cell, mergedAnchor }: SourceReviewViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<{ file: File; proxy: PDFDocumentProxy } | null>(null);
  const documentPromiseRef = useRef<{ file: File; promise: Promise<PDFDocumentProxy> } | null>(null);
  const documentGeneration = useRef(0);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const renderGeneration = useRef(0);
  const renderedKeyRef = useRef("");
  const zoomRef = useRef<{ key: string; user: boolean }>({ key: "", user: false });
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<ViewerStatus>("idle");
  const [message, setMessage] = useState("");
  const renderedFileRef = useRef("");
  const [renderedPageLabel, setRenderedPageLabel] = useState("");

  function releaseDocument(proxy: PDFDocumentProxy | null) {
    if (proxy) void proxy.loadingTask.destroy();
  }

  /** One cached document per active source file; switching files destroys the previous document. */
  async function ensureDocument(target: File, generation: number) {
    const existing = documentRef.current;
    if (existing && existing.file === target) return existing.proxy;
    const pending = documentPromiseRef.current;
    if (pending && pending.file === target) {
      const shared = await pending.promise;
      return generation === documentGeneration.current ? shared : null;
    }
    if (existing) {
      documentRef.current = null;
      renderedKeyRef.current = "";
      releaseDocument(existing.proxy);
    }
    const promise = loadPdfRendererDocument(target);
    documentPromiseRef.current = { file: target, promise };
    try {
      const proxy = await promise;
      if (generation !== documentGeneration.current) {
        releaseDocument(proxy);
        return null;
      }
      documentRef.current = { file: target, proxy };
      return proxy;
    } finally {
      if (documentPromiseRef.current?.promise === promise) documentPromiseRef.current = null;
    }
  }

  function setUserZoom(value: number) {
    zoomRef.current = { ...zoomRef.current, user: true };
    setZoom(clampSourceReviewZoom(value));
  }

  /** A replaced source file invalidates the retained preview: another PDF's page must never stay on screen. */
  useEffect(() => {
    renderedFileRef.current = "";
    renderedKeyRef.current = "";
    setRenderedPageLabel("");
    const cleared = canvasRef.current;
    if (cleared) { cleared.width = 0; cleared.height = 0; cleared.style.width = "0px"; cleared.style.height = "0px"; }
  }, [file]);

  useEffect(() => {
    const generation = ++renderGeneration.current;
    const isStale = () => generation !== renderGeneration.current;

    if (!evidence) {
      // A genuine empty cell keeps the already rendered page as context; the canvas is only
      // dropped when that page belongs to another file or the notice is not about emptiness.
      const keepsRenderedPage = notice === "empty-cell" && renderedFileRef.current === sourceFileKey(file);
      if (!keepsRenderedPage) {
        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
        renderedKeyRef.current = "";
        renderedFileRef.current = "";
        setRenderedPageLabel("");
        const cleared = canvasRef.current;
        if (cleared) { cleared.width = 0; cleared.height = 0; cleared.style.width = "0px"; cleared.style.height = "0px"; }
      }
      setStatus("idle");
      setMessage("");
      return;
    }

    setStatus("loading");
    setMessage("");
    void (async () => {
      try {
        const proxy = await ensureDocument(file, documentGeneration.current);
        if (!proxy || isStale()) return;
        const page = await proxy.getPage(evidence.page);
        if (isStale()) return;
        const rotation = sourceReviewRotation(page.rotate, evidence.rotation ?? 0);
        const pixelRatio = clampSourceReviewPixelRatio(window.devicePixelRatio);
        const key = `${file.name}|${file.size}|${file.lastModified}|${evidence.page}|${rotation}`;
        if (zoomRef.current.key !== key) zoomRef.current = { key, user: false };
        if (!zoomRef.current.user) {
          const container = scrollRef.current;
          const styles = container ? window.getComputedStyle(container) : null;
          const padding = styles ? Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight) : 0;
          const available = Math.max(0, (container?.clientWidth ?? 0) - (Number.isFinite(padding) ? padding : 0));
          if (available > 0) {
            const fitted = clampSourceReviewZoom(available / page.getViewport({ scale: 1, rotation }).width);
            if (Math.abs(fitted - zoom) > 0.005) { setZoom(fitted); return; }
          }
        }

        const renderKey = `${key}|${zoom}|${pixelRatio}`;
        if (renderedKeyRef.current === renderKey) { setStatus("ready"); return; }

        const cssViewport = page.getViewport({ scale: zoom, rotation });
        const canvas = canvasRef.current;
        if (!canvas) { setStatus("idle"); return; }
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("The browser could not create the canvas needed to show the source page.");

        renderTaskRef.current?.cancel();
        renderTaskRef.current = null;
        const bitmapWidth = Math.max(1, Math.round(cssViewport.width * pixelRatio));
        const bitmapHeight = Math.max(1, Math.round(cssViewport.height * pixelRatio));
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = "rgb(255, 255, 255)";
        context.fillRect(0, 0, bitmapWidth, bitmapHeight);

        const task = page.render({
          canvas,
          canvasContext: context,
          viewport: page.getViewport({ scale: zoom * pixelRatio, rotation }),
          background: "rgb(255, 255, 255)",
        });
        renderTaskRef.current = task;
        const previousPage = pageRef.current;
        pageRef.current = page;
        if (previousPage && previousPage !== page) previousPage.cleanup();

        await task.promise;
        if (isStale()) return;
        renderedKeyRef.current = renderKey;
        renderedFileRef.current = sourceFileKey(file);
        setRenderedPageLabel(sourceReviewPageLabel(evidence.page, totalPages));
        setStatus("ready");
      } catch (caught) {
        if (isStale() || isRenderCancelled(caught)) return;
        setMessage(toPdfProcessingError(caught, SOURCE_REVIEW_COPY.error).message);
        setStatus("error");
      }
    })();
  }, [file, evidence, notice, zoom]);

  useEffect(() => () => {
    renderGeneration.current += 1;
    documentGeneration.current += 1;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    pageRef.current?.cleanup();
    pageRef.current = null;
    const current = documentRef.current;
    documentRef.current = null;
    releaseDocument(current?.proxy ?? null);
  }, []);

  const noticeMessage = sourceReviewNoticeMessage({ cell, evidence, notice, mergedAnchor })
    ?? (!evidence ? SOURCE_REVIEW_COPY.noSource : null);
  const confidence = evidence ? sourceReviewOcrConfidence(evidence) : null;
  // A genuine empty cell keeps the retained page visible and can never show a highlight.
  const showPreview = Boolean(evidence) || notice === "empty-cell";
  const canvasLabel = evidence
    ? `${SOURCE_REVIEW_COPY.location}: ${sourceReviewPageLabel(evidence.page, totalPages)}`
    : renderedPageLabel
      ? `${SOURCE_REVIEW_COPY.location}: ${renderedPageLabel}`
      : SOURCE_REVIEW_COPY.location;

  return <div className="pdf-excel-source-viewer">
    <div className="pdf-excel-source-toolbar">
      <span className="pdf-excel-source-toolbar-label">{SOURCE_REVIEW_COPY.location}</span>
      <div className="pdf-excel-source-zoom">
        <Button variant="ghost" size="sm" aria-label="Zoom out" disabled={!evidence || zoom <= SOURCE_REVIEW_MIN_ZOOM}
          onClick={() => setUserZoom(zoom - SOURCE_REVIEW_ZOOM_STEP)}>{"−"}</Button>
        <span className="pdf-excel-source-zoom-value">{`${Math.round(zoom * 100)}%`}</span>
        <Button variant="ghost" size="sm" aria-label="Zoom in" disabled={!evidence || zoom >= SOURCE_REVIEW_MAX_ZOOM}
          onClick={() => setUserZoom(zoom + SOURCE_REVIEW_ZOOM_STEP)}>+</Button>
      </div>
    </div>

    {noticeMessage && <p className="pdf-excel-source-notice">{noticeMessage}
      {notice === "merged-subordinate" && mergedAnchor
        ? ` Merged source region: ${sourceReviewCellLabel(mergedAnchor)}.`
        : ""}</p>}

    {showPreview && <>
      <div className="pdf-excel-source-viewport" ref={scrollRef}>
        <div className="pdf-excel-source-page">
          <canvas ref={canvasRef} className="pdf-excel-source-canvas" role="img" aria-label={canvasLabel} />
          {evidence && <span className="pdf-excel-source-highlight" aria-hidden="true" style={sourceReviewBoxStyle(evidence.bbox)} />}
        </div>
      </div>
      {status === "loading" && <p className="pdf-excel-source-status" role="status" aria-live="polite">{SOURCE_REVIEW_COPY.loading}</p>}
      {status === "error" && <p className="pdf-excel-source-status converter-error" role="alert">
        <strong>{SOURCE_REVIEW_COPY.error}</strong> {message}</p>}
    </>}

    {evidence && <div className="pdf-excel-source-details" aria-live="polite">
      <p className="pdf-excel-source-details-lead">{sourceReviewPageLabel(evidence.page, totalPages)}</p>
      <p className="pdf-excel-source-details-lead">{sourceReviewSourceLabel(evidence)}</p>
      {confidence && <p className="pdf-excel-source-details-lead">{confidence}</p>}
      {cell && <p className="pdf-excel-source-details-cell">{sourceReviewCellLabel(cell)}</p>}
      <p className="pdf-excel-source-details-label">{SOURCE_REVIEW_COPY.sourceText}</p>
      <p className="pdf-excel-source-text">{evidence.sourceText}</p>
    </div>}
  </div>;
}
