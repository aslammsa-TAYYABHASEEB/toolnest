"use client";

import { useMemo, useState } from "react";
import { StatsPanel } from "@/components/text-tool/stats-panel";
import { TextEditor } from "@/components/text-tool/text-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyTextToClipboard, downloadTextFile, makeTextFilename } from "@/lib/text/download";
import { calculateTextStats, extractKeywords } from "@/lib/text/stats";

export function WordCounter() {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const stats = useMemo(() => calculateTextStats(text), [text]);
  const keywords = useMemo(() => extractKeywords(text), [text]);

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

  async function handleCopy() {
    if (!text) return;
    const success = await copyTextToClipboard(text);
    setFeedback(success ? "Copied text to clipboard." : "Could not copy text.");
  }

  function handleDownload() {
    if (!text) return;
    const name = makeTextFilename(filename, "stats");
    downloadTextFile(text, name);
    setFeedback(`Saved as ${name}`);
  }

  function handleClear() {
    setText("");
    setFilename(null);
    setFeedback(null);
  }

  return (
    <section className="word-counter-shell space-y-6" aria-labelledby="word-counter-title">
      <h2 className="sr-only" id="word-counter-title">
        Word Counter and Text Statistics
      </h2>

      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your text is analyzed locally in your browser.</strong>
          <p>Text is never sent to ToolNest servers or saved anywhere else.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <Card className="p-4">
            <TextEditor
              label="Enter or paste text"
              value={text}
              placeholder="Paste or type text here to count words, characters, sentences, and reading time..."
              onChange={handleTextChange}
              onClear={handleClear}
              onCopy={() => void handleCopy()}
              onFileUpload={handleFileLoaded}
              filename={filename}
            />

            <div className="mt-4 flex gap-2">
              <Button disabled={!text} onClick={handleDownload}>
                Download .txt
              </Button>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <StatsPanel stats={stats} keywords={keywords} />
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
