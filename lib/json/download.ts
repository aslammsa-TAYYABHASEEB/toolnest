import type { JsonOperation } from "@/lib/json/types";

function baseName(filename: string) {
  return filename.replace(/\.json$/i, "").trim() || "data";
}

export function makeJsonFilename(
  sourceFilename: string | null,
  operation: JsonOperation,
) {
  const source = sourceFilename ? baseName(sourceFilename) : "data";
  const suffix = operation === "minify" ? "minified" : "formatted";
  return `${source}-${suffix}.json`;
}

export function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyJson(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy-failed");
}
