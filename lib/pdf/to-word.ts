import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import {
  renderPageToCanvasForOcr,
  rotateCanvas,
} from "@/lib/pdf/ocr-render";
import {
  MAX_PDF_TO_WORD_SOURCE_PAGES,
  MAX_PDF_TO_WORD_OUTPUT_SIZE,
} from "@/lib/pdf/types";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";
import {
  Document,
  Paragraph,
  TextRun,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableLayoutType,
  Packer,
} from "docx";
import {
  partitionPageIntoBlocks,
  partitionOcrLinesIntoBlocks,
  type DetectedTable,
  type OcrLineBox,
  type OcrPageBlock,
} from "@/lib/pdf/table-detection";

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new PdfProcessingError(
      "word-conversion-failed",
      "Word conversion was cancelled.",
    );
  }
}

function groupTextItemsIntoParagraphs(
  items: { str: string; transform: number[] }[],
): string[] {
  const DEFAULT_FONT_SIZE = 14.4;
  const fontSizeOf = (item: { transform: number[] }) =>
    Math.hypot(item.transform[2], item.transform[3]) || 0;

  // Only non-empty items participate; empty/whitespace items must not create
  // fake transitions or corrupt gap tracking.
  const nonEmpty = items.filter((item) => item.str && item.str.trim());

  // --- Pass 1: detect the page's dominant line pitch ---
  // Collect all line-to-line gaps (excluding same-line/justified-word gaps
  // which are ~0) and take the MODE of gaps rounded to the nearest 0.5 unit.
  // This is the document's normal single-line spacing, which real Word
  // exports render at ~1.7x-2.0x the font size (far above the old fixed
  // 1.6x threshold, which broke every wrapped line into its own paragraph).
  const gapCounts = new Map<number, number>();
  let prevY = -Infinity;
  let prevFontSize = 0;
  for (const item of nonEmpty) {
    const fontSize = fontSizeOf(item) || DEFAULT_FONT_SIZE;
    const y = item.transform[5];
    if (prevY !== -Infinity) {
      const gap = prevY - y;
      if (gap > 0.4 * Math.max(fontSize, prevFontSize)) {
        const key = Math.round(gap * 2) / 2;
        gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
      }
    }
    prevY = y;
    prevFontSize = fontSize;
  }

  let dominantPitch = 0;
  if (gapCounts.size >= 3) {
    let bestCount = 0;
    for (const [pitch, count] of gapCounts) {
      // On a tie, prefer the smaller pitch: under-splitting paragraphs is
      // less harmful than merging distinct paragraphs.
      if (count > bestCount || (count === bestCount && pitch < dominantPitch)) {
        dominantPitch = pitch;
        bestCount = count;
      }
    }
  }

  // --- Pass 2: classify each transition ---
  const paragraphs: string[] = [];
  let currentParagraph = "";
  let lastY = -Infinity;
  let lastFontSize = 0;
  let atLineStart = true;
  let lastListMarkerX: number | null = null;

  // List markers: roman numerals, digits, or single letters followed by . or ),
  // optionally parenthesized â€” e.g. "i.", "ii.", "1.", "(a)", "a)".
  const LIST_MARKER_RE = /^(\(?[ivxlcdm]{1,6}\)?[.)]|\(?\d{1,3}\)?[.)]|\(?[a-z]\)?[.)])$/i;

  for (const item of nonEmpty) {
    const fontSize = fontSizeOf(item) || DEFAULT_FONT_SIZE;
    const y = item.transform[5];
    const gap = lastY === -Infinity ? Infinity : lastY - y;
    const isNewLine = gap > 0.4 * Math.max(fontSize, lastFontSize);

    // Whether to start a new paragraph.
    let isNewParagraph = false;
    if (currentParagraph && isNewLine) {
      if (dominantPitch > 0) {
        // Adaptive mode: wrapped continuation lines sit at the document's
        // dominant line pitch (with tolerance for float jitter); anything
        // beyond that is a genuine paragraph boundary.
        isNewParagraph = gap > dominantPitch * 1.15;
      } else {
        // Fallback (not enough distinct gaps to estimate a pitch): use the
        // previous fixed-ratio heuristic as a safety net.
        isNewParagraph = gap > 1.6 * fontSize;
      }
    }

    if (isNewLine) {
      const trimmed = item.str.trim();
      if (LIST_MARKER_RE.test(trimmed)) {
        // Additive forced-break signal: a new line starting with a list
        // marker at (roughly) the X position of the previous list marker is
        // the next list item, even when its Y-gap coincides with the
        // dominant line pitch. Never suppresses a gap-based break.
        if (
          currentParagraph &&
          lastListMarkerX !== null &&
          Math.abs(item.transform[4] - lastListMarkerX) <= 5
        ) {
          isNewParagraph = true;
        }
        lastListMarkerX = item.transform[4];
      }
    }

    if (isNewParagraph) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = item.str;
    } else {
      // Same line (gap <= 0.4x) or wrapped continuation line: merge.
      currentParagraph += (currentParagraph ? " " : "") + item.str;
    }
    lastY = y;
    lastFontSize = fontSize;
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  return paragraphs;
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
// A recognize() pass is considered "poor" (likely still rotated/garbled) when
// it yields fewer than this many 3+ letter words on a full scanned page.
const OCR_MIN_GOOD_WORDS = 12;

type OcrLoggerMessage = { status?: string; progress?: number };

type OcrLine = { text: string; x0: number; y0: number; x1: number; y1: number };

type OcrWord = { text: string; x0: number; x1: number; confidence: number };

type OcrRecognition = {
  lines: OcrLine[];
  /** Word-level detail (bbox + confidence) used for table detection. */
  lineWords: OcrWord[][];
  plainText: string;
  confidence: number;
};

type OcrEngine = {
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

/**
 * Create a shared Tesseract worker for the whole conversion (one spawn per
 * document instead of per page). Worker + wasm core are served from
 * public/tesseract/ (copied by scripts/copy-pdf-assets.js); language data is
 * fetched lazily from Tesseract's default CDN.
 */
async function createOcrEngine(
  onProgress: ((
    current: number,
    total: number,
    phase?: WordProgressPhase,
    subProgress?: number,
  ) => void) | undefined,
  pageNumber: number,
  pageCount: number,
): Promise<OcrEngine> {
  onProgress?.(pageNumber, pageCount, "ocr-download");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tesseract = (await import("tesseract.js")) as any;
  const logger = (message: OcrLoggerMessage) => {
    if (typeof message.progress !== "number") return;
    if (
      message.status === "loading tesseract core" ||
      message.status === "loading language traineddata" ||
      message.status === "loading osd traineddata"
    ) {
      onProgress?.(pageNumber, pageCount, "ocr-download", message.progress);
    } else if (message.status === "recognizing text") {
      onProgress?.(pageNumber, pageCount, "ocr", message.progress);
    }
  };
  // Recognition runs on the fast LSTM engine (best quality + block geometry).
  // Orientation detection relies on Tesseract's OSD, which is only available on
  // the legacy (non-LSTM) engine, so it gets its own dedicated worker that
  // loads the OSD traineddata once per conversion.
  const workerOptions = {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    logger,
  };
  const recWorker = await tesseract.createWorker("eng", 1, workerOptions);
  const osdWorker = await tesseract.createWorker("osd", 0, {
    ...workerOptions,
    legacyCore: true,
  });
  return {
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
      const lines: OcrLine[] = [];
      const lineWords: OcrWord[][] = [];
      if (Array.isArray(data?.blocks)) {
        for (const block of data.blocks) {
          for (const para of block?.paragraphs ?? []) {
            for (const line of para?.lines ?? []) {
              const text = (line?.text ?? "").replace(/\s+/g, " ").trim();
              const bbox = line?.bbox;
              const words: OcrWord[] = ((line?.words ?? []) as {
                text?: string;
                bbox?: { x0?: number; x1?: number };
                confidence?: number;
              }[])
                .map((w) => ({
                  text: (w?.text ?? "").trim(),
                  x0: w?.bbox?.x0 ?? 0,
                  x1: w?.bbox?.x1 ?? 0,
                  confidence: w?.confidence ?? 0,
                }))
                .filter((w) => w.text && w.x1 > w.x0);
              if (text && bbox) {
                lines.push({
                  text,
                  x0: bbox.x0,
                  y0: bbox.y0,
                  x1: bbox.x1,
                  y1: bbox.y1,
                });
                lineWords.push(words);
              } else if (text) {
                lines.push({
                  text,
                  x0: 0,
                  y0: lines.length,
                  x1: 0,
                  y1: lines.length,
                });
                lineWords.push(words);
              }
            }
          }
        }
      }
      const plainText = typeof data?.text === "string" ? data.text : "";
      return {
        lines,
        lineWords,
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

/**
 * Group OCR'd lines (each with a bounding box) into paragraphs using the same
 * adaptive line-pitch + list-marker strategy as the text-extraction path.
 *
 * OCR coordinates are screen-space (y grows downward), so rows are read
 * top-to-bottom by ascending y0. Several recognized lines can share one
 * visual row (columns/table cells); their segments are joined so column
 * structure stays readable instead of collapsing into character soup.
 */
function groupOcrLinesIntoParagraphs(lines: OcrLine[]): string[] {
  const usable = lines.filter((line) => line.text.trim());
  if (!usable.length) return [];

  // Sort top-to-bottom, then left-to-right (4px row jitter tolerance).
  usable.sort((a, b) => (Math.abs(a.y0 - b.y0) > 4 ? a.y0 - b.y0 : a.x0 - b.x0));

  // Median line height for jitter-tolerant row clustering.
  const heights = usable
    .map((line) => line.y1 - line.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const lineHeight = heights.length
    ? heights[Math.floor(heights.length / 2)]
    : 12;

  // Cluster lines into visual rows.
  const rows: { y0: number; x0: number; segments: string[] }[] = [];
  for (const line of usable) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(line.y0 - last.y0) <= 0.6 * lineHeight) {
      last.segments.push(line.text);
    } else {
      rows.push({ y0: line.y0, x0: line.x0, segments: [line.text] });
    }
  }

  // Dominant row pitch (mode of consecutive row gaps, rounded to 0.5px).
  const gapCounts = new Map<number, number>();
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i].y0 - rows[i - 1].y0;
    if (gap > 0.6 * lineHeight) {
      const key = Math.round(gap * 2) / 2;
      gapCounts.set(key, (gapCounts.get(key) ?? 0) + 1);
    }
  }
  let dominantPitch = 0;
  if (gapCounts.size >= 3) {
    let bestCount = 0;
    for (const [pitch, count] of gapCounts) {
      if (count > bestCount || (count === bestCount && pitch < dominantPitch)) {
        dominantPitch = pitch;
        bestCount = count;
      }
    }
  }

  // Same list-marker rule as the text path.
  const LIST_MARKER_RE =
    /^(\(?[ivxlcdm]{1,6}\)?[.)]|\(?\d{1,3}\)?[.)]|\(?[a-z]\)?[.)])$/i;

  const paragraphs: string[] = [];
  let currentRow = -1;
  let lastListMarkerX: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.segments.join(" ").replace(/\s+/g, " ").trim();

    const gap = currentRow === -1 ? Infinity : row.y0 - rows[currentRow].y0;
    let isNewParagraph = false;
    if (currentRow !== -1) {
      if (dominantPitch > 0) {
        isNewParagraph = gap > dominantPitch * 1.3;
      } else {
        isNewParagraph = gap > 1.6 * lineHeight;
      }
    }

    const firstToken = text.split(/\s+/)[0]?.replace(/^[("']+/, "") ?? "";
    if (LIST_MARKER_RE.test(firstToken)) {
      if (lastListMarkerX !== null && Math.abs(row.x0 - lastListMarkerX) <= 8) {
        isNewParagraph = true;
      }
      lastListMarkerX = row.x0;
    }

    if (currentRow === -1 || isNewParagraph) {
      if (text) paragraphs.push(text);
    } else if (text) {
      paragraphs[paragraphs.length - 1] += ` ${text}`;
    }
    currentRow = i;
  }

  return paragraphs.map((p) => p.trim()).filter(Boolean);
}

  /**
 * OCR a single scanned page: render to canvas at a bounded resolution, detect
 * the page orientation with OSD, auto-rotate the canvas (trying the detected
 * direction first and the opposite/0 candidates only when the recognized text
 * is still too sparse), and group the recognized lines into layout-aware
 * paragraphs via groupOcrLinesIntoParagraphs.
 */
async function ocrPageToBlocks(
  page: import("pdfjs-dist").PDFPageProxy,
  pageNumber: number,
  pageCount: number,
  engine: OcrEngine,
  onProgress: ((
    current: number,
    total: number,
    phase?: WordProgressPhase,
    subProgress?: number,
  ) => void) | undefined,
  signal?: AbortSignal,
): Promise<OcrPageBlock[]> {
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

  type OcrCandidate = {
    deg: number;
    recognition: OcrRecognition;
    words: number;
  };
  let chosen: OcrCandidate | null = null;

  try {
    // Detect the page orientation with Tesseract's OSD. We always heed a
    // non-zero angle (OSD is reliable for these scans); the confidence only
    // controls whether we can trust the detected direction immediately or need
    // to compare it against the opposite/0 candidates.
    onProgress?.(pageNumber, pageCount, "ocr-orient");
    const detection = await engine.detect(canvas);
    assertNotAborted(signal);

    const quadrant = Math.round(detection.degrees / 90) % 4;
    const detected = ((((quadrant % 4) + 4) % 4) * 90) as 0 | 90 | 180 | 270;
    const confident = detection.confidence >= OCR_ROTATION_MIN_CONFIDENCE;
    const opposite = ((detected + 180) % 360) as 0 | 90 | 180 | 270;

    // Recognize a rotation (tracking canvases for cleanup) and return the
    // resulting word count so candidates can be compared.
    const evaluate = async (deg: number): Promise<OcrCandidate> => {
      const image =
        deg === 0 ? canvas : rotateCanvas(canvas, deg as 0 | 90 | 180 | 270);
      if (deg !== 0) rotatedCanvases.push(image);
      const recognition = await engine.recognize(image);
      assertNotAborted(signal);
      return { deg, recognition, words: ocrAlphaWords(recognition) };
    };
    const keepBetter = (best: OcrCandidate | null, cand: OcrCandidate) =>
      !best || cand.words > best.words ? cand : best;

    if (detected === 0) {
      // Upright page: no rotation is the only sensible choice. If that reads
      // very poorly, compare the other three orientations and keep the best.
      chosen = await evaluate(0);
      if (chosen.words < OCR_MIN_GOOD_WORDS) {
        for (const deg of [180, 90, 270]) {
          chosen = keepBetter(chosen, await evaluate(deg));
        }
      }
    } else {
      chosen = await evaluate(detected);
      // Trust the detected direction only when OSD was confident AND the text
      // reads well; otherwise compare against the opposite and 0Â° and keep the
      // best, which also catches a wrong 90/270 call on an otherwise upright
      // page (e.g. page 5, whose OSD confidence is below the trust threshold).
      if (!(confident && chosen.words >= OCR_MIN_GOOD_WORDS)) {
        const fallbacks = [opposite, 0];
        const tried = new Set<number>([detected]);
        for (const deg of fallbacks) {
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
    const ocrLines: OcrLineBox[] = recognition.lines.map((line, idx) => ({
      text: line.text,
      y0: line.y0,
      y1: line.y1,
      words: recognition.lineWords[idx] ?? [],
    }));
    return partitionOcrLinesIntoBlocks(ocrLines);
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError(
      "ocr-failed",
      caught instanceof Error
        ? `On-device OCR failed: ${caught.message}`
        : "On-device OCR could not read this page.",
    );
  } finally {
    // Release the rotated canvases (the base render is owned/released here too).
    for (const rotated of rotatedCanvases) {
      rotated.width = 0;
      rotated.height = 0;
    }
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Render a detected table as a real Word table. Column widths come from the
 * detected column boundaries (the whitespace between them is distributed to
 * the cells), expressed in DXA (twentieths of a point) with a fixed layout
 * so Word reproduces the source geometry.
 */
function buildDocxTable(table: DetectedTable): Table {
  const CONTENT_WIDTH_DXA = 9026; // A4 page minus default 1" margins
  const left = table.columnXs[0];
  const span = Math.max(table.tableRight - left, 1);

  // Width of column c = gap from its boundary to the next boundary/right edge.
  const edges = [...table.columnXs.slice(1), table.tableRight];
  const fractions = edges.map((edge, i) => (edge - table.columnXs[i]) / span);
  // Normalize (rounding can drift the sum away from 1).
  const sum = fractions.reduce((a, b) => a + b, 0) || 1;
  const columnWidths = fractions.map(
    (f) => Math.max((f / sum) * CONTENT_WIDTH_DXA, 300) | 0,
  );

  const rows = table.rows.map((cells) =>
    new TableRow({
      children: cells.map((text, c) =>
        new TableCell({
          width: { size: columnWidths[c], type: WidthType.DXA },
          children: [
            new Paragraph({ children: [new TextRun(text || "")] }),
          ],
        }),
      ),
    }),
  );

  return new Table({
    rows,
    columnWidths,
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
  });
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
  let ocrEngine: OcrEngine | null = null;

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

    const allChildren: (Paragraph | Table)[] = [];
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
            ocrEngine = await createOcrEngine(onProgress, i + 1, pageCount);
          }
          const ocrBlocks = await ocrPageToBlocks(
            page,
            i + 1,
            pageCount,
            ocrEngine,
            onProgress,
            signal,
          );
          for (const block of ocrBlocks) {
            if (block.kind === "table") {
              allChildren.push(buildDocxTable(block.table));
              totalTextLength += block.table.rows
                .flat()
                .join("").length;
              continue;
            }
            const ocrProseLines = block.lines.map((l) => ({
              text: l.text,
              x0: 0,
              y0: l.y0,
              x1: 0,
              y1: l.y1,
            }));
            for (const text of groupOcrLinesIntoParagraphs(ocrProseLines)) {
              allChildren.push(new Paragraph({ children: [new TextRun(text)] }));
              totalTextLength += text.length;
            }
          }
        } else {
          // pdfjs-dist returns text items in raw content-stream order, which is
          // not guaranteed to match reading order. Sort a copy by Y (descending:
          // top of page first, since PDF Y grows upward), then by X (ascending:
          // left to right within the same line, using the same 5-unit tolerance
          // as groupTextItemsIntoParagraphs).
          const items = [...textContent.items] as {
            str: string;
            transform: number[];
            width?: number;
          }[];
          items.sort((a, b) => {
            const yDiff = b.transform[5] - a.transform[5];
            if (Math.abs(yDiff) > 5) return yDiff;
            return a.transform[4] - b.transform[4];
          });
          // Partition the page into table regions and prose BEFORE paragraph
          // grouping: once lines are merged into paragraphs, cell geometry is
          // lost. Detected tables render as real Word tables in source order;
          // every other line flows into the existing grouping unchanged.
          const blocks = partitionPageIntoBlocks(
            items.map((item) => ({
              str: item.str,
              transform: item.transform,
              width: item.width ?? 0,
            })),
          );
          for (const block of blocks) {
            if (block.kind === "table") {
              const table = buildDocxTable(block.table);
              allChildren.push(table);
              totalTextLength += block.table.rows
                .flat()
                .join("").length;
              continue;
            }
            const paragraphs = groupTextItemsIntoParagraphs(block.items);
            for (const text of paragraphs) {
              allChildren.push(new Paragraph({ children: [new TextRun(text)] }));
              totalTextLength += text.length;
            }
          }
        }

        if (i < pageCount - 1) {
          allChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }
      } finally {
        page.cleanup();
      }
    }

    if (totalTextLength < 20) {
      throw new PdfProcessingError(
        "word-no-text-found",
        "No readable text was found in this PDF. It may be a scanned or image-based document â€” text extraction requires selectable text, which this tool cannot OCR.",
      );
    }

    const doc = new Document({
      sections: [
        {
          children: allChildren,
        },
      ],
    });
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
