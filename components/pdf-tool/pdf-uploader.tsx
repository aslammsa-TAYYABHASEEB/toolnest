"use client";

import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { buttonClassName } from "@/components/ui/button";
import {
  MAX_PDF_TOTAL_SIZE,
} from "@/lib/pdf/types";
import { formatPdfBytes } from "@/lib/pdf/validation";

type PdfUploaderProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  compact?: boolean;
  multiple?: boolean;
  inputId?: string;
  heading?: string;
  compactHeading?: string;
  buttonLabel?: string;
  helperText?: string;
  onSelect: (files: File[]) => void;
};

export function PdfUploader({
  inputRef,
  busy,
  compact = false,
  multiple = true,
  inputId = "pdf-files",
  heading = "Drop PDF files here",
  compactHeading = "Add more PDFs",
  buttonLabel = "Choose PDFs",
  helperText,
  onSelect,
}: PdfUploaderProps) {
  const [dragActive, setDragActive] = useState(false);

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    onSelect(multiple ? selected : selected.slice(0, 1));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const selected = Array.from(event.dataTransfer.files);
    onSelect(multiple ? selected : selected.slice(0, 1));
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        multiple={multiple}
        onChange={handleInput}
        disabled={busy}
      />
      <label
        className={`pdf-dropzone${compact ? " is-compact" : ""}${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        htmlFor={inputId}
        tabIndex={busy ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragActive(false);
          }
        }}
        onDrop={handleDrop}
      >
        <span className="pdf-upload-icon" aria-hidden="true">PDF</span>
        <span className="pdf-drop-copy">
          <strong>{compact ? compactHeading : heading}</strong>
          <small>
            {helperText ?? `Select two or more PDFs · ${formatPdfBytes(MAX_PDF_TOTAL_SIZE)} total`}
          </small>
        </span>
        <span
          className={buttonClassName({ variant: compact ? "secondary" : "primary" })}
          aria-hidden="true"
        >
          {buttonLabel}
        </span>
      </label>
    </>
  );
}
