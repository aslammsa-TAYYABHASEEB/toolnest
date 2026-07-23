"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPdfDownload,
  revokePdfDownload,
  type PdfDownload,
} from "@/lib/pdf/download";
import type { SplitPdfFile } from "@/lib/pdf/types";

export function usePdfDownloads() {
  const current = useRef<PdfDownload[]>([]);
  const [downloads, setDownloads] = useState<PdfDownload[]>([]);
  const [zipDownload, setZipDownload] = useState<PdfDownload | null>(null);

  function clear() {
    current.current.forEach(revokePdfDownload);
    current.current = [];
    setDownloads([]);
    setZipDownload(null);
  }

  function replace(
    files: SplitPdfFile[],
    zip?: { blob: Blob; filename: string },
  ) {
    current.current.forEach(revokePdfDownload);
    const next = files.map((file) => createPdfDownload(file.blob, file.filename));
    const zipItem = zip ? createPdfDownload(zip.blob, zip.filename) : null;
    current.current = zipItem ? [...next, zipItem] : next;
    setDownloads(next);
    setZipDownload(zipItem);
  }

  useEffect(() => () => {
    current.current.forEach(revokePdfDownload);
  }, []);

  return { downloads, zipDownload, replace, clear };
}
