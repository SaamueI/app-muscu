export function kgToLb(kg: number): number {
  return kg * 2.20462;
}

export function lbToKg(lb: number): number {
  return lb / 2.20462;
}

export function formatWeight(kg: number | null, unit: 'kg' | 'lb'): string {
  if (kg == null) return '';
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  const rounded = Math.round(value * 10) / 10;
  const display = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `${display} ${unit}`;
}
