import type { Item, Span } from "./types";

/** Horizontal, positive-advance text only. Never bridge columns or separate baselines. */
export function constructSpans(items: readonly Item[]): Span[] {
  const ordered = items.filter(item => item.text.length > 0).sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index);
  const groups: Item[][] = [];
  for (const item of ordered) {
    const prior = groups.at(-1)?.at(-1);
    const gap = prior ? item.x - prior.x - prior.advance : Infinity;
    if (prior && Math.abs(item.y - prior.y) <= Math.min(item.size, prior.size) * .12 &&
      Math.abs(item.size - prior.size) <= .5 && gap >= -.25 && gap <= item.size * 1.5) groups.at(-1)!.push(item);
    else groups.push([item]);
  }
  return groups.map(group => {
    let text = "";
    const parts: { index: number; start: number; end: number }[] = [];
    group.forEach((item, i) => {
      const prior = group[i - 1];
      if (prior && item.x - prior.x - prior.advance > item.size * .2 && !/\s$/.test(text) && !/^\s/.test(item.text)) text += " ";
      const start = text.length; text += item.text; parts.push(Object.freeze({ index: item.index, start, end: text.length }));
    });
    return Object.freeze({ text, itemIndices: Object.freeze(group.map(item => item.index)), boxes: Object.freeze(group.map(item => item.box)), parts: Object.freeze(parts) });
  });
}
