import type { CaseStyle, CleaningOptions } from "@/lib/text/types";

function toWords(input: string): string[] {
  return input
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[\W_]+/g, " ")
    .trim()
    .split(/\s+/);
}

export function convertCase(text: string, style: CaseStyle): string {
  if (!text) return "";

  switch (style) {
    case "uppercase":
      return text.toUpperCase();

    case "lowercase":
      return text.toLowerCase();

    case "titlecase":
      return text.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
      );

    case "sentencecase":
      return text
        .toLowerCase()
        .replace(/(^\s*|[.!?]\s+)(\w)/g, (match) => match.toUpperCase());

    case "camelcase": {
      const words = toWords(text);
      if (words.length === 0) return "";
      return (
        words[0].toLowerCase()
        + words
          .slice(1)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join("")
      );
    }

    case "kebabcase": {
      const words = toWords(text);
      return words.map((w) => w.toLowerCase()).join("-");
    }

    case "snakecase": {
      const words = toWords(text);
      return words.map((w) => w.toLowerCase()).join("_");
    }

    case "constantcase": {
      const words = toWords(text);
      return words.map((w) => w.toUpperCase()).join("_");
    }

    default:
      return text;
  }
}

export function cleanText(text: string, options: CleaningOptions): string {
  if (!text) return "";

  let result = text;

  if (options.normalizeLineEndings) {
    result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  let lines = result.split("\n");

  if (options.trimLines) {
    lines = lines.map((line) => line.trim());
  }

  if (options.removeDuplicateSpaces) {
    lines = lines.map((line) => line.replace(/[ \t]+/g, " "));
  }

  if (options.removeEmptyLines) {
    lines = lines.filter((line) => line.trim().length > 0);
  }

  return lines.join("\n");
}
