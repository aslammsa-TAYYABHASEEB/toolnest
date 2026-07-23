export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024;

export const IMAGE_FORMATS = {
  jpeg: { label: "JPG", mimeType: "image/jpeg", extension: "jpg", supportsQuality: true },
  png: { label: "PNG", mimeType: "image/png", extension: "png", supportsQuality: false },
  webp: { label: "WebP", mimeType: "image/webp", extension: "webp", supportsQuality: true },
} as const;

export type ImageFormat = keyof typeof IMAGE_FORMATS;

export type ImageMetadata = {
  file: File;
  format: ImageFormat;
  width: number;
  height: number;
};

export type ConvertedImage = {
  blob: Blob;
  format: ImageFormat;
  filename: string;
  width: number;
  height: number;
};

export type ConversionOptions = {
  file: File;
  format: ImageFormat;
  quality?: number;
};

export type CompressionOptions = {
  file: File;
  format: ImageFormat;
  quality: number;
};

export type CompressedImage = ConvertedImage & {
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  savedPercentage: number;
  hasSavings: boolean;
};
