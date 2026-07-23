import type {
  ImagePdfBackground,
  ImagePdfFit,
  ImagePdfMargin,
  ImagePdfOrientation,
  ImagePdfPageSize,
} from "@/lib/pdf/types";

const POINTS_PER_PIXEL = 72 / 96;

export const IMAGE_PDF_PAGE_SIZES = {
  a4: { label: "A4", width: 595.28, height: 841.89 },
  letter: { label: "Letter", width: 612, height: 792 },
  legal: { label: "Legal", width: 612, height: 1008 },
} as const;

export const IMAGE_PDF_MARGINS: Record<ImagePdfMargin, number> = {
  none: 0,
  small: 18,
  medium: 36,
  large: 54,
};

export const IMAGE_PDF_BACKGROUNDS: Record<
  ImagePdfBackground,
  { red: number; green: number; blue: number }
> = {
  white: { red: 1, green: 1, blue: 1 },
  "light-gray": { red: 0.92, green: 0.92, blue: 0.92 },
  black: { red: 0, green: 0, blue: 0 },
};

function orientPage(
  width: number,
  height: number,
  orientation: ImagePdfOrientation,
  imageWidth: number,
  imageHeight: number,
) {
  const target = orientation === "auto"
    ? (imageWidth > imageHeight ? "landscape" : "portrait")
    : orientation;
  const portraitWidth = Math.min(width, height);
  const portraitHeight = Math.max(width, height);
  return target === "landscape"
    ? { width: portraitHeight, height: portraitWidth }
    : { width: portraitWidth, height: portraitHeight };
}

export function getImagePdfPageDimensions(
  pageSize: ImagePdfPageSize,
  orientation: ImagePdfOrientation,
  imageWidth: number,
  imageHeight: number,
  margin: ImagePdfMargin,
) {
  const marginPoints = IMAGE_PDF_MARGINS[margin];
  if (pageSize === "auto") {
    return orientPage(
      imageWidth * POINTS_PER_PIXEL + marginPoints * 2,
      imageHeight * POINTS_PER_PIXEL + marginPoints * 2,
      orientation,
      imageWidth,
      imageHeight,
    );
  }
  const fixed = IMAGE_PDF_PAGE_SIZES[pageSize];
  return orientPage(
    fixed.width,
    fixed.height,
    orientation,
    imageWidth,
    imageHeight,
  );
}

export function getImagePlacement(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: ImagePdfMargin,
  fit: ImagePdfFit,
) {
  const marginPoints = IMAGE_PDF_MARGINS[margin];
  const availableWidth = Math.max(1, pageWidth - marginPoints * 2);
  const availableHeight = Math.max(1, pageHeight - marginPoints * 2);
  const naturalWidth = imageWidth * POINTS_PER_PIXEL;
  const naturalHeight = imageHeight * POINTS_PER_PIXEL;
  const fitScale = Math.min(
    availableWidth / naturalWidth,
    availableHeight / naturalHeight,
  );
  const fillScale = Math.max(
    availableWidth / naturalWidth,
    availableHeight / naturalHeight,
  );
  const scale = fit === "fill"
    ? fillScale
    : fit === "original"
      ? Math.min(1, fitScale)
      : fitScale;
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}
