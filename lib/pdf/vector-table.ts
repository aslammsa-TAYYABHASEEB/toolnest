import type { PDFPageProxy } from "pdfjs-dist";
import { isIdentifierLikeColumnHeading, parseConservativeNumericLiteral } from "./cell-semantics";
import { extractWordRules } from "./word-extraction";
import type { WordRule } from "./word-layout";

type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;
export type GridMerge = { startRow: number; endRow: number; startColumn: number; endColumn: number };
export type VectorGridCellEvidence = {
  sourceText: string;
  bbox: { left: number; top: number; width: number; height: number };
};
export type VectorGridTable = {
  rows: string[][];
  evidence: Array<Array<VectorGridCellEvidence | null>>;
  merges: GridMerge[];
  headerRows: number;
};
type Segment = { start: number; end: number };
type Band = { coordinate: number; segments: Segment[] };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

function mergedSegments(segments: Segment[], tolerance = 2.5): Segment[] {
  const merged: Segment[] = [];
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && segment.start - previous.end <= tolerance) previous.end = Math.max(previous.end, segment.end);
    else merged.push({ ...segment });
  }
  return merged;
}

function bands(rules: WordRule[], horizontal: boolean): Band[] {
  const sorted = rules.filter(rule => horizontal
    ? Math.abs(rule.y1 - rule.y0) < 1.5 && rule.x1 - rule.x0 > 3
    : Math.abs(rule.x1 - rule.x0) < 1.5 && rule.y1 - rule.y0 > 3)
    .sort((a, b) => horizontal ? a.y0 - b.y0 : a.x0 - b.x0);
  const groups: { coordinates: number[]; segments: Segment[] }[] = [];
  for (const rule of sorted) {
    const coordinate = horizontal ? rule.y0 : rule.x0;
    const segment = horizontal ? { start: rule.x0, end: rule.x1 } : { start: rule.y0, end: rule.y1 };
    const group = groups[groups.length - 1];
    if (group && Math.abs(coordinate - median(group.coordinates)) <= 1.5) {
      group.coordinates.push(coordinate);
      group.segments.push(segment);
    } else groups.push({ coordinates: [coordinate], segments: [segment] });
  }
  return groups.map(group => ({ coordinate: median(group.coordinates), segments: mergedSegments(group.segments) }));
}

function overlap(segment: Segment, start: number, end: number) {
  return Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, start));
}

function covered(band: Band | undefined, start: number, end: number) {
  return !!band && band.segments.reduce((sum, segment) => sum + overlap(segment, start, end), 0) >= (end - start) * .65;
}

function locate(edges: number[], value: number) {
  for (let index = 0; index < edges.length - 1; index++) {
    if (value >= edges[index] - 1 && value < edges[index + 1] + 1) return index;
  }
  return -1;
}

function pageTextItems(text: TextContent, viewport: ReturnType<PDFPageProxy["getViewport"]>) {
  const [a, b, c, d, e, f] = viewport.transform;
  return text.items.flatMap(item => {
    if (!("str" in item) || !item.str.trim()) return [];
    const [u, v, w, z, x, y] = item.transform;
    const dx = a * u + c * v;
    const dy = b * u + d * v;
    const magnitude = Math.hypot(dx, dy) || 1;
    const startX = a * x + c * y + e;
    const startY = b * x + d * y + f;
    const advance = item.width * viewport.scale * (viewport.userUnit || 1);
    const endX = startX + dx / magnitude * advance;
    const endY = startY + dy / magnitude * advance;
    return [{ text: item.str.trim(), x: (startX + endX) / 2, y: (startY + endY) / 2,
      dx, dy, startX, startY, left: Math.min(startX, endX), right: Math.max(startX, endX),
      size: Math.hypot(a * w + c * z, b * w + d * z) || Math.hypot(dx, dy) }];
  });
}

/** PDF-to-Excel-only path for strongly ruled native tables. Text stays native. */
export async function extractVectorGridTables(page: PDFPageProxy, text: TextContent): Promise<VectorGridTable[]> {
  const pdfjs = await import("pdfjs-dist");
  const viewport = page.getViewport({ scale: 1 });
  const rules = extractWordRules(await page.getOperatorList(), pdfjs.OPS, viewport.transform);
  const horizontal = bands(rules, true);
  const vertical = bands(rules, false);
  if (horizontal.length < 4 || vertical.length < 3) return [];

  // Repeated near-full-width lines identify a grid even when Excel exports
  // each cell border as a separate path with a small gap between paths.
  const full = horizontal.filter(band => {
    const first = band.segments[0], last = band.segments[band.segments.length - 1];
    if (!first || !last) return false;
    const width = last.end - first.start;
    return width > viewport.width * .35 && covered(band, first.start, last.end) &&
      band.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0) / width > .85;
  });
  const groups: Band[][] = [];
  for (const band of full) {
    const first = band.segments[0], last = band.segments[band.segments.length - 1];
    const group = groups.find(entries => {
      const exemplar = entries[0];
      return Math.abs(exemplar.segments[0].start - first.start) < 4 &&
        Math.abs(exemplar.segments[exemplar.segments.length - 1].end - last.end) < 4;
    });
    if (group) group.push(band); else groups.push([band]);
  }
  const main = groups.sort((a, b) => b.length - a.length ||
    (b[0].segments.at(-1)!.end - b[0].segments[0].start) - (a[0].segments.at(-1)!.end - a[0].segments[0].start))[0];
  if (!main || main.length < 4) return [];
  const left = median(main.map(band => band.segments[0].start));
  const right = median(main.map(band => band.segments.at(-1)!.end));
  const inner = vertical.filter(band => band.coordinate > left + 3 && band.coordinate < right - 3);
  const strong = inner.filter(band => band.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0) > 35);
  if (strong.length < 2) return [];
  const innerTop = median(strong.map(band => band.segments[0].start));
  const orderedFull = [...main].sort((a, b) => a.coordinate - b.coordinate);
  const atTop = orderedFull.find(band => band.coordinate >= innerTop - 2);
  if (!atTop) return [];
  const previous = [...orderedFull].reverse().find(band => band.coordinate < atTop.coordinate - 2 && atTop.coordinate - band.coordinate < 80 &&
    inner.some(rule => covered(rule, (band.coordinate + atTop.coordinate) / 2 - 2, (band.coordinate + atTop.coordinate) / 2 + 2)));
  const fullWithin = orderedFull.filter(band => band.coordinate >= (previous?.coordinate ?? atTop.coordinate));
  if (fullWithin.length < 4) return [];
  const top = fullWithin[0].coordinate;
  const bottom = fullWithin.at(-1)!.coordinate;
  if (bottom - top < 20) return [];
  const y = horizontal.filter(band => band.coordinate >= top - 1 && band.coordinate <= bottom + 1 &&
    band.segments.some(segment => overlap(segment, left, right) > Math.min(15, (right - left) * .04)))
    .map(band => band.coordinate).sort((a, b) => a - b)
    .filter((edge, index, array) => !index || edge - array[index - 1] > 2);
  if (y.length < 4 || y.length > 300) return [];
  const boundsRowInterval = (band: Band) => y.slice(0, -1).some((rowTop, row) =>
    band.segments.some(segment => segment.start <= rowTop + 2.5 && segment.end >= y[row + 1] - 2.5));
  const xEdges = [left, ...inner.filter(band =>
    covered(band, top + 2, bottom - 2) ||
    band.segments.reduce((sum, segment) => sum + overlap(segment, top, bottom), 0) > (bottom - top) * .45 ||
    boundsRowInterval(band))
    .map(band => band.coordinate), right].sort((a, b) => a - b);
  const x = xEdges.filter((edge, index) => !index || edge - xEdges[index - 1] > 2);
  if (x.length < 4 || x.length > 65) return [];
  const rows = y.length - 1, columns = x.length - 1;
  const nativeItems = pageTextItems(text, viewport);
  const latentRightBoundary = x[columns - 1];
  const rightBoundaryRule = strong.find(band => Math.abs(band.coordinate - latentRightBoundary) < 2);
  const rightBoundarySupport = rightBoundaryRule ? y.slice(0, -1).filter((rowTop, row) =>
    covered(rightBoundaryRule, rowTop + 1, y[row + 1] - 1)).length : 0;
  const verticalAt = (coordinate: number) => vertical.find(band => Math.abs(band.coordinate - coordinate) < 2);
  const horizontalAt = (coordinate: number) => horizontal.find(band => Math.abs(band.coordinate - coordinate) < 2);
  const substantiallyCovered = (band: Band | undefined, start: number, end: number) =>
    !!band && band.segments.reduce((sum, segment) => sum + overlap(segment, start, end), 0) >= (end - start) * .85;
  const rowItems = (row: number) => nativeItems.filter(item =>
    locate(y, item.y) === row && Math.abs(item.dy) <= Math.abs(item.dx) * 2);
  const rightColumnItems = (row: number) => rowItems(row).filter(item =>
    item.left >= latentRightBoundary - 1 && item.right <= right + 1);
  const firstDataRow = Array.from({ length: rows - 1 }, (_, index) => index + 1).find(row =>
    rowItems(row).filter(item => parseConservativeNumericLiteral(item.text) !== null).length >= 2);
  const upperHeaderRows = Math.min(firstDataRow ?? rows, 4);
  const rightmostHeadingItems = Array.from({ length: upperHeaderRows }, (_, row) =>
    covered(rightBoundaryRule, y[row] + 1, y[row + 1] - 1)
      ? rightColumnItems(row).filter(item => parseConservativeNumericLiteral(item.text) === null)
      : []).flat();
  const rightmostHeading = rightmostHeadingItems.length
    ? rightmostHeadingItems.sort((a, b) => a.y - b.y || a.x - b.x).map(item => item.text).join(" ")
    : null;
  const allowsAmountRescue = rightmostHeading === null || !isIdentifierLikeColumnHeading(rightmostHeading);
  const rescueCandidates: Array<{ row: number; right: number }> = [];

  // Some ruled statements retain the column geometry established by their
  // header but omit every internal divider in a lower financial section. A
  // repeated, aligned amount run can preserve only that existing final column;
  // uncertainty deliberately leaves the original full-width merge untouched.
  if (rightBoundaryRule && rightBoundarySupport >= 2 && allowsAmountRescue) for (let row = 0; row < rows; row += 1) {
    const rowTop = y[row], rowBottom = y[row + 1];
    const structurallyRuled = substantiallyCovered(horizontalAt(rowTop), left + 1, right - 1) &&
      substantiallyCovered(horizontalAt(rowBottom), left + 1, right - 1) &&
      substantiallyCovered(verticalAt(left), rowTop + 1, rowBottom - 1) &&
      substantiallyCovered(verticalAt(right), rowTop + 1, rowBottom - 1);
    const rightCellHorizontallyBounded = covered(horizontalAt(rowTop), latentRightBoundary + 1, right - 1) &&
      covered(horizontalAt(rowBottom), latentRightBoundary + 1, right - 1);
    const allInternalDividersAbsent = x.slice(1, -1).every(edge =>
      !covered(verticalAt(edge), rowTop + 1, rowBottom - 1));
    if (!structurallyRuled || !rightCellHorizontallyBounded || !allInternalDividersAbsent) continue;
    const items = rowItems(row);
    if (items.some(item => item.left < latentRightBoundary + 2.5 && item.right > latentRightBoundary - 2.5)) continue;
    const rightItems = rightColumnItems(row);
    if (rightItems.length !== 1 || parseConservativeNumericLiteral(rightItems[0].text) === null) continue;
    rescueCandidates.push({ row, right: rightItems[0].right });
  }
  const rescuedRows = new Set<number>();
  let run: Array<{ row: number; right: number }> = [];
  const finishRun = () => {
    if (run.length >= 3 && Math.max(...run.map(candidate => candidate.right)) -
      Math.min(...run.map(candidate => candidate.right)) <= 1.5) {
      run.forEach(candidate => rescuedRows.add(candidate.row));
    }
    run = [];
  };
  for (const candidate of rescueCandidates) {
    const next = [...run, candidate];
    const aligned = Math.max(...next.map(entry => entry.right)) - Math.min(...next.map(entry => entry.right)) <= 1.5;
    if (run.length && (candidate.row !== run.at(-1)!.row + 1 || !aligned)) finishRun();
    run.push(candidate);
  }
  finishRun();
  const parent = Array.from({ length: rows * columns }, (_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
    return index;
  };
  const union = (a: number, b: number) => { parent[root(b)] = root(a); };
  for (let r = 0; r < rows; r++) for (let col = 0; col < columns; col++) {
    const index = r * columns + col;
    const preserveLatentRightColumn = rescuedRows.has(r) && col === columns - 2;
    if (col + 1 < columns && !preserveLatentRightColumn &&
      !covered(vertical.find(band => Math.abs(band.coordinate - x[col + 1]) < 2), y[r] + 1, y[r + 1] - 1)) union(index, index + 1);
    if (r + 1 < rows && !covered(horizontal.find(band => Math.abs(band.coordinate - y[r + 1]) < 2), x[col] + 1, x[col + 1] - 1)) union(index, index + columns);
  }
  const components = new Map<number, number[]>();
  for (let index = 0; index < parent.length; index++) {
    const key = root(index), component = components.get(key) ?? [];
    component.push(index); components.set(key, component);
  }
  const anchors = new Map<number, { row: number; column: number }>();
  const merges: GridMerge[] = [];
  for (const [key, cells] of components) {
    const r0 = Math.min(...cells.map(index => Math.floor(index / columns)));
    const r1 = Math.max(...cells.map(index => Math.floor(index / columns)));
    const c0 = Math.min(...cells.map(index => index % columns));
    const c1 = Math.max(...cells.map(index => index % columns));
    if (cells.length === (r1 - r0 + 1) * (c1 - c0 + 1)) {
      anchors.set(key, { row: r0, column: c0 });
      if (r0 !== r1 || c0 !== c1) merges.push({ startRow: r0, endRow: r1, startColumn: c0, endColumn: c1 });
    }
  }
  const buckets: { text: string; x: number; y: number; dx: number; dy: number; size: number }[][] = Array.from({ length: rows * columns }, () => []);
  for (const item of nativeItems) {
    const r = locate(y, item.y), col = locate(x, item.x);
    if (r < 0 || col < 0) continue;
    const anchor = anchors.get(root(r * columns + col)) ?? { row: r, column: col };
    buckets[anchor.row * columns + anchor.column].push(item);
  }
  const output = Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, col) => {
    const items = buckets[r * columns + col];
    const vertical = items.length > 0 && items.every(item => Math.abs(item.dy) > Math.abs(item.dx) * 2);
    const direction = vertical ? Math.sign(items.reduce((sum, item) => sum + item.dy, 0)) || 1 : 0;
    items.sort((a, b) => vertical
      ? -direction * (a.x - b.x) || direction * (a.y - b.y)
      : a.y - b.y || a.x - b.x);
    let result = "";
    for (let index = 0; index < items.length; index++) {
      const item = items[index], previous = items[index - 1];
      result += previous ? (!vertical && Math.abs(item.y - previous.y) > Math.max(item.size, previous.size) * .6 ? "\n" : " ") : "";
      result += item.text;
    }
    return result;
  }));
  const evidence: Array<Array<VectorGridCellEvidence | null>> = output.map((row, r) =>
    row.map((sourceText, col) => {
      if (!sourceText) return null;
      const key = root(r * columns + col);
      const anchor = anchors.get(key) ?? { row: r, column: col };
      if (anchor.row !== r || anchor.column !== col) return null;
      const cells = components.get(key) ?? [r * columns + col];
      const r0 = Math.min(...cells.map(index => Math.floor(index / columns)));
      const r1 = Math.max(...cells.map(index => Math.floor(index / columns)));
      const c0 = Math.min(...cells.map(index => index % columns));
      const c1 = Math.max(...cells.map(index => index % columns));
      return { sourceText, bbox: { left: x[c0] / viewport.width, top: y[r0] / viewport.height,
        width: (x[c1 + 1] - x[c0]) / viewport.width, height: (y[r1 + 1] - y[r0]) / viewport.height } };
    }));
  const firstData = output.findIndex((row, index) => index > 0 &&
    row.filter(cell => /^-?\d[\d,.]*$/.test(cell.trim())).length >= 2);
  let headerRows = firstData > 0 ? Math.min(firstData, 4) : 1;
  const preHeader = [...horizontal].reverse().find(band => band.coordinate < top - 1 && top - band.coordinate < 25 &&
    band.segments.some(segment => {
      const width = overlap(segment, left, right);
      return width > (right - left) * .15 && width < (right - left) * .8;
    }));
  if (preHeader) {
    const labels = nativeItems.filter(item => item.y > preHeader.coordinate && item.y < top && item.x >= left && item.x <= right);
    if (labels.length) {
      const row = Array.from({ length: columns }, () => "");
      const rowEvidence: Array<VectorGridCellEvidence | null> = Array.from({ length: columns }, () => null);
      const preMerges: GridMerge[] = [];
      for (const item of labels) {
        const segment = preHeader.segments.find(part => item.x >= part.start && item.x <= part.end);
        if (!segment) continue;
        const start = locate(x, segment.start + 1), end = locate(x, segment.end - 1);
        if (start < 0 || end < start) continue;
        row[start] += `${row[start] ? " " : ""}${item.text}`;
        rowEvidence[start] = { sourceText: row[start], bbox: { left: x[start] / viewport.width,
          top: preHeader.coordinate / viewport.height, width: (x[end + 1] - x[start]) / viewport.width,
          height: (top - preHeader.coordinate) / viewport.height } };
        if (end > start && !preMerges.some(merge => merge.startColumn === start && merge.endColumn === end))
          preMerges.push({ startRow: 0, endRow: 0, startColumn: start, endColumn: end });
      }
      if (row.some(Boolean)) {
        output.unshift(row);
        evidence.unshift(rowEvidence);
        merges.forEach(merge => { merge.startRow += 1; merge.endRow += 1; });
        merges.push(...preMerges);
        headerRows += 1;
      }
    }
  }
  // A separately boxed summary directly below the main grid (for example,
  // Net Payable) belongs with this table, not in a discarded prose block.
  const footerRules = horizontal.filter(band => band.coordinate > bottom + 1 && band.coordinate < bottom + 40 &&
    band.segments.some(segment => overlap(segment, left, right) > (right - left) * .15));
  if (footerRules.length >= 2) {
    const footerTop = footerRules[0].coordinate, footerBottom = footerRules.at(-1)!.coordinate;
    const footer = Array.from({ length: columns }, () => "");
    for (const item of nativeItems.filter(item => item.y > footerTop + 2 && item.y < footerBottom - 1)) {
      const col = locate(x, item.x);
      if (col >= 0) footer[col] += `${footer[col] ? " " : ""}${item.text}`;
    }
    if (footer.filter(Boolean).length >= 2 && footer.some(cell => /\d/.test(cell))) {
      output.push(footer);
      evidence.push(footer.map((sourceText, col) => sourceText ? { sourceText,
        bbox: { left: x[col] / viewport.width, top: footerTop / viewport.height,
          width: (x[col + 1] - x[col]) / viewport.width,
          height: (footerBottom - footerTop) / viewport.height } } : null));
    }
  }
  // Remove only wholly empty, unmerged grid rows. A blank label cell is not
  // evidence that a numeric summary row is empty.
  for (let row = output.length - 1; row >= 0; row--) {
    if (output[row].some(cell => cell.trim()) || merges.some(merge => merge.startRow <= row && merge.endRow >= row)) continue;
    output.splice(row, 1);
    evidence.splice(row, 1);
    for (const merge of merges) {
      if (merge.startRow > row) merge.startRow -= 1;
      if (merge.endRow > row) merge.endRow -= 1;
    }
    if (row < headerRows) headerRows -= 1;
  }
  if (output.filter(row => row.filter(Boolean).length >= 2).length < 2) return [];
  return [{ rows: output, evidence, merges, headerRows }];
}
