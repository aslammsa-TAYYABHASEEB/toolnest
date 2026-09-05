"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  categories,
  convert,
  formatResult,
  getCategory,
  type UnitCategory,
} from "@/lib/calc/units";

export function UnitConverter() {
  const [categoryId, setCategoryId] = useState<UnitCategory>("length");
  const category = getCategory(categoryId);

  const [fromUnit, setFromUnit] = useState(category.units[0].id);
  const [toUnit, setToUnit] = useState(category.units[1].id);
  const [inputValue, setInputValue] = useState("");

  // When category changes, reset units to the first two of that category
  // (avoiding stale units from a previous category).
  const selectCategory = (id: UnitCategory) => {
    if (id === categoryId) return;
    setCategoryId(id);
    const c = getCategory(id);
    setFromUnit(c.units[0].id);
    setToUnit(c.units[1]?.id ?? c.units[0].id);
  };

  const numericValue = inputValue === "" ? NaN : Number(inputValue);
  const result = useMemo(() => {
    if (inputValue === "" || isNaN(numericValue)) return null;
    return convert(numericValue, fromUnit, toUnit, categoryId);
  }, [inputValue, numericValue, fromUnit, toUnit, categoryId]);

  const swap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  return (
    <Card className="p-6">
      {/* Category selector */}
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Unit category">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === categoryId}
            onClick={() => selectCategory(c.id)}
            className={`px-4 py-2 rounded text-sm font-medium border transition-colors ${
              c.id === categoryId
                ? "bg-[var(--color-brand-500)] text-white border-[var(--color-brand-500)]"
                : "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* From */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div>
          <label htmlFor="from-value" className="block text-sm font-medium text-[var(--color-text)] mb-1">
            From
          </label>
          <div className="flex gap-2">
            <input
              id="from-value"
              type="number"
              inputMode="decimal"
              placeholder="Enter value"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="input-control"
            />
            <select
              aria-label="From unit"
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
              className="input-control md:w-32"
            >
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Swap button */}
        <div className="flex justify-center md:pb-1">
          <button
            type="button"
            onClick={swap}
            aria-label="Swap units"
            className="icon-button"
          >
            ⇄
          </button>
        </div>

        {/* To */}
        <div>
          <label htmlFor="to-value" className="block text-sm font-medium text-[var(--color-text)] mb-1">
            To
          </label>
          <div className="flex gap-2">
            <input
              id="to-value"
              type="text"
              readOnly
              aria-label="Conversion result"
              value={result === null ? "" : formatResult(result)}
              placeholder="—"
              className="input-control bg-[var(--color-surface-muted)]"
            />
            <select
              aria-label="To unit"
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value)}
              className="input-control md:w-32"
            >
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live expression */}
      {result !== null && (
        <p className="mt-4 text-sm text-[var(--color-text-muted)]">
          {inputValue} {unitLabel(category, fromUnit)} = {" "}
          <span className="font-medium text-[var(--color-text)]">
            {formatResult(result)} {unitLabel(category, toUnit)}
          </span>
        </p>
      )}
    </Card>
  );
}

function unitLabel(category: ReturnType<typeof getCategory>, unitId: string): string {
  return category.units.find((u) => u.id === unitId)?.label ?? unitId;
}
