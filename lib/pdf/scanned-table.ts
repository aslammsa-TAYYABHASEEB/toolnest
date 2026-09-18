import type { OcrLayoutLine } from "./ocr-word-layout";
import type { GridMerge } from "./vector-table";

export type ScannedGridTable = {
  rows: string[][];
  merges: GridMerge[];
  headerRows: number;
  diagnostics: { horizontalLines: number; verticalLines: number; words: number; assignedWords: number };
};

type Rule = { at: number; start: number; end: number; pixels: number };
type Word = { text: string; x0: number; x1: number; y0: number; y1: number; confidence: number };

function clusterRules(rules: Rule[], tolerance: number): Rule[] {
  const groups: Rule[] = [];
  for (const rule of rules.sort((a, b) => a.at - b.at)) {
    const previous = groups.at(-1);
    if (previous && rule.at - previous.at <= tolerance) {
      previous.at = (previous.at + rule.at) / 2;
      previous.start = Math.min(previous.start, rule.start);
      previous.end = Math.max(previous.end, rule.end);
      previous.pixels += rule.pixels;
    } else groups.push({ ...rule });
  }
  return groups;
}

function lineRuns(data: Uint8Array, width: number, height: number, horizontal: boolean): Rule[] {
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const minLength = inner * (horizontal ? .07 : .035);
  const rules: Rule[] = [];
  for (let at = 0; at < outer; at++) {
    let start = -1, last = -1, pixels = 0;
    const finish = () => {
      if (start >= 0 && last - start >= minLength && pixels / (last - start + 1) >= .72)
        rules.push({ at, start, end: last, pixels });
      start = -1; last = -1; pixels = 0;
    };
    for (let along = 0; along < inner; along++) {
      const dark = data[horizontal ? at * width + along : along * width + at];
      if (dark) {
        if (start < 0) start = along;
        last = along; pixels++;
      } else if (start >= 0 && along - last > 5) finish();
    }
    finish();
  }
  return clusterRules(rules, 4);
}

function coalesceEdges(edges: number[], distance: number): number[] {
  const merged: number[][] = [];
  for (const edge of edges.sort((a, b) => a - b)) {
    const last = merged.at(-1);
    if (last && edge - last.at(-1)! <= distance) last.push(edge);
    else merged.push([edge]);
  }
  return merged.map(group => Math.round(group.reduce((sum, edge) => sum + edge, 0) / group.length));
}

function locate(edges: number[], position: number): number {
  for (let i = 0; i < edges.length - 1; i++)
    if (position >= edges[i] - 2 && position < edges[i + 1] + 2) return i;
  return -1;
}

/** Ruling is measured from the raster, never inferred from OCR prose alone. */
export function extractScannedGridTables(
  canvas: HTMLCanvasElement,
  ocrLines: OcrLayoutLine[],
  ocrWidth: number,
  ocrHeight: number,
): ScannedGridTable[] {
  const width = canvas.width, height = canvas.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || width < 200 || height < 200) return [];
  const rgba = context.getImageData(0, 0, width, height).data;
  const dark = new Uint8Array(width * height);
  for (let pixel = 0, index = 0; pixel < dark.length; pixel++, index += 4)
    dark[pixel] = (rgba[index] * .299 + rgba[index + 1] * .587 + rgba[index + 2] * .114 < 175) ? 1 : 0;
  const horizontal = lineRuns(dark, width, height, true)
    .filter(rule => rule.pixels > width * .22);
  const verticalRules = lineRuns(dark, width, height, false)
    .filter(rule => rule.pixels > height * .09);
  const verticalStrengths = verticalRules.map(rule => rule.pixels).sort((a, b) => a - b);
  const verticalMinimum = Math.max(height * .09,
    (verticalStrengths[Math.floor(verticalStrengths.length / 2)] ?? 0) * .25);
  const vertical = verticalRules.filter(rule => rule.pixels >= verticalMinimum);
  if (horizontal.length < 3 || vertical.length < 3) return [];

  // Three or more parallel vertical rulings must coexist over a meaningful
  // height. This isolates the table from mastheads, signatures and scan marks.
  const coverage = new Int16Array(height + 1);
  for (const rule of vertical) {
    coverage[Math.max(0, Math.floor(rule.start))]++;
    coverage[Math.min(height, Math.ceil(rule.end) + 1)]--;
  }
  const intervals: Array<{ top: number; bottom: number }> = [];
  let active = 0, start = -1;
  for (let row = 0; row < height; row++) {
    active += coverage[row];
    if (active >= 3 && start < 0) start = row;
    if ((active < 3 || row === height - 1) && start >= 0) {
      if (row - start > height * .07) intervals.push({ top: start, bottom: row });
      start = -1;
    }
  }
  const results: ScannedGridTable[] = [];
  for (const { top, bottom } of intervals) {
    const nearby = horizontal.filter(rule => rule.at >= top - 12 && rule.at <= bottom + 12);
    if (nearby.length < 3) continue;
    const strengths = nearby.map(rule => rule.pixels).sort((a, b) => a - b);
    const minimum = Math.max(width * .2, strengths[Math.floor(strengths.length / 2)] * .3);
    const group = nearby.filter(rule => (rule.pixels >= minimum && rule.end - rule.start > width * .28) ||
      Math.abs(rule.at - top) < 8);
    if (group.length < 3) continue;
    const left = Math.min(...group.map(rule => rule.start));
    const right = Math.max(...group.map(rule => rule.end));
    if (right - left < width * .25 || bottom - top < height * .07) continue;
    const x = coalesceEdges([left, right, ...vertical.filter(rule =>
      rule.at >= left - 8 && rule.at <= right + 8 &&
      Math.min(bottom, rule.end) - Math.max(top, rule.start) > (bottom - top) * .35)
      .map(rule => rule.at)], Math.max(8, width * .01));
    const y = coalesceEdges(group.map(rule => rule.at), Math.max(5, height * .01));
    const gaps = y.slice(1).map((edge, index) => edge - y[index]).sort((a, b) => a - b);
    const typical = gaps[Math.floor(gaps.length / 2)] ?? 0;
    // A faint/broken border can be restored only when some raster rule exists
    // near the middle of an otherwise double-height row. A genuinely tall
    // merged row with no ruling is left intact.
    for (let pass = 0; pass < 2; pass++) {
      let added = false;
      for (let index = y.length - 2; index >= 0; index--) {
        const gap = y[index + 1] - y[index];
        if (gap < typical * 1.55) continue;
        const middle = (y[index] + y[index + 1]) / 2;
        const candidate = nearby.filter(rule => rule.at > y[index] + typical * .48 &&
          rule.at < y[index + 1] - typical * .48 && Math.abs(rule.at - middle) < gap * .24)
          .sort((a, b) => b.pixels - a.pixels)[0];
        if (candidate) { y.splice(index + 1, 0, Math.round(candidate.at)); added = true; }
      }
      if (!added) break;
    }
    if (x.length < 3 || y.length < 4 || x.length > 40 || y.length > 150) continue;

    const cells: Array<Array<Word[]>> = Array.from({ length: y.length - 1 }, () =>
      Array.from({ length: x.length - 1 }, () => []));
    let words = 0, assignedWords = 0;
    const sx = width / ocrWidth, sy = height / ocrHeight;
    for (const line of ocrLines) for (const source of line.words) {
      const value = source.text.trim();
      if (!value || /^[|_~]+$/.test(value)) continue;
      words++;
      const word: Word = { text: value, x0: source.x0 * sx, x1: source.x1 * sx,
        y0: source.y0 * sy, y1: source.y1 * sy, confidence: source.confidence };
      const row = locate(y, (word.y0 + word.y1) / 2);
      const column = locate(x, (word.x0 + word.x1) / 2);
      if (row < 0 || column < 0) continue;
      cells[row][column].push(word);
      assignedWords++;
    }
    const rows = cells.map(row => row.map(wordsInCell => {
      wordsInCell.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
      const lines: Word[][] = [];
      for (const word of wordsInCell) {
        const current = lines.at(-1);
        const center = (word.y0 + word.y1) / 2;
        if (current && Math.abs(center - current.reduce((sum, item) => sum + (item.y0 + item.y1) / 2, 0) / current.length) <
          Math.max(5, (word.y1 - word.y0) * .65)) current.push(word);
        else lines.push([word]);
      }
      return lines.map(line => line.sort((a, b) => a.x0 - b.x0).map(word => word.text).join(" ")).join("\n");
    }));
    if (assignedWords < 8 || rows.filter(row => row.filter(Boolean).length >= 2).length < 2) continue;
    const firstRow = rows[0] ?? [];
    const headerRows = firstRow.filter(cell => /\d/.test(cell)).length <= 1 &&
      firstRow.filter(cell => /[A-Za-z]{2,}/.test(cell)).length >= 2 ? 1 : 0;
    results.push({ rows, merges: [], headerRows,
      diagnostics: { horizontalLines: y.length, verticalLines: x.length, words, assignedWords } });
  }
  return results;
}
