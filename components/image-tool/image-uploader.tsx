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
import { MAX_IMAGE_FILE_SIZE } from "@/lib/image/types";

type ImageUploaderProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  inputId: string;
  busy: boolean;
  loading: boolean;
  icon: string;
  showDropzone: boolean;
  onSelect: (file?: File) => void;
};

export function ImageUploader({
  inputRef,
  inputId,
  busy,
  loading,
  icon,
  showDropzone,
  onSelect,
}: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    onSelect(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    onSelect(event.dataTransfer.files?.[0]);
  }

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={handleInput}
        disabled={busy}
      />

      {showDropzone && (
        <label
          className={`converter-dropzone${dragActive ? " is-dragging" : ""}${busy ? " is-busy" : ""}`}
          htmlFor={inputId}
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
          <span className="converter-upload-icon" aria-hidden="true">{icon}</span>
          <span className="converter-drop-title">
            {loading ? "Checking your image…" : "Drop an image here"}
          </span>
          <span>or choose one from your device</span>
          <span
            className={buttonClassName({ size: "lg" })}
            aria-hidden="true"
          >
            Select image
          </span>
          <small>
            JPG, JPEG, PNG, or WebP · Maximum {formatBytes(MAX_IMAGE_FILE_SIZE)}
          </small>
        </label>
      )}
    </>
  );
}
