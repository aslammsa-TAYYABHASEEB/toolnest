"use client";

import { useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { MAX_TEXT_FILE_SIZE, MAX_TEXT_INPUT_CHARACTERS } from "@/lib/text/types";

type TextEditorProps = {
  id?: string;
  label?: string;
  value: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onClear?: () => void;
  onCopy?: () => void;
  onFileUpload?: (filename: string, content: string) => void;
  filename?: string | null;
};

export function TextEditor({
  id = "text-editor-input",
  label = "Text Source",
  value,
  placeholder = "Type or paste your text here...",
  readOnly = false,
  onChange,
  onClear,
  onCopy,
  onFileUpload,
  filename,
}: TextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (onChange) {
        onChange(text.slice(0, MAX_TEXT_INPUT_CHARACTERS));
      }
    } catch {
      // Ignore if clipboard permission denied
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_TEXT_FILE_SIZE) {
      alert("File is too large. Choose a file under 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content && onFileUpload) {
        onFileUpload(file.name, content.slice(0, MAX_TEXT_INPUT_CHARACTERS));
      } else if (content && onChange) {
        onChange(content.slice(0, MAX_TEXT_INPUT_CHARACTERS));
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="text-editor-container">
      <div className="json-panel-heading">
        <div>
          <span className="kicker">{filename ? "Loaded File" : "Input"}</span>
          <h2 id={`${id}-title`}>{label}</h2>
        </div>
        <span>{value.length.toLocaleString()} / {MAX_TEXT_INPUT_CHARACTERS.toLocaleString()} chars</span>
      </div>

      {filename && (
        <div className="json-file-row mb-2">
          <div>
            <strong>{filename}</strong>
            <span>Loaded locally</span>
          </div>
        </div>
      )}

      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="json-editor"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(e) => onChange?.(e.target.value.slice(0, MAX_TEXT_INPUT_CHARACTERS))}
      />

      <div className="json-primary-actions mt-3 flex-wrap gap-2">
        {!readOnly && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,.log,.text"
              className="sr-only"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload .txt file
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void handlePaste()}>
              Paste
            </Button>
          </>
        )}
        {onCopy && (
          <Button variant="secondary" size="sm" disabled={!value} onClick={onCopy}>
            Copy text
          </Button>
        )}
        {onClear && (
          <Button variant="ghost" size="sm" disabled={!value} onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
