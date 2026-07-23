import {
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import { assertImageLoadingSupport } from "@/lib/image/capabilities";
import { validateDecodedWorkload } from "@/lib/image/image-to-pdf-input";
import { convertWebpToPngBytes } from "@/lib/image/pdf-compatible-image";
import type { PdfImageItem } from "@/lib/image/types";
import { assertPdfBrowserSupport } from "@/lib/pdf/capabilities";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeImagesToPdfFilename } from "@/lib/pdf/filenames";
import {
  getImagePdfPageDimensions,
  getImagePlacement,
  IMAGE_PDF_BACKGROUNDS,
  IMAGE_PDF_MARGINS,
} from "@/lib/pdf/image-page-layout";
import {
  MAX_IMAGE_PDF_OUTPUT_SIZE,
  PDF_MIME_TYPE,
  type ImagePdfOptions,
  type ImagePdfResult,
} from "@/lib/pdf/types";

async function embedImage(
  document: PDFDocument,
  item: PdfImageItem,
) {
  try {
    if (item.format === "jpeg") {
      return await document.embedJpg(await item.file.arrayBuffer());
    }
    if (item.format === "png") {
      return await document.embedPng(await item.file.arrayBuffer());
    }
    return await document.embedPng(await convertWebpToPngBytes(item.file));
  } catch (caught) {
    if (caught instanceof RangeError) {
      throw new PdfProcessingError(
        "image-embed-failed",
        "Your browser ran out of memory while preparing an image.",
      );
    }
    throw new PdfProcessingError(
      "image-embed-failed",
      `${item.file.name} could not be embedded in the PDF.`,
    );
  }
}

export async function createPdfFromImages(
  items: PdfImageItem[],
  options: ImagePdfOptions,
): Promise<ImagePdfResult> {
  assertPdfBrowserSupport();
  assertImageLoadingSupport();
  if (items.length === 0) {
    throw new PdfProcessingError(
      "image-pdf-failed",
      "Add at least one image before creating a PDF.",
    );
  }
  validateDecodedWorkload(items);

  try {
    const document = await PDFDocument.create();
    const background = IMAGE_PDF_BACKGROUNDS[options.background];

    for (const item of items) {
      const pageDimensions = getImagePdfPageDimensions(
        options.pageSize,
        options.orientation,
        item.width,
        item.height,
        options.margin,
      );
      const page = document.addPage([
        pageDimensions.width,
        pageDimensions.height,
      ]);
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageDimensions.width,
        height: pageDimensions.height,
        color: rgb(background.red, background.green, background.blue),
      });
      const embedded = await embedImage(document, item);
      const placement = getImagePlacement(
        embedded.width,
        embedded.height,
        pageDimensions.width,
        pageDimensions.height,
        options.margin,
        options.fit,
      );
      if (options.fit === "fill") {
        const margin = IMAGE_PDF_MARGINS[options.margin];
        page.pushOperators(
          pushGraphicsState(),
          rectangle(
            margin,
            margin,
            Math.max(1, pageDimensions.width - margin * 2),
            Math.max(1, pageDimensions.height - margin * 2),
          ),
          clip(),
          endPath(),
        );
        page.drawImage(embedded, placement);
        page.pushOperators(popGraphicsState());
      } else {
        page.drawImage(embedded, placement);
      }
    }

    const bytes = await document.save({ useObjectStreams: true });
    if (bytes.length > MAX_IMAGE_PDF_OUTPUT_SIZE) {
      throw new PdfProcessingError(
        "image-pdf-too-large",
        "The generated PDF is over the 200 MB browser safety limit.",
      );
    }
    const buffer = new Uint8Array(bytes.length);
    buffer.set(bytes);
    const blob = new Blob([buffer.buffer], { type: PDF_MIME_TYPE });
    return {
      blob,
      filename: makeImagesToPdfFilename(
        items.map((item) => item.file.name),
      ),
      size: blob.size,
      pageCount: items.length,
      imageCount: items.length,
      options,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    if (caught instanceof RangeError) {
      throw new PdfProcessingError(
        "image-pdf-failed",
        "Your browser ran out of memory. Try fewer or smaller images.",
      );
    }
    throw new PdfProcessingError(
      "image-pdf-failed",
      "The PDF could not be created. Try another image set.",
    );
  }
}
