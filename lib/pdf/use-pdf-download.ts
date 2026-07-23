"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPdfDownload,
  revokePdfDownload,
  type PdfDownload,
} from "@/lib/pdf/download";

export function usePdfDownload() {
  const current = useRef<PdfDownload | null>(null);
  const [download, setDownload] = useState<PdfDownload | null>(null);

  function clear() {
    revokePdfDownload(current.current);
    current.current = null;
    setDownload(null);
  }

  function replace(blob: Blob, filename: string) {
    revokePdfDownload(current.current);
    current.current = createPdfDownload(blob, filename);
    setDownload(current.current);
  }

  useEffect(() => () => revokePdfDownload(current.current), []);

  return { download, replace, clear };
}
