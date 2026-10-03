import { loadPdfRendererDocument } from "@/lib/pdf/renderer";
import { inspectPdfPrivacy } from "@/lib/pdf/privacy-inspect";
import { constructSpans } from "./text-spans";
import { BATCH_LIMITS, type Item, type PdfEvidence, type PageEvidence, type RendererOpener } from "./types";

/** No OCR and no table reconstruction. Evidence is item-level, not invented glyph boxes. */
export async function extractBatchPdfEvidence(file: File, open: RendererOpener = loadPdfRendererDocument,
  context: { signal?: AbortSignal; onPage?: (page: number) => void } = {}): Promise<PdfEvidence> {
  const current = () => { if (context.signal?.aborted) throw new Error("Verification cancelled"); };
  current();
  if (file.size > BATCH_LIMITS.pdfBytes) throw new Error("PDF byte limit");
  const doc = await open(file), pages: PageEvidence[] = [];
  let characters = 0;
  try {
    if (!doc.numPages || doc.numPages > BATCH_LIMITS.pages) throw new Error("PDF page limit");
    for (let number = 1; number <= doc.numPages; number++) {
      current(); context.onPage?.(number);
      const page = await doc.getPage(number);
      try {
        const text = await page.getTextContent({ disableNormalization: true }), display = page.getViewport({ scale: 1 }), layout = page.getViewport({ scale: 1, rotation: 0 });
        if (text.items.length > BATCH_LIMITS.itemsPerPage) throw new Error("PDF text-item limit");
        const items: Item[] = [], warnings: string[] = [];
        for (const [index, item] of text.items.entries()) {
          if (!("str" in item)) continue;
          characters += item.str.length;
          if (characters > BATCH_LIMITS.textCharacters) throw new Error("PDF text limit");
          const [a, b, c, d, x, y] = item.transform;
          const size = Math.hypot(c, d), width = item.width;
          if (![a,b,c,d,x,y,width,size].every(Number.isFinite) || a <= 0 || Math.abs(b) > .001 || Math.abs(c) > .001 || d <= 0 || !size || width < 0) {
            if (item.str.trim()) warnings.push("Unsupported text direction/geometry");
            continue;
          }
          const [lx, ly] = layout.convertToViewportPoint(x, y);
          const quad = [[x,y],[x+width,y],[x,y+size],[x+width,y+size]].map(([px,py]) => display.convertToViewportPoint(px,py));
          const xs = quad.map(p => p[0] / display.width), ys = quad.map(p => p[1] / display.height);
          const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
          if (left < 0 || top < 0 || right > 1 || bottom > 1) { warnings.push("Off-page text geometry"); continue; }
          items.push(Object.freeze({ index, text: item.str, transform: Object.freeze([...item.transform]), width, height: item.height,
            x: lx, y: ly, advance: width * layout.scale * (page.userUnit || 1), size: size * layout.scale * (page.userUnit || 1),
            box: Object.freeze({ left, top, width: right-left, height: bottom-top }) }));
        }
        // An empty text layer alone cannot prove a blank page (it may be a scan).
        const operators = await page.getOperatorList();
        const blank = !items.some(item => item.text.trim()) && operators.fnArray.length === 0;
        pages.push(Object.freeze({ page: number, width: display.width, height: display.height, rotation: page.rotate,
          rawItems: Object.freeze(text.items.map(item => Object.freeze({ ...item, ...("transform" in item ? { transform: Object.freeze([...item.transform]) } : {}) }))),
          items: Object.freeze(items), spans: Object.freeze(constructSpans(items)), warnings: Object.freeze(warnings), visibilityReview: warnings.length > 0, blank }));
      } finally { page.cleanup(); }
    }
  } finally { await doc.loadingTask.destroy(); }
  current();
  try {
    const privacy = await inspectPdfPrivacy(file, open);
    current();
    const categories = new Set(["hidden-text", "redaction-risk", "optional-content"]);
    // Keep the inspector's known scope disclaimer; any other incomplete inspection blocks PASS.
    const incomplete = privacy.warnings.some(w => w !== "This is a structural inspection, not a forensic or verified-clean certificate. Encrypted and proprietary PDFs are not fully supported.");
    return Object.freeze({ pages: Object.freeze(pages.map(page => Object.freeze({ ...page,
      visibilityReview: page.visibilityReview || incomplete || privacy.findings.some(f => categories.has(f.category) && (!f.page || f.page === page.page)) }))),
      limitations: Object.freeze(["PASS compares extracted native text under the one-record-per-page/anchored-line contract; it is not proof of visual visibility.", ...privacy.warnings]) });
  } catch {
    current();
    return Object.freeze({ pages: Object.freeze(pages.map(page => Object.freeze({ ...page, visibilityReview: true }))),
      limitations: Object.freeze(["Visibility inspection unavailable; no source record may PASS."]) });
  }
}
