export const REDACTION_LIMITS = Object.freeze({
  dpi: 200,
  pages: 10,
  pagePixels: 4_000_000,
  totalPixels: 40_000_000,
  inputBytes: 20 * 1024 * 1024,
  outputBytes: 20 * 1024 * 1024,
});
export const REDACTION_SCALE = REDACTION_LIMITS.dpi / 72;

/** Displayed-page points, measured from the top left after PDF rotation/cropping. */
export type RedactionRectangle = readonly [number, number, number, number];
export type RedactionMark = Readonly<{ id: string; page: number; rect: RedactionRectangle }>;
export type RedactionPage = Readonly<{
  page: number; width: number; height: number; rotation: number;
  pixelWidth: number; pixelHeight: number;
}>;
export type RedactionInspection = Readonly<{ source: File; pages: readonly RedactionPage[]; signed: false }>;
export type RedactionProgress = { phase: "inspect" | "render" | "build" | "verify"; page: number; total: number };
export type RedactionContext = {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  onProgress?: (progress: RedactionProgress) => void;
};
export type RedactionVerification = Readonly<{
  status: "passed"; pageCount: number; maskedPixels: number; preservedPixels: number;
  objects: number; checks: readonly string[];
}>;
export type RedactionResult = Readonly<{ blob: Blob; filename: string; verification: RedactionVerification }>;

export class RedactionError extends Error {
  constructor(public readonly code: "refused" | "limit" | "cancelled" | "stale" | "verification", message: string) {
    super(message); this.name = "RedactionError";
  }
}
export function assertRedactionCurrent(context: RedactionContext) {
  if (context.signal?.aborted) throw new RedactionError("cancelled", "Redaction cancelled. No downloadable copy was created.");
  if (context.isCurrent && !context.isCurrent()) throw new RedactionError("stale", "The file or marks changed. Review them and run Redact & Verify again.");
}
export async function redactionCheckpoint(context: RedactionContext, progress: RedactionProgress) {
  assertRedactionCurrent(context);
  context.onProgress?.(progress);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assertRedactionCurrent(context);
}

export function redactionBrowserSupport() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|CriOS|EdgiOS|OPR|SamsungBrowser/i.test(ua)
    || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));
  return !mobile && /(?:Chrome|Edg)\//.test(ua) && window.innerWidth >= 768
    && typeof DecompressionStream !== "undefined";
}
