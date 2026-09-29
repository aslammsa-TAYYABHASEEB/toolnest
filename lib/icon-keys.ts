export const toolIconKeys = [
  "document-privacy",
  "searchable-pdf",
  "pdf-to-excel",
  "image-to-text",
  "organize-pdf",
  "pdf-merge",
  "pdf-split",
  "jpg-to-pdf",
  "pdf-to-jpg",
  "pdf-rotate",
  "pdf-watermark",
  "pdf-page-numbers",
  "pdf-compress",
  "pdf-to-word",
  "image-resize",
  "image-compress",
  "image-convert",
  "word-counter",
  "qr-code",
  "json-formatter",
  "case-converter",
  "remove-extra-spaces",
  "percentage-calculator",
  "age-calculator",
  "unit-converter",
] as const;

export const categoryIconKeys = [
  "category-pdf",
  "category-image",
  "category-text",
  "category-calculators",
] as const;

export type ToolIconKey = (typeof toolIconKeys)[number];
export type CategoryIconKey = (typeof categoryIconKeys)[number];
export type IconKey = ToolIconKey | CategoryIconKey;
