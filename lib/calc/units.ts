export type UnitCategory = 'length' | 'weight' | 'temperature';

export interface UnitDef {
  id: string;
  label: string;
  /** Multiplier to convert a value in this unit to the category's base unit.
   *  (base unit itself has factor 1). Not used by temperature. */
  toBase: number;
}

export interface CategoryDef {
  id: UnitCategory;
  label: string;
  baseUnit: string;
  units: UnitDef[];
}

export const categories: CategoryDef[] = [
  {
    id: 'length',
    label: 'Length',
    baseUnit: 'meter',
    units: [
      { id: 'mm', label: 'Millimeters', toBase: 0.001 },
      { id: 'cm', label: 'Centimeters', toBase: 0.01 },
      { id: 'm', label: 'Meters', toBase: 1 },
      { id: 'km', label: 'Kilometers', toBase: 1000 },
      { id: 'in', label: 'Inches', toBase: 0.0254 },
      { id: 'ft', label: 'Feet', toBase: 0.3048 },
      { id: 'yd', label: 'Yards', toBase: 0.9144 },
      { id: 'mi', label: 'Miles', toBase: 1609.344 },
    ],
  },
  {
    id: 'weight',
    label: 'Weight',
    baseUnit: 'kilogram',
    units: [
      { id: 'mg', label: 'Milligrams', toBase: 0.000001 },
      { id: 'g', label: 'Grams', toBase: 0.001 },
      { id: 'kg', label: 'Kilograms', toBase: 1 },
      { id: 'oz', label: 'Ounces', toBase: 0.028349523125 },
      { id: 'lb', label: 'Pounds', toBase: 0.45359237 },
      { id: 'st', label: 'Stone', toBase: 6.35029318 },
      { id: 't', label: 'Metric tons', toBase: 1000 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    baseUnit: 'celsius',
    units: [
      { id: 'c', label: 'Celsius', toBase: 1 },
      { id: 'f', label: 'Fahrenheit', toBase: 1 },
      { id: 'k', label: 'Kelvin', toBase: 1 },
    ],
  },
];

export function getCategory(id: UnitCategory): CategoryDef {
  const c = categories.find((c) => c.id === id);
  if (!c) throw new Error(`Unknown category: ${id}`);
  return c;
}

function toCelsius(value: number, unit: string): number {
  switch (unit) {
    case 'c': return value;
    case 'f': return (value - 32) * 5 / 9;
    case 'k': return value - 273.15;
    default: throw new Error(`Unknown temperature unit: ${unit}`);
  }
}

function fromCelsius(celsius: number, unit: string): number {
  switch (unit) {
    case 'c': return celsius;
    case 'f': return celsius * 9 / 5 + 32;
    case 'k': return celsius + 273.15;
    default: throw new Error(`Unknown temperature unit: ${unit}`);
  }
}

/**
 * Convert a value from one unit to another. Both units must belong to the
 * same category. Returns NaN for unknown unit combinations.
 */
export function convert(
  value: number,
  fromUnit: string,
  toUnit: string,
  category: UnitCategory,
): number {
  if (!isFinite(value)) return NaN;
  if (category === 'temperature') {
    return fromCelsius(toCelsius(value, fromUnit), toUnit);
  }
  const cat = getCategory(category);
  const from = cat.units.find((u) => u.id === fromUnit);
  const to = cat.units.find((u) => u.id === toUnit);
  if (!from || !to) return NaN;
  // value → base → target
  return (value * from.toBase) / to.toBase;
}

/**
 * Format a conversion result with sensible precision: trims trailing zeros
 * while keeping meaningful precision across magnitudes.
 */
export function formatResult(value: number): string {
  if (!isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  // For large magnitudes, fewer decimals; for tiny magnitudes, more.
  let decimals: number;
  if (abs >= 1000) decimals = 2;
  else if (abs >= 100) decimals = 3;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 6;
  else decimals = 9;
  // toFixed then strip trailing zeros (and trailing dot)
  return parseFloat(value.toFixed(decimals)).toString();
}
