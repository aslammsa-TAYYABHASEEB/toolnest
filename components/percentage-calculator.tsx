"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  percentOfValue,
  valueIsWhatPercentOf,
  percentageChange,
  type CalculatorMode,
} from "@/lib/calc/percentage";

function formatNumberDisplay(num: number | null): string {
  if (num == null) return "—";
  return Number(num.toFixed(2)).toString();
}

function getModeLabel(mode: CalculatorMode): string {
  switch (mode) {
    case "percent-of":
      return "% of a number";
    case "is-what-percent":
      return "is what % of";
    case "percent-change":
      return "% increase/decrease";
  }
}

function getModeDescription(mode: CalculatorMode): string {
  switch (mode) {
    case "percent-of":
      return "What is X% of Y?";
    case "is-what-percent":
      return "X is what % of Y?";
    case "percent-change":
      return "Calculate percent increase or decrease";
  }
}

interface CalculationResult {
  raw: number | null;
  formatted: string;
  description: string;
  mode: CalculatorMode;
  direction: "increase" | "decrease" | "no-change" | null;
}

function calculateResult(
  mode: CalculatorMode,
  params: { inputA: string; inputB: string }
): CalculationResult {
  switch (mode) {
    case "percent-of": {
      const a = Number(params.inputA);
      const b = Number(params.inputB);
      if (isNaN(a) || isNaN(b)) {
        return { raw: null, formatted: "—", description: "Enter valid numbers", mode, direction: null };
      }
      const raw = percentOfValue(a, b);
      return {
        raw,
        formatted: formatNumberDisplay(raw),
        description: `${formatNumberDisplay(a)}% of ${formatNumberDisplay(b)} = ${formatNumberDisplay(raw)}`,
        mode,
        direction: null,
      };
    }
    case "is-what-percent": {
      const a = Number(params.inputA);
      const b = Number(params.inputB);
      if (isNaN(a) || isNaN(b)) {
        return { raw: null, formatted: "—", description: "Enter valid numbers", mode, direction: null };
      }
      if (b === 0) {
        return { raw: null, formatted: "Cannot divide by zero", description: "", mode, direction: null };
      }
      const raw = valueIsWhatPercentOf(a, b);
      return {
        raw,
        formatted: `${formatNumberDisplay(raw)}%`,
        description: `${formatNumberDisplay(a)} is ${formatNumberDisplay(raw)}% of ${formatNumberDisplay(b)}`,
        mode,
        direction: null,
      };
    }
    case "percent-change": {
      const a = Number(params.inputA);
      const b = Number(params.inputB);
      if (isNaN(a) || isNaN(b)) {
        return { raw: null, formatted: "—", description: "Enter valid numbers", mode, direction: null };
      }
      const calc = percentageChange(a, b);
      return {
        raw: calc.percent,
        formatted: `${formatNumberDisplay(Math.abs(calc.percent))}% ${calc.direction}`,
        description: `From ${formatNumberDisplay(a)} to ${formatNumberDisplay(b)} = ${calc.direction === "increase" ? "↑" : calc.direction === "decrease" ? "↓" : ""}${formatNumberDisplay(calc.percent)}% ${calc.direction}`,
        mode,
        direction: calc.direction,
      };
    }
  }
}

export function PercentageCalculator() {
  const [mode, setMode] = useState<CalculatorMode>("percent-of");
  const [params, setParams] = useState<{ inputA: string; inputB: string }>({ inputA: "", inputB: "" });

  // Compute result whenever mode or params change
  const result = useMemo(() => {
    return calculateResult(mode, params);
  }, [mode, params.inputA, params.inputB]);

  function handleModeChange(newMode: CalculatorMode) {
    setMode(newMode);
    setParams({ inputA: "", inputB: "" });
  }

  function handleInputChange(
    e: React.ChangeEvent<HTMLInputElement>,
    field: "inputA" | "inputB"
  ) {
    const value = e.target.value;
    setParams({ ...params, [field]: value });
  }

  // JSX-friendly conditional for input labels based on mode
  const inputALabel = mode === "percent-of"
    ? "Percent"
    : mode === "is-what-percent"
      ? "Part"
      : "From";

  const inputBLabel = mode === "percent-of"
    ? "Value"
    : mode === "is-what-percent"
      ? "Whole"
      : "To";

  return (
    <section
      className="percentage-calculator-shell space-y-6"
      aria-labelledby="percentage-calculator-title"
    >
      <h2 className="sr-only" id="percentage-calculator-title">
        Percentage Calculator
      </h2>

      <div className="privacy-banner">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>Your calculations are performed locally in your browser.</strong>
          <p>Numbers are never sent to ToolNest servers or saved anywhere else.</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
          <button
            type="button"
            className={`btn btn-ghost ${mode === "percent-of" ? "active" : ""}`}
            aria-pressed={mode === "percent-of"}
            onClick={() => handleModeChange("percent-of")}
            data-mode="percent-of"
          >
            {getModeLabel("percent-of")}
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${mode === "is-what-percent" ? "active" : ""}`}
            aria-pressed={mode === "is-what-percent"}
            onClick={() => handleModeChange("is-what-percent")}
            data-mode="is-what-percent"
          >
            {getModeLabel("is-what-percent")}
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${mode === "percent-change" ? "active" : ""}`}
            aria-pressed={mode === "percent-change"}
            onClick={() => handleModeChange("percent-change")}
            data-mode="percent-change"
          >
            {getModeLabel("percent-change")}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <Card className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {getModeLabel(mode)}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {getModeDescription(mode)}
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <label htmlFor="input-a" className="text-xs font-medium">
                  {inputALabel}
                </label>
                <input
                  id="input-a"
                  type="number"
                  value={params.inputA}
                  onChange={(e) => handleInputChange(e, "inputA")}
                  placeholder="25"
                  className="border rounded px-3 py-2 flex-1"
                  aria-label={`Input A (${getModeLabel(mode)})`}
                />

                <label htmlFor="input-b" className="text-xs font-medium">
                  {inputBLabel}
                </label>
                <input
                  id="input-b"
                  type="number"
                  value={params.inputB}
                  onChange={(e) => handleInputChange(e, "inputB")}
                  placeholder="200"
                  className="border rounded px-3 py-2 flex-1"
                  aria-label={`Input B (${getModeLabel(mode)})`}
                />
              </div>

              {mode === "percent-change" && (
                <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                  <p>
                    <strong>Direction:</strong> {" "}
                    {result.direction === "increase" ? "Increase" : result.direction === "decrease" ? "Decrease" : "No change"}
                  </p>
                </div>
              )}

              <div className="mt-4">
                <p className="text-lg font-medium">{result.formatted}</p>
                <p className="text-sm text-muted-foreground">{result.description}</p>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                How to use the Percentage Calculator
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Select the calculation type</li>
                <li>Enter numbers in the input fields (invalid inputs will be ignored)</li>
                <li>Results update live as you type</li>
                <li>All calculations happen locally in your browser</li>
              </ul>
            </Card>

            <Card className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Examples
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>What is 25% of 200? → 50</li>
                <li>50 is what percent of 200? → 25%</li>
                <li>From 100 to 150 = 50% increase</li>
                <li>From 150 to 100 = 33.33% decrease</li>
              </ul>
            </Card>
          </div>
        </div>
      </Card>
    </section>
  );
}