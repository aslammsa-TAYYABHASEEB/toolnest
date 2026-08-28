"use client";

import { useMemo, useState } from "react";
import { TextEditor } from "@/components/text-tool/text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyTextToClipboard, downloadTextFile, makeTextFilename } from "@/lib/text/download";
import { convertCase } from "@/lib/text/transform";
import type { CaseStyle } from "@/lib/text/types";

const CASE_OPTIONS: Array<{ style: CaseStyle; label: string; example: string }> = [
  { style: "uppercase", label: "UPPERCASE", example: "HELLO WORLD" },
  { style: "lowercase", label: "lowercase", example: "hello world" },
  { style: "titlecase", label: "Title Case", example: "Hello World" },
  { style: "sentencecase", label: "Sentence case", example: "Hello world" },
  { style: "camelcase", label: "camelCase", example: "helloWorld" },
  { style: "kebabcase", label: "kebab-case", example: "hello-world" },
  { style: "snakecase", label: "snake_case", example: "hello_world" },
  { style: "constantcase", label: "CONSTANT_CASE", example: "HELLO_WORLD" },
];

export function CaseConverter() {
  const [text, setText] = useState("");
  const [activeStyle, setActiveStyle] = useState<CaseStyle>("uppercase");
  const [filename, setFilename] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const convertedText = useMemo(() => convertCase(text, activeStyle), [text, activeStyle]);

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
    if (!convertedText) return;
    const success = await copyTextToClipboard(convertedText);
    setFeedback(success ? "Copied converted text to clipboard." : "Could not copy text.");
  }

  function handleDownloadOutput() {
    if (!convertedText) return;
    const name = makeTextFilename(filename, activeStyle);
    downloadTextFile(convertedText, name);
    setFeedback(`Saved converted text as ${name}`);
  }

  function handleClear() {
    setText("");
    setFilename(null);
    setFeedback(null);
  }

  return (
    <section className="case-converter-shell space-y-6" aria-labelledby="case-converter-title">
      <h2 className="sr-only" id="case-converter-title">
        Case Converter
      </h2>

      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your text is converted locally in your browser.</strong>
          <p>Text is never sent to ToolNest servers.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-4">
          <Card className="p-4">
            <TextEditor
              label="Original Text"
              value={text}
              placeholder="Paste or type text here to switch between uppercase, lowercase, title case, camelCase..."
              onChange={handleTextChange}
              onClear={handleClear}
              onFileUpload={handleFileLoaded}
              filename={filename}
            />
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Select Case Style</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CASE_OPTIONS.map((opt) => (
                <button
                  key={opt.style}
                  type="button"
                  className={`p-2 rounded border text-left text-xs transition-colors ${
                    activeStyle === opt.style
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                  onClick={() => {
                    setActiveStyle(opt.style);
                    setFeedback(null);
                  }}
                >
                  <span className="block font-medium">{opt.label}</span>
                  <span className="block opacity-75 truncate">{opt.example}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-6">
          <Card className="p-4 space-y-4 h-full flex flex-col justify-between">
            <div>
              <div className="json-panel-heading">
                <div>
                  <span className="kicker">Converted</span>
                  <h2>Output ({activeStyle})</h2>
                </div>
                {convertedText ? <Badge tone="success">Ready</Badge> : <Badge tone="neutral">Waiting</Badge>}
              </div>

              <label className="sr-only" htmlFor="case-converter-output">
                Converted Output
              </label>
              <textarea
                id="case-converter-output"
                className="json-editor mt-2"
                value={convertedText}
                placeholder="Converted text will appear here..."
                readOnly
                spellCheck={false}
              />
            </div>

            <div className="flex gap-2 mt-4">
              <Button disabled={!convertedText} onClick={() => void handleCopyOutput()}>
                Copy Result
              </Button>
              <Button variant="secondary" disabled={!convertedText} onClick={handleDownloadOutput}>
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
