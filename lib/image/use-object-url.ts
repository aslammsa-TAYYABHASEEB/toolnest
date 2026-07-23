"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createImageObjectUrl,
  revokeImageObjectUrl,
} from "@/lib/image/object-url";

type ObjectUrlFactory<T extends Blob> = (blob: T) => string;

export function useObjectUrl<T extends Blob>(
  createUrl: ObjectUrlFactory<T> = createImageObjectUrl,
) {
  const urlRef = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const clear = useCallback(() => {
    revokeImageObjectUrl(urlRef.current);
    urlRef.current = null;
    setUrl(null);
  }, []);

  const replace = useCallback((blob: T) => {
    revokeImageObjectUrl(urlRef.current);
    const nextUrl = createUrl(blob);
    urlRef.current = nextUrl;
    setUrl(nextUrl);
    return nextUrl;
  }, [createUrl]);

  useEffect(() => () => revokeImageObjectUrl(urlRef.current), []);

  return { url, replace, clear };
}
