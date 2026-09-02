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
  const paragraphs: string[] = [];
  let currentParagraph = "";
  let lastY = -Infinity;

  for (const item of items) {
    const y = item.transform[5];
    if (lastY - y > 5) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = item.str;
    } else {
      currentParagraph += (currentParagraph ? " " : "") + item.str;
    }
    lastY = y;
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