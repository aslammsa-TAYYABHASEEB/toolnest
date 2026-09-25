"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";

type AutoGrowTextareaProps = ComponentProps<"textarea"> & {
  /**
   * Display-only zoom of the surrounding table viewport. Cell text metrics scale with it, so the
   * measured height is refreshed when it changes.
   */
  zoom?: number;
};

/**
 * Textarea sized to its own content so long extracted text is readable without an internal
 * scrollbar. The caller keeps owning the controlled value: only the rendered height is measured
 * and applied after first paint, on every value edit and on every zoom change.
 */
export function AutoGrowTextarea({ zoom = 1, value, ...textareaProps }: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value, zoom]);
  return <textarea {...textareaProps} ref={ref} value={value} />;
}
