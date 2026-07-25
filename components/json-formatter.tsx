"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyJson, downloadJson, makeJsonFilename } from "@/lib/json/download";
import {
  formatJsonBytes,
  MAX_JSON_CHARACTERS,
  MAX_JSON_FILE_SIZE,
  readJsonFile,
  validateJsonFile,
} from "@/lib/json/file";
import type {
  JsonOperation,
  JsonParseError,
  JsonProcessResponse,
} from "@/lib/json/types";
import { canProcessJsonInBrowser, createJsonWorker } from "@/lib/json/worker";

type JsonStatus =
  | { tone: "success"; title: string; message: string }
  | { tone: "error"; title: string; message: string; error?: JsonParseError }
  | { tone: "neutral"; title: string; message: string };

function successCopy(operation: JsonOperation, rootType: string) {
  const action = operation === "minify"
    ? "minified"
    : operation === "validate"
      ? "validated and formatted"
      : "formatted";
  return {
    tone: "success" as const,
    title: "Valid JSON",
    message: `The ${rootType} value was ${action} successfully.`,
  };
}

export function JsonFormatter() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<number | null>(null);
  const [lastOperation, setLastOperation] = useState<JsonOperation | null>(null);
  const [status, setStatus] = useState<JsonStatus | null>(null);
  const [processing, setProcessing] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!canProcessJsonInBrowser()) {
      setStatus({
        tone: "error",
        title: "Browser not supported",
        message: "This browser cannot start the local JSON processing worker.",
      });
      return;
    }

    const worker = createJsonWorker();
    workerRef.current = worker;
    setWorkerReady(true);

    worker.onmessage = (event: MessageEvent<JsonProcessResponse>) => {
      const response = event.data;
      if (response.id !== requestIdRef.current) return;
      setProcessing(false);
      setLastOperation(response.operation);

      if (response.ok) {
        setOutput(response.output);
        setStatus(successCopy(response.operation, response.rootType));
        return;
      }

      setOutput("");
      setStatus({
        tone: "error",
        title: "Invalid JSON",
        message: response.error.message,
        error: response.error,
      });
    };

    worker.onerror = () => {
      setProcessing(false);
      setOutput("");
      setStatus({
        tone: "error",
        title: "Processing error",
        message: "ToolNest could not process this JSON. Check the input and try again.",
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const busy = processing || readingFile;
  const hasOutput = output.length > 0 && status?.tone === "success";

  function updateInput(value: string) {
    requestIdRef.current += 1;
    setProcessing(false);
    setOutput("");
    setLastOperation(null);

    if (value.length > MAX_JSON_CHARACTERS) {
      setStatus({
        tone: "error",
        title: "JSON is too large",
        message: `Input is limited to ${MAX_JSON_CHARACTERS.toLocaleString()} characters to protect browser memory.`,
      });
      return;
    }

    setInput(value);
    setStatus(null);
    if (sourceFilename) {
      setSourceFilename(null);
      setSourceSize(null);
    }
  }

  function process(operation: JsonOperation) {
    if (!workerRef.current || !workerReady) {
      setStatus({
        tone: "error",
        title: "Processor unavailable",
        message: "The browser worker is not ready. Reload the page and try again.",
      });
      return;
    }

    if (!input.trim()) {
      setOutput("");
      setStatus({
        tone: "error",
        title: "Add JSON first",
        message: "Paste, type, or upload JSON before running this action.",
      });
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    setProcessing(true);
    setStatus({
      tone: "neutral",
      title: "Processing locally",
      message: operation === "minify"
        ? "Validating and minifying your JSON."
        : "Validating and formatting your JSON.",
    });
    workerRef.current.postMessage({ id, input, operation });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateJsonFile(file);
    if (validationError) {
      setStatus({
        tone: "error",
        title: "Unsupported JSON file",
        message: validationError,
      });
      return;
    }

    requestIdRef.current += 1;
    setProcessing(false);
    setReadingFile(true);
    setStatus({
      tone: "neutral",
      title: "Reading file locally",
      message: "Loading the selected JSON file into the editor.",
    });

    try {
      const content = await readJsonFile(file);
      setInput(content);
      setOutput("");
      setLastOperation(null);
      setSourceFilename(file.name);
      setSourceSize(file.size);
      setStatus({
        tone: "neutral",
        title: "JSON file loaded",
        message: "Choose Format, Minify, or Validate to process it.",
      });
    } catch (caught) {
      setStatus({
        tone: "error",
        title: "File could not be read",
        message: caught instanceof Error
          ? caught.message
          : "ToolNest could not read this JSON file.",
      });
    } finally {
      setReadingFile(false);
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function clear() {
    requestIdRef.current += 1;
    setInput("");
    setOutput("");
    setSourceFilename(null);
    setSourceSize(null);
    setLastOperation(null);
    setProcessing(false);
    setStatus(null);
  }

  async function copyOutput() {
    if (!hasOutput) return;
    try {
      await copyJson(output);
      setStatus({
        tone: "success",
        title: "Copied",
        message: "The JSON output was copied to your clipboard.",
      });
    } catch {
      setStatus({
        tone: "error",
        title: "Copy unavailable",
        message: "This browser could not copy the output. Select it manually or download the file.",
      });
    }
  }

  function downloadOutput() {
    if (!hasOutput || !lastOperation) return;
    const filename = makeJsonFilename(sourceFilename, lastOperation);
    downloadJson(output, filename);
    setStatus({
      tone: "success",
      title: "Download started",
      message: `${filename} is being saved to your device.`,
    });
  }

  return (
    <section className="json-tool-shell" aria-labelledby="json-tool-title">
      <h2 className="sr-only" id="json-tool-title">
        Format and validate JSON
      </h2>

      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your JSON is processed locally in your browser.</strong>
          <p>Text and uploaded files are never sent to ToolNest servers.</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        className="sr-only"
        id="json-file-input"
        type="file"
        accept=".json,application/json"
        disabled={busy}
        onChange={(event) => void handleFile(event)}
      />

      <div className="json-workspace">
        <Card
          as="section"
          className="json-panel"
          aria-labelledby="json-input-title"
          aria-busy={readingFile}
        >
          <div className="json-panel-heading">
            <div>
              <span className="kicker">Input</span>
              <h2 id="json-input-title">JSON source</h2>
            </div>
            <span>{input.length.toLocaleString()} characters</span>
          </div>

          <label className="json-editor-label" htmlFor="json-input">
            Paste, type, or upload JSON
          </label>
          <textarea
            id="json-input"
            className="json-editor"
            value={input}
            placeholder={'{\n  "name": "ToolNest",\n  "private": true\n}'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            disabled={busy}
            onChange={(event) => updateInput(event.target.value)}
          />

          <div className="json-file-row">
            <div>
              <strong>{sourceFilename ?? "Upload a .json file"}</strong>
              <span>
                {sourceFilename && sourceSize !== null
                  ? `${formatJsonBytes(sourceSize)} · Loaded locally`
                  : `JSON only · Maximum ${formatJsonBytes(MAX_JSON_FILE_SIZE)}`}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={openFilePicker}
            >
              {sourceFilename ? "Replace file" : "Upload JSON"}
            </Button>
          </div>

          <div className="json-primary-actions">
            <Button disabled={busy || !workerReady} onClick={() => process("format")}>
              Format
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !workerReady}
              onClick={() => process("minify")}
            >
              Minify
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !workerReady}
              onClick={() => process("validate")}
            >
              Validate
            </Button>
            <Button variant="ghost" disabled={busy || !input} onClick={clear}>
              Clear
            </Button>
          </div>
        </Card>

        <Card
          as="section"
          className="json-panel"
          aria-labelledby="json-output-title"
          aria-busy={processing}
        >
          <div className="json-panel-heading">
            <div>
              <span className="kicker">Output</span>
              <h2 id="json-output-title">Processed JSON</h2>
            </div>
            {hasOutput ? (
              <Badge tone="success">Valid</Badge>
            ) : (
              <Badge>Waiting</Badge>
            )}
          </div>

          <label className="json-editor-label" htmlFor="json-output">
            Formatted or minified output
          </label>
          <textarea
            id="json-output"
            className="json-editor"
            value={output}
            placeholder="Valid JSON output will appear here."
            spellCheck={false}
            readOnly
          />

          <div className="json-output-actions">
            <Button disabled={!hasOutput || busy} onClick={() => void copyOutput()}>
              Copy
            </Button>
            <Button
              variant="secondary"
              disabled={!hasOutput || busy}
              onClick={downloadOutput}
            >
              Download JSON
            </Button>
          </div>
        </Card>
      </div>

      <div className="json-live-status" aria-live="polite" aria-atomic="true">
        {status && (
          <div className={`json-status json-status-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
            <strong>{status.title}</strong>
            <p>{status.message}</p>
            {status.tone === "error" && status.error && (
              <small>
                {status.error.line !== null && status.error.column !== null
                  ? `Near line ${status.error.line}, column ${status.error.column}`
                  : status.error.position !== null
                    ? `Near character ${status.error.position + 1}`
                    : "Review quotes, commas, brackets, and property names."}
              </small>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
