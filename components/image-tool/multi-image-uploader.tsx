"use client";

import {
  useState,
  type ChangeEvent,
  type DragEvent,
  type RefObject,
} from "react";
import { buttonClassName } from "@/components/ui/button";
import { openImageFilePicker } from "@/lib/image/browser";
import { formatBytes } from "@/lib/image/process-image";
import {
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_TO_PDF_FILES,
  MAX_IMAGE_TO_PDF_TOTAL_SIZE,
} from "@/lib/image/types";

type MultiImageUploaderProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  busy: boolean;
  compact: boolean;
  onSelect: (files: File[]) => void;
};

export function MultiImageUploader({
  inputRef,
  busy,
  compact,
  onSelect,
}: MultiImageUploaderProps) {
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
        id="jpg-to-pdf-images"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        onChange={handleInput}
        disabled={busy}
      />
      <label
        className={`converter-dropzone image-pdf-dropzone${compact ? " is-compact" : ""}${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
        htmlFor="jpg-to-pdf-images"
        tabIndex={busy ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openImageFilePicker(inputRef.current);
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
        <span className="converter-upload-icon" aria-hidden="true">PDF</span>
        <span className="image-pdf-drop-copy">
          <strong>{compact ? "Add more images" : "Drop images here"}</strong>
          <span>
            JPG, PNG, or WebP · {formatBytes(MAX_IMAGE_FILE_SIZE)} each ·
            {" "}{formatBytes(MAX_IMAGE_TO_PDF_TOTAL_SIZE)} total ·
            {" "}{MAX_IMAGE_TO_PDF_FILES} images
          </span>
        </span>
        <span
          className={buttonClassName({
            variant: compact ? "secondary" : "primary",
            size: compact ? "md" : "lg",
          })}
          aria-hidden="true"
        >
          Choose images
        </span>
      </label>
    </>
  );
}
