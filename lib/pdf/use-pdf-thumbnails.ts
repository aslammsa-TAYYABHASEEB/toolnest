"use client";

import { useEffect, useRef, useState } from "react";
import type { PdfThumbnail } from "@/lib/pdf/types";

export type PdfThumbnailPreview = Omit<PdfThumbnail, "blob"> & {
  url: string;
};

export function usePdfThumbnails() {
  const current = useRef<PdfThumbnailPreview[]>([]);
  const [previews, setPreviews] = useState<PdfThumbnailPreview[]>([]);

  function clear() {
    current.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    current.current = [];
    setPreviews([]);
  }

  function replace(thumbnails: PdfThumbnail[]) {
    current.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    const next = thumbnails.map(({ blob, ...thumbnail }) => ({
      ...thumbnail,
      url: URL.createObjectURL(blob),
    }));
    current.current = next;
    setPreviews(next);
  }

  useEffect(() => () => {
    current.current.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, []);

  return { previews, replace, clear };
}
