import {
  decodePDFRawStream,
  degrees,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { PdfProcessingError } from "@/lib/pdf/errors";
import { makeSearchablePdfFilename } from "@/lib/pdf/filenames";
import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { createPdfOcrEngine, recognizePdfPage, type WordProgressPhase } from "@/lib/pdf/to-word";
import { validatePdfFile, validatePdfTotalSize } from "@/lib/pdf/validation";
import type { OcrLayoutLine } from "@/lib/pdf/ocr-word-layout";
import type { WordPage, WordSpan } from "@/lib/pdf/word-layout";

export const MAX_SEARCHABLE_PDF_SOURCE_PAGES = 200;
export const MAX_SEARCHABLE_PDF_OUTPUT_SIZE = 200 * 1024 * 1024;
export const SEARCHABLE_PDF_MIN_TEXT_CHARS = 25;

export type SearchablePdfProgressPhase = WordProgressPhase | "saving";
export type SearchableTextPlacement = {
  text: string;
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
  hidden?: boolean;
};
export type SearchablePdfResult = {
  blob: Blob;
  filename: string;
  size: number;
  pageCount: number;
  ocrPageCount: number;
  preservedTextPageCount: number;
  unreadablePageCount: number;
};

type PdfViewport = {
  width: number;
  height: number;
  convertToPdfPoint(x: number, y: number): number[];
};

type PdfTextContent = {
  items: Array<unknown>;
};

type PdfOperatorList = {
  fnArray: number[];
  argsArray: unknown[][];
};

type PdfOperatorCodes = {
  save: number;
  restore: number;
  setGState: number;
  setTextRenderingMode: number;
  showText: number;
  showSpacedText: number;
  nextLineShowText: number;
  nextLineSetSpacingShowText: number;
};

export function hasUsablePdfText(textContent: PdfTextContent) {
  return textContent.items.reduce<number>((count, item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return count;
    return count + String(item.str ?? "").replace(/\s/g, "").length;
  }, 0) >= SEARCHABLE_PDF_MIN_TEXT_CHARS;
}

function splitPlacementWords(placement: SearchableTextPlacement) {
  const matches = Array.from(placement.text.matchAll(/\S+/g));
  if (matches.length <= 1) return [{ ...placement, text: placement.text.trim() }];
  const radians = placement.angle * Math.PI / 180;
  return matches.map((match) => {
    const start = (match.index ?? 0) / placement.text.length;
    const length = match[0].length / placement.text.length;
    const offset = placement.width * start;
    return {
      ...placement,
      text: match[0],
      x: placement.x + Math.cos(radians) * offset,
      y: placement.y + Math.sin(radians) * offset,
      width: placement.width * length,
    };
  });
}

function spansFromWordPage(page: WordPage): WordSpan[] {
  return page.blocks.flatMap((block) => {
    if (block.kind === "image") return [];
    if (block.kind === "table") return block.rows.flat(2).flatMap((line) => line.spans);
    return block.lines.flatMap((line) => line.spans);
  }).filter((span) => span.text.trim());
}

function inverseRotatedPoint(
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270,
  width: number,
  height: number,
): [number, number] {
  if (rotation === 90) return [y, height - x];
  if (rotation === 180) return [width - x, height - y];
  if (rotation === 270) return [width - y, x];
  return [x, y];
}

/** Map the OCR page's top-down coordinates back through its corrective
 * rotation and PDF.js viewport into original PDF user-space coordinates. */
export function searchablePlacements(
  wordPage: WordPage,
  ocrRotation: 0 | 90 | 180 | 270,
  viewport: PdfViewport,
): SearchableTextPlacement[] {
  return spansFromWordPage(wordPage).flatMap((span) => {
    const start = inverseRotatedPoint(span.x, span.y, ocrRotation, viewport.width, viewport.height);
    const end = inverseRotatedPoint(span.x + span.width, span.y, ocrRotation, viewport.width, viewport.height);
    const top = inverseRotatedPoint(span.x, span.y - span.size, ocrRotation, viewport.width, viewport.height);
    const [x, y] = viewport.convertToPdfPoint(...start);
    const [endX, endY] = viewport.convertToPdfPoint(...end);
    const [topX, topY] = viewport.convertToPdfPoint(...top);
    return splitPlacementWords({
      text: span.text,
      x,
      y,
      angle: Math.atan2(endY - y, endX - x) * 180 / Math.PI,
      width: Math.hypot(endX - x, endY - y),
      height: Math.hypot(topX - x, topY - y),
    });
  }).filter((placement) => placement.width > 1 && placement.height > 1);
}

/** Preserve Tesseract's measured word boxes. Reconstructing word positions
 * from a whole line's character count shifts highlights on proportional text. */
export function searchableOcrWordPlacements(
  lines: OcrLayoutLine[],
  pixelWidth: number,
  pixelHeight: number,
  ocrRotation: 0 | 90 | 180 | 270,
  viewport: PdfViewport,
): SearchableTextPlacement[] {
  const swap = ocrRotation === 90 || ocrRotation === 270;
  const orientedWidth = swap ? viewport.height : viewport.width;
  const orientedHeight = swap ? viewport.width : viewport.height;
  const scaleX = orientedWidth / pixelWidth;
  const scaleY = orientedHeight / pixelHeight;
  return lines.flatMap((line) => line.words).filter((word) => word.text.trim()).map((word) => {
    const start = inverseRotatedPoint(word.x0 * scaleX, word.y1 * scaleY, ocrRotation, viewport.width, viewport.height);
    const end = inverseRotatedPoint(word.x1 * scaleX, word.y1 * scaleY, ocrRotation, viewport.width, viewport.height);
    const top = inverseRotatedPoint(word.x0 * scaleX, word.y0 * scaleY, ocrRotation, viewport.width, viewport.height);
    const [x, y] = viewport.convertToPdfPoint(...start);
    const [endX, endY] = viewport.convertToPdfPoint(...end);
    const [topX, topY] = viewport.convertToPdfPoint(...top);
    return {
      text: word.text,
      x,
      y,
      angle: Math.atan2(endY - y, endX - x) * 180 / Math.PI,
      width: Math.hypot(endX - x, endY - y),
      height: Math.hypot(topX - x, topY - y),
    };
  }).filter((placement) => placement.width > 1 && placement.height > 1);
}

const normalizedSearchToken = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");

function glyphText(value: unknown): string {
  if (Array.isArray(value)) return value.map(glyphText).join("");
  if (value && typeof value === "object" && "unicode" in value) return String(value.unicode ?? "");
  return "";
}

function sourceTextHiddenFlags(operatorList: PdfOperatorList, ops: PdfOperatorCodes) {
  type TextState = { fillAlpha: number; strokeAlpha: number; mode: number };
  let state: TextState = { fillAlpha: 1, strokeAlpha: 1, mode: 0 };
  const stack: TextState[] = [];
  const runs: Array<{ token: string; hidden: boolean }> = [];
  const visible = () => {
    if (state.mode === 3 || state.mode === 7) return false;
    const fills = state.mode === 0 || state.mode === 2 || state.mode === 4 || state.mode === 6;
    const strokes = state.mode === 1 || state.mode === 2 || state.mode === 5 || state.mode === 6;
    return (fills && state.fillAlpha > .01) || (strokes && state.strokeAlpha > .01);
  };
  const showCodes = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);
  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] ?? [];
    if (fn === ops.save) stack.push({ ...state });
    else if (fn === ops.restore) state = stack.pop() ?? state;
    else if (fn === ops.setTextRenderingMode) state.mode = Number(args[0]);
    else if (fn === ops.setGState) {
      const entries = Array.isArray(args[0]) ? args[0] : [];
      for (const entry of entries) {
        if (!Array.isArray(entry)) continue;
        if (entry[0] === "ca") state.fillAlpha = Number(entry[1]);
        if (entry[0] === "CA") state.strokeAlpha = Number(entry[1]);
      }
    } else if (showCodes.has(fn)) {
      const token = normalizedSearchToken(glyphText(args));
      if (token) runs.push({ token, hidden: !visible() });
    }
  }
  return runs;
}

/** Read even a sparse source text layer so OCR can fill the page without
 * adding a second searchable copy of an existing watermark or hidden word. */
export function sourceTextPlacements(
  textContent: PdfTextContent,
  operatorList?: PdfOperatorList,
  ops?: PdfOperatorCodes,
): SearchableTextPlacement[] {
  const runs = operatorList && ops ? sourceTextHiddenFlags(operatorList, ops) : [];
  let runIndex = 0;
  return textContent.items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return [];
    const record = item as { str?: unknown; width?: unknown; height?: unknown; transform?: unknown };
    if (typeof record.str !== "string" || !record.str.trim() || !Array.isArray(record.transform) || record.transform.length < 6) return [];
    const transform = record.transform.map(Number);
    if (!transform.every(Number.isFinite)) return [];
    const width = Math.abs(Number(record.width));
    const height = Math.max(Math.abs(Number(record.height)), Math.hypot(transform[2], transform[3]));
    if (!Number.isFinite(width + height) || width <= 0 || height <= 0) return [];
    const itemToken = normalizedSearchToken(record.str);
    let hidden = false;
    for (let index = runIndex; index < Math.min(runs.length, runIndex + 8); index += 1) {
      if (runs[index].token !== itemToken) continue;
      hidden = runs[index].hidden;
      runIndex = index + 1;
      break;
    }
    return splitPlacementWords({
      text: record.str,
      x: transform[4],
      y: transform[5],
      angle: Math.atan2(transform[1], transform[0]) * 180 / Math.PI,
      width,
      height,
      hidden,
    });
  });
}

const angleDifference = (left: number, right: number) => Math.abs((((left - right + 90) % 180) + 180) % 180 - 90);
function placementCenter(placement: SearchableTextPlacement): [number, number] {
  const radians = placement.angle * Math.PI / 180;
  return [
    placement.x + Math.cos(radians) * placement.width / 2 - Math.sin(radians) * placement.height / 2,
    placement.y + Math.sin(radians) * placement.width / 2 + Math.cos(radians) * placement.height / 2,
  ];
}

function placementsAlign(left: SearchableTextPlacement, right: SearchableTextPlacement) {
  if (angleDifference(left.angle, right.angle) > 20) return false;
  const [leftX, leftY] = placementCenter(left);
  const [rightX, rightY] = placementCenter(right);
  const widthRatio = Math.max(left.width, right.width) / Math.max(1, Math.min(left.width, right.width));
  const heightRatio = Math.max(left.height, right.height) / Math.max(1, Math.min(left.height, right.height));
  const tolerance = Math.max(10, left.height * 1.6, right.height * 1.6, Math.min(left.width, right.width) * .3);
  return widthRatio <= 4 && heightRatio <= 4 && Math.hypot(leftX - rightX, leftY - rightY) <= tolerance;
}

function placementIsPlausible(placement: SearchableTextPlacement, width: number, height: number) {
  const [x, y] = placementCenter(placement);
  return Number.isFinite(x + y + placement.width + placement.height)
    && placement.width > 0 && placement.height > 0
    && placement.width < width * 1.25 && placement.height < height * .25
    && x >= -4 && x <= width + 4 && y >= -4 && y <= height + 4;
}

export function planSearchableTextLayer(
  ocr: SearchableTextPlacement[],
  existing: SearchableTextPlacement[],
  pageWidth = Number.POSITIVE_INFINITY,
  pageHeight = Number.POSITIVE_INFINITY,
) {
  const ocrByToken = new Map<string, SearchableTextPlacement[]>();
  for (const placement of ocr) {
    const token = normalizedSearchToken(placement.text);
    if (!token) continue;
    const values = ocrByToken.get(token) ?? [];
    values.push(placement);
    ocrByToken.set(token, values);
  }

  let sanitizeInvisibleSourceText = false;
  const hiddenByToken = new Map<string, SearchableTextPlacement[]>();
  for (const placement of existing.filter((item) => item.hidden)) {
    const token = normalizedSearchToken(placement.text);
    if (!token) continue;
    const values = hiddenByToken.get(token) ?? [];
    values.push(placement);
    hiddenByToken.set(token, values);
    if (!placementIsPlausible(placement, pageWidth, pageHeight)) sanitizeInvisibleSourceText = true;
  }
  for (const [token, hidden] of hiddenByToken) {
    const candidates = ocrByToken.get(token) ?? [];
    const available = new Set(candidates.map((_, index) => index));
    for (const source of hidden) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const index of available) {
        if (!placementsAlign(source, candidates[index])) continue;
        const [sourceX, sourceY] = placementCenter(source);
        const [candidateX, candidateY] = placementCenter(candidates[index]);
        const distance = Math.hypot(sourceX - candidateX, sourceY - candidateY);
        if (distance < bestDistance) { bestIndex = index; bestDistance = distance; }
      }
      if (bestIndex >= 0) available.delete(bestIndex);
      else if (candidates.length) sanitizeInvisibleSourceText = true;
    }
  }

  const preserved = sanitizeInvisibleSourceText ? existing.filter((item) => !item.hidden) : existing;
  return {
    placements: ocr.filter((candidate) => !preserved.some((source) =>
      normalizedSearchToken(source.text) === normalizedSearchToken(candidate.text) && placementsAlign(source, candidate))),
    sanitizeInvisibleSourceText,
  };
}

export function removeExistingTextDuplicates(
  ocr: SearchableTextPlacement[],
  existing: SearchableTextPlacement[],
) {
  return planSearchableTextLayer(ocr, existing).placements;
}

function encodableEnglishText(font: PDFFont, value: string) {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  let result = "";
  for (const character of normalized) {
    try { font.encodeText(character); result += character; }
    catch { result += " "; }
  }
  return result.replace(/\s+/g, " ").trim();
}

type ContentToken = { value: string; start: number; end: number };
const pdfDelimiter = (character: string) => /[\s()<>\[\]{}\/%]/.test(character);
function contentTokens(source: string) {
  const tokens: ContentToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) { index += 1; continue; }
    if (source[index] === "%") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index += 1;
      continue;
    }
    const start = index;
    if (source[index] === "(") {
      let depth = 1; index += 1;
      while (index < source.length && depth) {
        if (source[index] === "\\") index += 2;
        else { if (source[index] === "(") depth += 1; if (source[index] === ")") depth -= 1; index += 1; }
      }
      tokens.push({ value: "string", start, end: index });
      continue;
    }
    if (source[index] === "<" && source[index + 1] !== "<") {
      index = source.indexOf(">", index + 1);
      index = index < 0 ? source.length : index + 1;
      tokens.push({ value: "string", start, end: index });
      continue;
    }
    if (source[index] === "/") {
      index += 1;
      while (index < source.length && !pdfDelimiter(source[index])) index += 1;
      tokens.push({ value: source.slice(start, index), start, end: index });
      continue;
    }
    while (index < source.length && !pdfDelimiter(source[index])) index += 1;
    if (index === start) { index += 1; continue; }
    const value = source.slice(start, index);
    tokens.push({ value, start, end: index });
    if (value === "ID") {
      const match = /\sEI(?=\s|$)/g;
      match.lastIndex = index;
      const end = match.exec(source);
      if (end) index = end.index + end[0].length;
    }
  }
  return tokens;
}

function invisibleGraphicsStates(page: PDFPage) {
  const values = new Map<string, { fillAlpha?: number; strokeAlpha?: number }>();
  const resources = page.node.Resources();
  const states = resources?.lookupMaybe(PDFName.of("ExtGState"), PDFDict);
  if (!states) return values;
  for (const [name, value] of states.entries()) {
    const state = page.doc.context.lookupMaybe(value, PDFDict);
    if (!state) continue;
    values.set(name.asString(), {
      fillAlpha: state.lookupMaybe(PDFName.of("ca"), PDFNumber)?.asNumber(),
      strokeAlpha: state.lookupMaybe(PDFName.of("CA"), PDFNumber)?.asNumber(),
    });
  }
  return values;
}

function stripInvisibleTextBlocks(source: string, graphicsStates: ReturnType<typeof invisibleGraphicsStates>) {
  type State = { fillAlpha: number; strokeAlpha: number; mode: number };
  let state: State = { fillAlpha: 1, strokeAlpha: 1, mode: 0 };
  const stack: State[] = [];
  const tokens = contentTokens(source);
  const ranges: Array<[number, number]> = [];
  let textStart = -1;
  let textHidden = false;
  const visible = () => {
    if (state.mode === 3 || state.mode === 7) return false;
    const fills = state.mode === 0 || state.mode === 2 || state.mode === 4 || state.mode === 6;
    const strokes = state.mode === 1 || state.mode === 2 || state.mode === 5 || state.mode === 6;
    return (fills && state.fillAlpha > .01) || (strokes && state.strokeAlpha > .01);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "q") stack.push({ ...state });
    else if (token.value === "Q") state = stack.pop() ?? state;
    else if (token.value === "Tr") {
      state.mode = Number(tokens[index - 1]?.value);
      if (textStart >= 0) textHidden ||= !visible();
    }
    else if (token.value === "gs") {
      const named = graphicsStates.get(tokens[index - 1]?.value ?? "");
      if (named?.fillAlpha !== undefined) state.fillAlpha = named.fillAlpha;
      if (named?.strokeAlpha !== undefined) state.strokeAlpha = named.strokeAlpha;
      if (textStart >= 0) textHidden ||= !visible();
    } else if (token.value === "BT") {
      textStart = token.start;
      textHidden = !visible();
    } else if (token.value === "ET" && textStart >= 0) {
      if (textHidden) ranges.push([textStart, token.end]);
      textStart = -1;
      textHidden = false;
    }
  }
  if (!ranges.length) return { source, removed: 0 };
  let cursor = 0;
  const pieces: string[] = [];
  for (const [start, end] of ranges) { pieces.push(source.slice(cursor, start)); cursor = end; }
  pieces.push(source.slice(cursor));
  return { source: pieces.join(""), removed: ranges.length };
}

function latin1Decode(bytes: Uint8Array) {
  let result = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return result;
}

function latin1Encode(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function sanitizeInvisiblePageText(page: PDFPage) {
  const contents = page.node.Contents();
  if (!contents) return 0;
  const values = contents instanceof PDFArray ? contents.asArray() : [contents];
  const decoded: string[] = [];
  for (const value of values) {
    const stream = page.doc.context.lookup(value);
    if (!(stream instanceof PDFRawStream)) return 0;
    decoded.push(latin1Decode(decodePDFRawStream(stream).decode()));
  }
  const stripped = stripInvisibleTextBlocks(decoded.join("\n"), invisibleGraphicsStates(page));
  if (!stripped.removed) return 0;
  const stream = page.doc.context.flateStream(latin1Encode(stripped.source));
  page.node.set(PDFName.of("Contents"), page.doc.context.register(stream));
  return stripped.removed;
}

export async function addSearchableTextLayers(
  source: Uint8Array,
  layers: Map<number, SearchableTextPlacement[]>,
  sanitizeInvisibleTextPages = new Set<number>(),
) {
  const document = await PDFDocument.load(source, { ignoreEncryption: false, updateMetadata: false });
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const [pageNumber, placements] of layers) {
    const page = document.getPage(pageNumber - 1);
    if (sanitizeInvisibleTextPages.has(pageNumber) && !sanitizeInvisiblePageText(page)) {
      throw new PdfProcessingError("searchable-pdf-failed", `Page ${pageNumber}'s unreliable hidden text layer could not be safely replaced.`);
    }
    for (const placement of placements) {
      const text = encodableEnglishText(font, placement.text);
      if (!text) continue;
      let size = Math.max(3, Math.min(72, placement.height * 0.82));
      const measured = font.widthOfTextAtSize(text, size);
      if (measured > placement.width && measured > 0) size *= placement.width / measured;
      page.drawText(text, {
        x: placement.x,
        y: placement.y,
        size: Math.max(2, size),
        font,
        rotate: degrees(placement.angle),
        // A near-zero fill avoids a Poppler rendering bug triggered by a
        // fully transparent text graphics state while remaining invisible.
        opacity: 0.0001,
      });
    }
  }
  return document.save();
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new PdfProcessingError("searchable-pdf-failed", "Searchable PDF creation was cancelled.");
}

export async function createSearchablePdf(
  file: File,
  onProgress?: (current: number, total: number, phase: SearchablePdfProgressPhase, subProgress?: number) => void,
  signal?: AbortSignal,
): Promise<SearchablePdfResult> {
  await validatePdfFile(file);
  validatePdfTotalSize([file]);
  assertNotCancelled(signal);
  const renderer = await loadPdfRendererDocument(file);
  let engine: Awaited<ReturnType<typeof createPdfOcrEngine>> | null = null;
  const layers = new Map<number, SearchableTextPlacement[]>();
  const sanitizeInvisibleTextPages = new Set<number>();
  let preservedTextPageCount = 0;
  let unreadablePageCount = 0;
  try {
    if (!renderer.numPages || renderer.numPages > MAX_SEARCHABLE_PDF_SOURCE_PAGES) {
      throw new PdfProcessingError("searchable-pdf-workload-too-large", `This tool supports PDFs with up to ${MAX_SEARCHABLE_PDF_SOURCE_PAGES} pages.`);
    }
    for (let pageNumber = 1; pageNumber <= renderer.numPages; pageNumber += 1) {
      assertNotCancelled(signal);
      onProgress?.(pageNumber, renderer.numPages, "extracting");
      const page = await renderer.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        if (hasUsablePdfText(textContent)) {
          preservedTextPageCount += 1;
          continue;
        }
        const pdfjs = await import("pdfjs-dist");
        const operatorList = await page.getOperatorList();
        const reportOcrProgress = onProgress ? (current: number, total: number, phase?: WordProgressPhase, part?: number) => onProgress(current, total, phase ?? "ocr", part) : undefined;
        if (!engine) engine = await createPdfOcrEngine(reportOcrProgress, pageNumber, renderer.numPages);
        const recognized = await recognizePdfPage(page, pageNumber, renderer.numPages, engine, reportOcrProgress, signal, true);
        assertNotCancelled(signal);
        const viewport = page.getViewport({ scale: 1 });
        const plan = planSearchableTextLayer(
          searchableOcrWordPlacements(
            recognized.ocrLines,
            recognized.ocrPixelWidth,
            recognized.ocrPixelHeight,
            recognized.rotation,
            viewport,
          ),
          sourceTextPlacements(textContent, operatorList, pdfjs.OPS as PdfOperatorCodes),
          viewport.width,
          viewport.height,
        );
        const placements = plan.placements;
        if (plan.sanitizeInvisibleSourceText) sanitizeInvisibleTextPages.add(pageNumber);
        if (placements.length) layers.set(pageNumber, placements);
        else unreadablePageCount += 1;
      } finally { page.cleanup(); }
    }
    assertNotCancelled(signal);
    if (layers.size === 0 && preservedTextPageCount === 0) {
      throw new PdfProcessingError("ocr-failed", "No readable English text could be recovered. Try a clearer scan.");
    }
    onProgress?.(renderer.numPages, renderer.numPages, "saving");
    const source = new Uint8Array(await file.arrayBuffer());
    const saved = layers.size ? await addSearchableTextLayers(source, layers, sanitizeInvisibleTextPages) : source;
    if (saved.byteLength > MAX_SEARCHABLE_PDF_OUTPUT_SIZE) {
      throw new PdfProcessingError("searchable-pdf-output-too-large", "The searchable PDF exceeds the 200 MB browser safety limit.");
    }
    const blob = new Blob([saved.slice().buffer], { type: "application/pdf" });
    return {
      blob,
      filename: makeSearchablePdfFilename(file.name),
      size: blob.size,
      pageCount: renderer.numPages,
      ocrPageCount: layers.size,
      preservedTextPageCount,
      unreadablePageCount,
    };
  } catch (caught) {
    if (caught instanceof PdfProcessingError) throw caught;
    throw new PdfProcessingError("searchable-pdf-failed", caught instanceof Error ? caught.message : "The searchable PDF could not be created.");
  } finally {
    if (engine) await engine.terminate();
    await renderer.destroy();
  }
}
