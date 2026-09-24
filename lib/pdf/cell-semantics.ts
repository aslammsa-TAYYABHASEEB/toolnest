const IDENTIFIER_HEADING = /\b(?:account|acct|a\/c|ecr|employee\s*(?:id|no|number|code)|reference|ref|code|serial|sr\.?\s*no)\b/i;

export function isIdentifierLikeColumnHeading(heading: string) {
  return IDENTIFIER_HEADING.test(heading);
}

export function parseConservativeNumericLiteral(text: string): number | null {
  const value = text.trim();
  const accountingNegative = /^\(.+\)$/.test(value);
  const unsigned = accountingNegative ? value.slice(1, -1) : value.replace(/^-/, "");
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/.test(unsigned)) return null;
  if (unsigned.replace(/[, .]/g, "").length > 15) return null;
  const numeric = Number(unsigned.replace(/,/g, "")) * (accountingNegative || value.startsWith("-") ? -1 : 1);
  return Number.isFinite(numeric) ? numeric : null;
}
