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
  onSelect: (files: File[]) => void;
};

export function PdfUploader({
  inputRef,
  busy,
  compact = false,
  onSelect,
}: PdfUploaderProps) {
  const [dragActive, setDragActive] = useState(false);

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    onSelect(Array.from(event.target.files ?? []));
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    onSelect(Array.from(event.dataTransfer.files));
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        id="pdf-files"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={handleInput}
        disabled={busy}
      />
      <label
        className={`pdf-dropzone${compact ? " is-compact" : ""}${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        htmlFor="pdf-files"
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
          <strong>{compact ? "Add more PDFs" : "Drop PDF files here"}</strong>
          <small>
            Select two or more PDFs · {formatPdfBytes(MAX_PDF_TOTAL_SIZE)} total
          </small>
        </span>
        <span
          className={buttonClassName({ variant: compact ? "secondary" : "primary" })}
          aria-hidden="true"
        >
          Choose PDFs
        </span>
      </label>
    </>
  );
}
