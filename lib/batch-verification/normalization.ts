import type { NumberRule } from "./types";

export const normalizeText = (text: string) => text.normalize("NFC").trim();

/** Explicit format only; scaled integers, no floating-point or inferred currency. */
export function decimalValue(text: string, rule: NumberRule): bigint | null {
  if (!Number.isInteger(rule.maxFractionDigits) || rule.maxFractionDigits < 0 || rule.maxFractionDigits > 12 ||
    rule.grouping === rule.decimal || (rule.currency && !/^[\p{Sc}A-Z]{1,3}$/u.test(rule.currency))) throw new Error("Invalid numeric rule");
  let value = normalizeText(text);
  if (rule.currency && value.startsWith(rule.currency)) value = value.slice(rule.currency.length).trim();
  const negative = value.startsWith("-");
  if (negative) value = value.slice(1);
  const pieces = value.split(rule.decimal);
  if (pieces.length > 2) return null;
  let whole = pieces[0];
  if (rule.grouping && whole.includes(rule.grouping)) {
    const groups = whole.split(rule.grouping);
    if (!/^[1-9]\d{0,2}$/.test(groups[0]) || groups.slice(1).some(group => !/^\d{3}$/.test(group))) return null;
    whole = groups.join("");
  }
  if (!/^(0|[1-9]\d*)$/.test(whole) || whole.length > 50) return null;
  const fraction = pieces[1] ?? "";
  if ((pieces.length === 2 && !/^\d+$/.test(fraction)) || fraction.length > rule.maxFractionDigits) return null;
  return BigInt(whole + fraction.padEnd(rule.maxFractionDigits, "0")) * BigInt(negative ? -1 : 1);
}
