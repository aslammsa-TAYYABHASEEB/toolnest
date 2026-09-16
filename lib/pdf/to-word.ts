import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { createBrowserOcrWorker } from "@/lib/ocr/worker";
import {
  createOrientationProbeCanvas,
  renderPageToCanvasForOcr,
  rotateCanvas,
} from "@/lib/pdf/ocr-render";
import {
  MAX_PDF_TO_WORD_SOURCE_PAGES,
  MAX_PDF_TO_WORD_OUTPUT_SIZE,
} from "@/lib/pdf/types";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";
import { extractWordPage } from "./word-extraction";
import { type WordPage } from "./word-layout";
import {recognitionLines,buildOcrWordPage,finalizeOcrPages,decorativeBand,fitOcrText,type OcrLayoutLine} from './ocr-word-layout';

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new PdfProcessingError(
      "word-conversion-failed",
      "Word conversion was cancelled.",
    );
  }
}


export type WordProgressPhase =
  | "extracting"
  | "ocr"
  | "ocr-download"
  | "ocr-orient";

// Pages with fewer non-whitespace characters than this have no usable text
// layer and are routed to on-device OCR.
const OCR_MIN_PAGE_CHARS = 25;

// Render scale bounds for OCR: the canvas is sized so a scan's detail is
// preserved (large scanned pages render up to ~4.2x â‰ˆ 300 DPI) while keeping
// canvas memory bounded on smaller pages.
const OCR_MIN_RENDER_SCALE = 2.8;
const OCR_MAX_RENDER_SCALE = 4.2;
const OCR_TARGET_LONG_EDGE_PX = 3000;

// Minimum OSD orientation_confidence before we trust a non-zero angle.
const OCR_ROTATION_MIN_CONFIDENCE = 5;
// A very weak non-zero probe can point at the wrong quadrant. Recheck those
// rare cases at full size before spending OCR passes on the wrong candidates.
const OCR_ROTATION_RECHECK_CONFIDENCE = 1;
// A recognize() pass is considered "poor" (likely still rotated/garbled) when
// it yields fewer than this many 3+ letter words on a full scanned page.
const OCR_MIN_GOOD_WORDS = 12;
const OCR_STRONG_RESULT_MIN_CONFIDENCE = 65;
const OCR_STRONG_RESULT_MIN_LINES = 3;

type OcrLoggerMessage = { status?: string; progress?: number };

type OcrRecognition = {
  layout: OcrLayoutLine[];
  plainText: string;
  confidence: number;
};

export type PdfOcrEngine = {
  setProgressPage: (pageNumber: number, pageCount: number) => void;
  detect: (image: HTMLCanvasElement) => Promise<{
    degrees: number;
    confidence: number;
  }>;
  recognize: (image: HTMLCanvasElement) => Promise<OcrRecognition>;
  terminate: () => Promise<void>;
};

function ocrAlphaWords(recognition: OcrRecognition): number {
  return (recognition.plainText.match(/[A-Za-z]{3,}/g) ?? []).length;
}

function isStrongRecognition(recognition: OcrRecognition): boolean {
  const readableLines = recognition.layout.filter(
    line => /[A-Za-z]{3,}/.test(line.text) && line.x1 > line.x0 && line.y1 > line.y0,
  ).length;
  return (
    recognition.confidence >= OCR_STRONG_RESULT_MIN_CONFIDENCE &&
    ocrAlphaWords(recognition) >= OCR_MIN_GOOD_WORDS &&
    readableLines >= OCR_STRONG_RESULT_MIN_LINES
  );
}

/**
 * Create a shared Tesseract worker for the whole conversion (one spawn per
 * document instead of per page). Worker + wasm core are served from
 * public/tesseract/ (copied by scripts/copy-pdf-assets.js); language data is
 * fetched lazily from Tesseract's default CDN.
 */
export async function createPdfOcrEngine(
  onProgress: ((
    current: number,
    total: number,
    phase?: WordProgressPhase,
    subProgress?: number,
  ) => void) | undefined,
  pageNumber: number,
  pageCount: number,
): Promise<PdfOcrEngine> {
  let currentPage = pageNumber;
  let currentTotal = pageCount;
  onProgress?.(pageNumber, pageCount, "ocr-download");
  const logger = (message: OcrLoggerMessage) => {
    if (typeof message.progress !== "number") return;
    if (
      message.status === "loading tesseract core" ||
      message.status === "loading language traineddata" ||
      message.status === "loading osd traineddata"
    ) {
      onProgress?.(currentPage, currentTotal, "ocr-download", message.progress);
    } else if (message.status === "recognizing text") {
      onProgress?.(currentPage, currentTotal, "ocr", message.progress);
    }
  };
  // Recognition runs on the fast LSTM engine (best quality + block geometry).
  // Orientation detection relies on Tesseract's OSD, which is only available on
  // the legacy (non-LSTM) engine, so it gets its own dedicated worker that
  // loads the OSD traineddata once per conversion.
  const recWorker = await createBrowserOcrWorker("eng", logger);
  let osdWorker;
  try { osdWorker = await createBrowserOcrWorker("osd", logger); }
  catch (error) { await recWorker.terminate(); throw error; }
  return {
    setProgressPage(nextPage, nextTotal) {
      currentPage = nextPage;
      currentTotal = nextTotal;
    },
    async detect(image) {
      const result = await osdWorker.detect(image);
      const data = result?.data ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const record = data as any;
      return {
        degrees: (record.orientation_degrees ?? 0) as number,
        confidence: (record.orientation_confidence ?? 0) as number,
      };
    },
    async recognize(image): Promise<OcrRecognition> {
      // v7's one-shot recognize() API does not accept output options; on a
      // worker the third argument selects result fields. Without
      // { blocks: true } data.blocks is always null and only flat data.text
      // is returned (no bbox/layout info).
      const { data } = await recWorker.recognize(image, {}, { blocks: true });
      const plainText = typeof data?.text === "string" ? data.text : "";
      return {
        layout: recognitionLines(data),
        plainText,
        confidence: typeof data?.confidence === "number" ? data.confidence : 0,
      };
    },
    async terminate() {
      await Promise.all([
        recWorker.terminate(),
        osdWorker.terminate(),
      ]);
    },
  };
}

/** Recognize a scanned page and preserve its measured layout. */
export async function recognizePdfPage(
  page: import("pdfjs-dist").PDFPageProxy,
  pageNumber: number,
  pageCount: number,
  engine: PdfOcrEngine,
  onProgress: ((
    current: number,
    total: number,
    phase?: WordProgressPhase,
    subProgress?: number,
  ) => void) | undefined,
  signal?: AbortSignal,
  includeDecorativeText = false,
): Promise<{
  page: WordPage;
  rotation: 0 | 90 | 180 | 270;
  ocrLines: OcrLayoutLine[];
  ocrPixelWidth: number;
  ocrPixelHeight: number;
}> {
  engine.setProgressPage(pageNumber, pageCount);
  // Adaptive render scale: aim for ~3000px on the long edge so dense scans
  // keep enough detail, clamped so small pages aren't over-scaled and huge
  // pages stay within bounded canvas memory.
  const baseViewport = page.getViewport({ scale: 1 });
  const longEdge = Math.max(baseViewport.width, baseViewport.height);
  const scale = Math.min(
    OCR_MAX_RENDER_SCALE,
    Math.max(OCR_MIN_RENDER_SCALE, OCR_TARGET_LONG_EDGE_PX / longEdge),
  );

  const canvas = await renderPageToCanvasForOcr(page, scale);
  const rotatedCanvases: HTMLCanvasElement[] = [];
  let orientationProbe: HTMLCanvasElement | null = null;

  type OcrCandidate = {
    deg: number;
    image: HTMLCanvasElement;
    recognition: OcrRecognition;
    words: number;
  };
  let chosen: OcrCandidate | null = null;

  try {
    // Recognize a rotation (tracking canvases for cleanup) and return the
    // resulting word count so candidates can be compared.
    const evaluate = async (deg: number): Promise<OcrCandidate> => {
      const image =
        deg === 0 ? canvas : rotateCanvas(canvas, deg as 0 | 90 | 180 | 270);
      if (deg !== 0) rotatedCanvases.push(image);
      const recognition = await engine.recognize(image);
      assertNotAborted(signal);
      return { deg, image, recognition, words: ocrAlphaWords(recognition) };
    };
    const keepBetter = (best: OcrCandidate | null, cand: OcrCandidate) =>
      !best || cand.words > best.words ? cand : best;

    // OSD needs page-level line direction, not full OCR glyph detail. Detect on
    // a bounded probe, then run recognition only on the unchanged full-quality
    // canvas. Candidate acceptance and conservative fallbacks remain unchanged.
    onProgress?.(pageNumber, pageCount, "ocr-orient");
    orientationProbe = createOrientationProbeCanvas(canvas);
    let detection = await engine.detect(orientationProbe);
    assertNotAborted(signal);

    let quadrant = Math.round(detection.degrees / 90) % 4;
    let detected = ((((quadrant % 4) + 4) % 4) * 90) as 0 | 90 | 180 | 270;
    if (
      orientationProbe !== canvas &&
      detected !== 0 &&
      detection.confidence < OCR_ROTATION_RECHECK_CONFIDENCE
    ) {
      detection = await engine.detect(canvas);
      assertNotAborted(signal);
      quadrant = Math.round(detection.degrees / 90) % 4;
      detected = ((((quadrant % 4) + 4) % 4) * 90) as 0 | 90 | 180 | 270;
    }
    const confident = detection.confidence >= OCR_ROTATION_MIN_CONFIDENCE;
    const opposite = ((detected + 180) % 360) as 0 | 90 | 180 | 270;

    if (detected === 0) {
      chosen = await evaluate(0);
      if (chosen.words < OCR_MIN_GOOD_WORDS) {
        for (const deg of [180, 90, 270] as const) {
          chosen = keepBetter(chosen, await evaluate(deg));
        }
      }
    } else {
      chosen = await evaluate(detected);
      if (!(confident && chosen.words >= OCR_MIN_GOOD_WORDS) && !isStrongRecognition(chosen.recognition)) {
        const tried = new Set<number>([detected]);
        for (const deg of [opposite, 0] as const) {
          if (tried.has(deg)) continue;
          tried.add(deg);
          chosen = keepBetter(chosen, await evaluate(deg));
        }
      }
    }

    // Table detection first (same shared column-boundary concept as the
    // text-PDF path), then paragraph grouping for the remaining prose
    // lines. Detection is deliberately conservative: anything ambiguous
    // stays prose.
    const recognition = chosen.recognition;
    const image=chosen.image;
    const swap=chosen.deg===90||chosen.deg===270;
    const pixelWidth=swap?canvas.height:canvas.width,pixelHeight=swap?canvas.width:canvas.height;
    const band=includeDecorativeText?undefined:decorativeBand(recognition.layout,pixelWidth,pixelHeight);
    const ocrLines=recognition.layout.filter(l=>!band||l.y0>band);
    const wordPage=buildOcrWordPage(ocrLines,pixelWidth,pixelHeight,swap?baseViewport.height:baseViewport.width,swap?baseViewport.width:baseViewport.height);
    if(band) {
      const crop=document.createElement('canvas');crop.width=pixelWidth;crop.height=Math.ceil(band);
      try {
        crop.getContext('2d')!.drawImage(image,0,0);
        const blob=await new Promise<Blob>((resolve,reject)=>crop.toBlob(b=>b?resolve(b):reject(new Error('Could not preserve masthead')),'image/png'));
        wordPage.blocks.unshift({kind:'image',x:0,right:wordPage.width,y:0,bottom:band/pixelHeight*wordPage.height,data:new Uint8Array(await blob.arrayBuffer())});
        wordPage.left=0;wordPage.right=wordPage.width;wordPage.top=0;
      } finally {crop.width=0;crop.height=0;}
    }
    const context=image.getContext('2d')!;
    fitOcrText(wordPage,(text,size,bold)=>{context.font=`${bold?'bold ':''}${size}px Arial`;return context.measureText(text).width;});
    return {
      page: wordPage,
      rotation: chosen.deg as 0 | 90 | 180 | 270,
      ocrLines,
      ocrPixelWidth: pixelWidth,
      ocrPixelHeight: pixelHeight,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "ocr-failed",
      caught instanceof Error
        ? `On-device OCR failed: ${caught.message}`
        : "On-device OCR could not read this page.",
    );
  } finally {
    if (orientationProbe && orientationProbe !== canvas) {
      orientationProbe.width = 0;
      orientationProbe.height = 0;
    }
    // Release the rotated canvases (the base render is owned/released here too).
    for (const rotated of rotatedCanvases) {
      rotated.width = 0;
      rotated.height = 0;
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}


export async function convertPdfToWord(
  file: File,
  onProgress?: (
    current: number,
    total: number,
    phase?: WordProgressPhase,
    subProgress?: number,
  ) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; pageCount: number }> {
  validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotAborted(signal);

  // Lazy, document-scoped OCR worker: created on the first scanned page and
  // reused (and terminated) across the whole conversion.
  let ocrEngine: PdfOcrEngine | null = null;

  const document = await loadPdfRendererDocument(file);
  try {
    const pageCount = document.numPages;
    if (pageCount > MAX_PDF_TO_WORD_SOURCE_PAGES) {
      throw new PdfProcessingError(
        "word-workload-too-large",
        `${file.name} has ${pageCount} pages. Word conversion supports up to ${MAX_PDF_TO_WORD_SOURCE_PAGES.toLocaleString()} pages to protect browser memory.`,
      );
    }

    // Dynamic import of pdfjs-dist to avoid DOMMatrix error during Next.js prerendering
    await import("pdfjs-dist");

    const pages: WordPage[] = [];
    let totalTextLength = 0;

    for (let i = 0; i < pageCount; i++) {
      assertNotAborted(signal);
      onProgress?.(i + 1, pageCount, "extracting");

      const page = await document.getPage(i + 1);
      try {
        const textContent = await page.getTextContent();
        // Count usable non-whitespace characters on this page. A page with
        // almost none has no usable text layer (scanned/image-based).
        let pageChars = 0;
        for (const item of textContent.items as { str: string }[]) {
          pageChars += (item.str || "").replace(/\s/g, "").length;
        }

        if (pageChars < OCR_MIN_PAGE_CHARS) {
          // Scanned/image-based page: run on-device OCR instead. The Tesseract
          // worker is created once per document and shared across pages.
          if (!ocrEngine) {
            ocrEngine = await createPdfOcrEngine(onProgress, i + 1, pageCount);
          }
          const recognized = await recognizePdfPage(
            page,
            i + 1,
            pageCount,
            ocrEngine,
            onProgress,
            signal,
          );
          const ocrPage = recognized.page;
          totalTextLength+=ocrPage.blocks.reduce((n,b)=>n+(b.kind==='image'?0:b.kind==='table'?b.rows.flat(2).flatMap(l=>l.spans).reduce((a,s)=>a+s.text.length,0):b.lines.flatMap(l=>l.spans).reduce((a,s)=>a+s.text.length,0)),0);
          pages.push(ocrPage);
        } else {
          const wordPage = await extractWordPage(page,textContent);
          pages.push(wordPage);
          totalTextLength += pageChars;
        }
      } finally {
        page.cleanup();
      }
    }

    if (totalTextLength < 20) {
      throw new PdfProcessingError(
        "word-no-text-found",
        "No readable text could be recovered from this PDF, even after attempting on-device OCR where needed. Try a clearer scan or a PDF with selectable text.",
      );
    }

    finalizeOcrPages(pages);
    const [{ Packer }, { createWordDocument }] = await Promise.all([
      import("docx"),
      import("./word-document"),
    ]);
    const doc = createWordDocument(pages);
    const blob = await Packer.toBlob(doc);
    if (blob.size > MAX_PDF_TO_WORD_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "word-output-too-large",
        "The generated Word document exceeds the 50 MB browser safety limit.",
      );
    }

    return {
      blob,
      pageCount,
    };
  } finally {
    if (ocrEngine) {
      try {
        await ocrEngine.terminate();
      } catch {
        // Best-effort cleanup; the worker is local to this conversion.
      }
    }
    await document.destroy();
  }
}
