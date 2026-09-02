import { PdfProcessingError } from "@/lib/pdf/errors";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import {
  MAX_PDF_TO_WORD_SOURCE_PAGES,
  MAX_PDF_TO_WORD_OUTPUT_SIZE,
} from "@/lib/pdf/types";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";
import { Document, Paragraph, TextRun, PageBreak, Packer } from "docx";

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
  // optionally parenthesized — e.g. "i.", "ii.", "1.", "(a)", "a)".
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

export async function convertPdfToWord(
  file: File,
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ blob: Blob; pageCount: number }> {
  validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotAborted(signal);

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
    const pdfjsModule = await import("pdfjs-dist");
    const { OPS } = pdfjsModule;

    const allChildren: Paragraph[] = [];
    let totalTextLength = 0;

    for (let i = 0; i < pageCount; i++) {
      assertNotAborted(signal);
      onProgress?.(i + 1, pageCount);

      const page = await document.getPage(i + 1);
      try {
        const textContent = await page.getTextContent();
        // pdfjs-dist returns text items in raw content-stream order, which is
        // not guaranteed to match reading order. Sort a copy by Y (descending:
        // top of page first, since PDF Y grows upward), then by X (ascending:
        // left to right within the same line, using the same 5-unit tolerance
        // as groupTextItemsIntoParagraphs).
        const items = [...textContent.items] as {
          str: string;
          transform: number[];
        }[];
        items.sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5];
          if (Math.abs(yDiff) > 5) return yDiff;
          return a.transform[4] - b.transform[4];
        });
        const paragraphs = groupTextItemsIntoParagraphs(items);
        for (const text of paragraphs) {
          allChildren.push(new Paragraph({ children: [new TextRun(text)] }));
          totalTextLength += text.length;
        }

        // --- Detect if page contains images (presence check only) ---
        const operatorList = await page.getOperatorList();
        let pageHasImages = false;
        for (let j = 0; j < operatorList.fnArray.length; j++) {
          if (operatorList.fnArray[j] === OPS.paintImageXObject) {
            pageHasImages = true;
            break;
          }
        }

        // --- Add note paragraph if page has images ---
        if (pageHasImages) {
          allChildren.push(new Paragraph({
            children: [
              new TextRun({
                text: "[This page contains one or more images that are not included in this text extraction.]",
                italics: true,
              }),
            ],
          }));
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
        "No readable text was found in this PDF. It may be a scanned or image-based document — text extraction requires selectable text, which this tool cannot OCR.",
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
    await document.destroy();
  }
}