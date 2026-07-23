"use client";

import { useState } from "react";
import {
  toImageProcessingError,
  type ImageProcessingError,
} from "@/lib/image/errors";
import { readImageMetadata } from "@/lib/image/load-image";
import { createImagePreviewUrl } from "@/lib/image/preview";
import type {
  ImageMetadata,
  ImageProcessingStatus,
  ImageProcessResult,
} from "@/lib/image/types";
import { useObjectUrl } from "@/lib/image/use-object-url";

export function useImageProcessing<Result extends ImageProcessResult>() {
  const [status, setStatus] = useState<ImageProcessingStatus>("idle");
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<ImageProcessingError | null>(null);
  const preview = useObjectUrl<File>(createImagePreviewUrl);
  const output = useObjectUrl<Blob>();
  const busy = status === "loading" || status === "processing";

  function discardResult(nextStatus?: ImageProcessingStatus) {
    output.clear();
    setResult(null);
    if (nextStatus) setStatus(nextStatus);
  }

  async function loadFile(file?: File) {
    if (!file || busy) return null;

    preview.clear();
    output.clear();
    setMetadata(null);
    setResult(null);
    setError(null);
    setStatus("loading");

    try {
      const nextMetadata = await readImageMetadata(file);
      setMetadata(nextMetadata);
      preview.replace(file);
      setStatus("ready");
      return nextMetadata;
    } catch (caught) {
      const nextError = toImageProcessingError(
        caught,
        "This image could not be opened.",
      );
      setError(nextError);
      setStatus("error");
      return null;
    }
  }

  function beginProcessing() {
    output.clear();
    setResult(null);
    setError(null);
    setStatus("processing");
  }

  function completeProcessing(
    nextResult: Result,
    nextStatus: "success" | "no-savings" = "success",
  ) {
    setResult(nextResult);
    output.replace(nextResult.blob);
    setStatus(nextStatus);
  }

  function failProcessing(caught: unknown, fallbackMessage: string) {
    setError(toImageProcessingError(caught, fallbackMessage));
    setStatus("error");
  }

  function reset() {
    preview.clear();
    output.clear();
    setMetadata(null);
    setResult(null);
    setError(null);
    setStatus("idle");
  }

  return {
    status,
    metadata,
    result,
    error,
    previewUrl: preview.url,
    resultUrl: output.url,
    busy,
    loadFile,
    discardResult,
    beginProcessing,
    completeProcessing,
    failProcessing,
    reset,
  };
}
