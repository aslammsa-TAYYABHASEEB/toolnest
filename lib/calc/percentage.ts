export type CalculatorMode = "percent-of" | "is-what-percent" | "percent-change";

export function percentOfValue(percent: number, value: number): number {
  return (percent / 100) * value;
}

export function valueIsWhatPercentOf(partValue: number, wholeValue: number): number | null {
  if (wholeValue === 0) {
    return null;
  }
  return (partValue / wholeValue) * 100;
}

export function percentageChange(fromValue: number, toValue: number): { percent: number; direction: "increase" | "decrease" | "no-change" } {
  if (fromValue === 0) {
    return { percent: 0, direction: "no-change" };
  }
  const rawPercent = ((toValue - fromValue) / fromValue) * 100;
  if (rawPercent > 0) {
    return { percent: rawPercent, direction: "increase" };
  } else if (rawPercent < 0) {
    return { percent: rawPercent, direction: "decrease" };
  }
  return { percent: 0, direction: "no-change" };
}