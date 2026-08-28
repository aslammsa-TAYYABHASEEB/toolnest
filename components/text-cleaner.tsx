"use client";

import { useMemo, useState } from "react";
import { TextEditor } from "@/components/text-tool/text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyTextToClipboard, downloadTextFile, makeTextFilename } from "@/lib/text/download";
import { cleanText } from "@/lib/text/transform";
import { DEFAULT_CLEANING_OPTIONS, type CleaningOptions } from "@/lib/text/types";

export function TextCleaner() {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<CleaningOptions>({ ...DEFAULT_CLEANING_OPTIONS });
  const [filename, setFilename] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const cleanedText = useMemo(() => cleanText(text, options), [text, options]);

  function toggleOption(key: keyof CleaningOptions) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
    setFeedback(null);
  }

  function handleFileLoaded(name: string, content: string) {
    setFilename(name);
    setText(content);
    setFeedback(`Loaded ${name} locally.`);
  }

  function handleTextChange(newText: string) {
    setText(newText);
    if (filename) setFilename(null);
    setFeedback(null);
  }

  async function handleCopyOutput() {
    if (!cleanedText) return;
    const success = await copyTextToClipboard(cleanedText);
    setFeedback(success ? "Copied cleaned text to clipboard." : "Could not copy text.");
  }

  function handleDownloadOutput() {
    if (!cleanedText) return;
    const name = makeTextFilename(filename, "cleaned");
    downloadTextFile(cleanedText, name);
    setFeedback(`Saved cleaned text as ${name}`);
  }

  function handleClear() {
    setText("");
    setFilename(null);
    setFeedback(null);
  }

  return (
    <section className="text-cleaner-shell space-y-6" aria-labelledby="text-cleaner-title">
      <h2 className="sr-only" id="text-cleaner-title">
        Remove Extra Spaces & Clean Text
      </h2>

      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your text is cleaned locally in your browser.</strong>
          <p>Text is never uploaded to ToolNest servers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-4">
          <Card className="p-4">
            <TextEditor
              label="Original Text"
              value={text}
              placeholder="Paste or type unorganized text here to remove duplicate spaces, trim trailing spaces, and strip empty lines..."
              onChange={handleTextChange}
              onClear={handleClear}
              onFileUpload={handleFileLoaded}
              filename={filename}
            />
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Cleaning Options</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.removeDuplicateSpaces}
                  onChange={() => toggleOption("removeDuplicateSpaces")}
                />
                <span>Remove repeated spaces & tabs</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.trimLines}
                  onChange={() => toggleOption("trimLines")}
                />
                <span>Trim leading and trailing space from lines</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.removeEmptyLines}
                  onChange={() => toggleOption("removeEmptyLines")}
                />
                <span>Remove empty & blank lines</span>
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.normalizeLineEndings}
                  onChange={() => toggleOption("normalizeLineEndings")}
                />
                <span>Normalize line breaks (\r\n to \n)</span>
              </label>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-6">
          <Card className="p-4 space-y-4 h-full flex flex-col justify-between">
            <div>
              <div className="json-panel-heading">
                <div>
                  <span className="kicker">Cleaned Result</span>
                  <h2>Cleaned Text</h2>
                </div>
                {cleanedText ? <Badge tone="success">Cleaned</Badge> : <Badge tone="neutral">Waiting</Badge>}
              </div>

              <label className="sr-only" htmlFor="text-cleaner-output">
                Cleaned Output
              </label>
              <textarea
                id="text-cleaner-output"
                className="json-editor mt-2"
                value={cleanedText}
                placeholder="Cleaned text will appear here..."
                readOnly
                spellCheck={false}
              />
            </div>

            <div className="flex gap-2 mt-4">
              <Button disabled={!cleanedText} onClick={() => void handleCopyOutput()}>
                Copy Result
              </Button>
              <Button variant="secondary" disabled={!cleanedText} onClick={handleDownloadOutput}>
                Download .txt
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {feedback && (
        <div className="converter-status" aria-live="polite">
          <p>{feedback}</p>
        </div>
      )}
    </section>
  );
}
