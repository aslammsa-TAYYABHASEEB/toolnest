"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { calculateAge, type AgeResult } from "@/lib/calc/age";

const DATE_PLACEHOLDER = "dd-mm-yyyy";

type DateInputProps = {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  max?: string;
};

/**
 * Date input with a text overlay that reliably renders a "dd-mm-yyyy"
 * placeholder and a formatted "DD-MM-YYYY" value, regardless of the browser's
 * native date-input placeholder quirks. The native input type=date stays
 * fully functional underneath (calendar icon, keyboard, mobile picker); only
 * its own text rendering is hidden and replaced by our overlay span.
 */
function DateInput({
  label,
  id,
  value,
  onChange,
  hint,
  error,
  required,
  max,
}: DateInputProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = Boolean(value);
  // Overlay + hidden native text ONLY for the empty, unfocused placeholder
  // state. Focused fields must show native rendering for typing feedback;
  // filled fields render fine natively (locale format).
  const useOverlay = !focused && !hasValue;
  const descriptionId = (hint || error) ? `${id}-description` : undefined;

  return (
    <div className="input-field">
      <label className="input-label" htmlFor={id}>{label}</label>
      <div className="date-input-wrap">
        <input
          id={id}
          type="date"
          className={`input-control${useOverlay ? " date-input-hidden-text" : ""}${error ? " is-invalid" : ""}`}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          max={max}
        />
        {useOverlay && (
          <span aria-hidden="true" className="date-overlay">
            {DATE_PLACEHOLDER}
          </span>
        )}
      </div>
      {(hint || error) && (
        <span id={descriptionId} className={`input-hint${error ? " is-error" : ""}`}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  // <input type="date"> returns "YYYY-MM-DD" in local time.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  // Guard against overflow (e.g. Feb 30 → Mar 2).
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function formatResult(r: AgeResult): string {
  const y = r.years;
  const mo = r.months;
  const d = r.days;
  const parts: string[] = [];
  parts.push(`${y} ${y === 1 ? "year" : "years"}`);
  parts.push(`${mo} ${mo === 1 ? "month" : "months"}`);
  parts.push(`${d} ${d === 1 ? "day" : "days"}`);
  return parts.join(", ");
}

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function AgeCalculator() {
  const [birthDateStr, setBirthDateStr] = useState("");
  const [asOfDateStr, setAsOfDateStr] = useState("");

  const todayStr = useMemo(() => getTodayString(), []);

  const birthDate = useMemo(() => parseDate(birthDateStr), [birthDateStr]);
  const asOfDate = useMemo(
    () => (asOfDateStr ? parseDate(asOfDateStr) : null),
    [asOfDateStr],
  );

  const effectiveAsOf = asOfDate ?? new Date(
    Number(todayStr.slice(0, 4)),
    Number(todayStr.slice(5, 7)) - 1,
    Number(todayStr.slice(8, 10)),
  );

  const error = useMemo(() => {
    if (!birthDate) return null;
    if (!asOfDate) return null;
    if (birthDate.getTime() > asOfDate.getTime()) {
      return "Birth date cannot be after the 'as of' date.";
    }
    return null;
  }, [birthDate, asOfDate]);

  const result = useMemo<AgeResult | null>(() => {
    if (!birthDate || error) return null;
    try {
      return calculateAge(birthDate, effectiveAsOf);
    } catch {
      return null;
    }
  }, [birthDate, effectiveAsOf, error]);

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-start">
        <DateInput
          label="Date of birth"
          id="birth-date"
          value={birthDateStr}
          onChange={setBirthDateStr}
          error={error ?? undefined}
          max={todayStr}
          required
        />
        <DateInput
          label="Calculate age as of"
          id="as-of-date"
          value={asOfDateStr}
          onChange={setAsOfDateStr}
          hint={`Defaults to today (${todayStr}) if left empty. Future dates allowed.`}
        />
      </div>

      {result ? (
        <div className="space-y-4">
          <div>
            <p className="text-2xl font-semibold">{formatResult(result)}</p>
            <p className="text-sm text-muted-foreground">
              {birthDateStr} → {asOfDateStr || todayStr}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Total days</p>
              <p className="text-lg font-medium">{result.totalDays.toLocaleString()}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Total weeks</p>
              <p className="text-lg font-medium">{result.totalWeeks.toLocaleString()}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Total months</p>
              <p className="text-lg font-medium">{result.totalMonths.toLocaleString()}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-1">Next birthday</p>
              <p className="text-lg font-medium">
                {result.daysUntilNextBirthday}{" "}
                {result.daysUntilNextBirthday === 1 ? "day" : "days"}
              </p>
            </Card>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>Enter a date of birth to see the calculated age.</p>
        </div>
      )}
    </Card>
  );
}
