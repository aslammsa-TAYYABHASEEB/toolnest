"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPdfDownload,
  revokePdfDownload,
  type PdfDownload,
} from "@/lib/pdf/download";
import type { RenderedPdfPage } from "@/lib/pdf/types";

export type RenderedImageDownload = PdfDownload & {
  previewUrl: string;
};

export function useRenderedImageDownloads() {
  const current = useRef<RenderedImageDownload[]>([]);
  const currentZip = useRef<PdfDownload | null>(null);
  const [downloads, setDownloads] = useState<RenderedImageDownload[]>([]);
  const [zipDownload, setZipDownload] = useState<PdfDownload | null>(null);

  function clear() {
    current.current.forEach((download) => {
      URL.revokeObjectURL(download.url);
      URL.revokeObjectURL(download.previewUrl);
    });
    revokePdfDownload(currentZip.current);
    current.current = [];
    currentZip.current = null;
    setDownloads([]);
    setZipDownload(null);
  }

  function replace(
    images: RenderedPdfPage[],
    zip?: { blob: Blob; filename: string },
  ) {
    clear();
    const next = images.map((image) => ({
      ...createPdfDownload(image.blob, image.filename),
      previewUrl: URL.createObjectURL(image.previewBlob),
    }));
    const nextZip = zip ? createPdfDownload(zip.blob, zip.filename) : null;
    current.current = next;
    currentZip.current = nextZip;
    setDownloads(next);
    setZipDownload(nextZip);
  }

  useEffect(() => () => {
    current.current.forEach((download) => {
      URL.revokeObjectURL(download.url);
      URL.revokeObjectURL(download.previewUrl);
    });
    revokePdfDownload(currentZip.current);
  }, []);

  return { downloads, zipDownload, replace, clear };
}
