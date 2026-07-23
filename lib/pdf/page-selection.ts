import { PdfProcessingError } from "@/lib/pdf/errors";
import {
  MAX_PDF_SPLIT_OUTPUT_FILES,
  MAX_PDF_SPLIT_WORK_PAGES,
  type PdfPageGroup,
} from "@/lib/pdf/types";

type ParsedToken = {
  pages: number[];
  start: number;
  end: number;
};

function parseToken(token: string, pageCount: number): ParsedToken {
  const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      `"${token || "empty value"}" is not a valid page number or range.`,
    );
  }

  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : first;
  if (first < 1 || second < 1) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Page numbers must start at 1.",
    );
  }
  if (first > pageCount || second > pageCount) {
    throw new PdfProcessingError(
      "page-out-of-range",
      `Choose pages between 1 and ${pageCount}.`,
    );
  }

  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return {
    start,
    end,
    pages: Array.from({ length: end - start + 1 }, (_, index) => start + index),
  };
}

function splitTokens(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Enter at least one page number or range.",
    );
  }
  const tokens = trimmed.split(",");
  if (tokens.some((token) => token.trim() === "")) {
    throw new PdfProcessingError(
      "invalid-page-selection",
      "Remove the empty value between commas.",
    );
  }
  return tokens;
}

function assertWorkload(pageCount: number) {
  if (pageCount > MAX_PDF_SPLIT_WORK_PAGES) {
    throw new PdfProcessingError(
      "workload-too-large",
      `This operation would copy ${pageCount} pages. Select no more than ${MAX_PDF_SPLIT_WORK_PAGES} pages at once to protect browser memory.`,
    );
  }
}

function compactPageLabel(pages: number[]) {
  const parts: string[] = [];
  let start = pages[0];
  let end = start;

  for (const page of pages.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = page;
    end = page;
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join("-");
}

export function formatPageSelection(pages: number[]) {
  if (pages.length === 0) return "";
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let end = start;
  for (const page of sorted.slice(1)) {
    if (page === end + 1) {
      end = page;
      continue;
    }
    parts.push(start === end ? `${start}` : `${start}-${end}`);
    start = page;
    end = page;
  }
  parts.push(start === end ? `${start}` : `${start}-${end}`);
  return parts.join(",");
}

export function parsePageSelection(
  value: string,
  pageCount: number,
): PdfPageGroup {
  const selected = new Set<number>();
  for (const token of splitTokens(value)) {
    parseToken(token, pageCount).pages.forEach((page) => selected.add(page));
  }
  const pages = Array.from(selected).sort((a, b) => a - b);
  assertWorkload(pages.length);
  const fullLabel = compactPageLabel(pages);
  const filenameLabel = fullLabel.length <= 80 ? fullLabel : "selected";
  return {
    pages,
    filenameLabel,
    summary: `${pages.length} page${pages.length === 1 ? "" : "s"}: ${pages.join(", ")}`,
  };
}

export function parsePageRanges(
  value: string,
  pageCount: number,
): PdfPageGroup[] {
  const seen = new Set<number>();
  const groups = splitTokens(value).map((token) => {
    const parsed = parseToken(token, pageCount);
    if (parsed.pages.some((page) => seen.has(page))) {
      throw new PdfProcessingError(
        "overlapping-ranges",
        "Ranges cannot overlap or include the same page more than once.",
      );
    }
    parsed.pages.forEach((page) => seen.add(page));
    const label = parsed.start === parsed.end
      ? `${parsed.start}`
      : `${parsed.start}-${parsed.end}`;
    return {
      pages: parsed.pages,
      filenameLabel: label,
      summary: parsed.start === parsed.end
        ? `Page ${parsed.start}`
        : `Pages ${parsed.start}–${parsed.end}`,
    };
  });

  if (groups.length > MAX_PDF_SPLIT_OUTPUT_FILES) {
    throw new PdfProcessingError(
      "too-many-output-files",
      `Create no more than ${MAX_PDF_SPLIT_OUTPUT_FILES} output files at once.`,
    );
  }
  assertWorkload(seen.size);
  return groups;
}

export function createEveryPageGroups(pageCount: number): PdfPageGroup[] {
  if (pageCount > MAX_PDF_SPLIT_OUTPUT_FILES) {
    throw new PdfProcessingError(
      "too-many-output-files",
      `Splitting every page would create ${pageCount} files. The browser safety limit is ${MAX_PDF_SPLIT_OUTPUT_FILES}.`,
    );
  }
  assertWorkload(pageCount);
  return Array.from({ length: pageCount }, (_, index) => ({
    pages: [index + 1],
    filenameLabel: `${index + 1}`,
    summary: `Page ${index + 1}`,
  }));
}
