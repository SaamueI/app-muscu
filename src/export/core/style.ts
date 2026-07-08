// Helpers de style xlsx-js-style + conversions mm:ss, partagés par les exports.

export type CellStyle = NonNullable<unknown>;

// xlsx-js-style attend des couleurs en hex SANS '#', en majuscules.
export function rgb(hex: string): string {
  return hex.replace('#', '').toUpperCase().padStart(6, '0').slice(-6);
}

// Éclaircit une couleur vers le blanc (amount 0 = inchangé, 1 = blanc).
// Sert à teinter le fond des lignes d'une séance à partir de sa couleur.
export function lighten(hex: string, amount: number): string {
  const h = rgb(hex);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return [mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

// Palette de couleurs de séance (même palette que les écrans de création de
// séance), utilisée pour assigner une couleur aux séances importées depuis un
// CSV (qui n'a pas de colonne couleur).
export const SESSION_COLORS = [
  '#007AFF', '#34C759', '#FF3B30', '#FF9500',
  '#AF52DE', '#5AC8FA', '#FF2D55', '#FFCC00',
];

const THIN = { style: 'thin', color: { rgb: 'D0D5DD' } };

export const borderAll = {
  top: THIN,
  bottom: THIN,
  left: THIN,
  right: THIN,
};

// Couleurs d'en-tête selon que la colonne accepte ou non une cellule vide.
export const HEADER_REQUIRED = 'B45309'; // ambre — colonne à toujours remplir
export const HEADER_OPTIONAL = '1F2937'; // ardoise — peut rester vide

export function headerStyle(fillHex: string = HEADER_OPTIONAL): CellStyle {
  return {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { patternType: 'solid', fgColor: { rgb: fillHex } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: borderAll,
  };
}

export function dataStyle(fillHex: string, opts?: { center?: boolean; bold?: boolean }): CellStyle {
  return {
    font: { bold: opts?.bold ?? false, sz: 10 },
    fill: { patternType: 'solid', fgColor: { rgb: fillHex } },
    alignment: {
      horizontal: opts?.center ? 'center' : 'left',
      vertical: 'center',
    },
    border: borderAll,
  };
}

// ─── mm:ss ────────────────────────────────────────────────────────────────────

export function secondsToMMSS(s: number | null): string {
  if (s == null) return '';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// "1:30" → 90, "90" → 90, "" → null. Renvoie null si non parsable.
export function mmssToSeconds(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const str = String(v).trim();
  if (str === '') return null;
  if (str.includes(':')) {
    const [m, s] = str.split(':');
    const mi = parseInt(m, 10);
    const si = parseInt(s, 10);
    if (Number.isNaN(mi) || Number.isNaN(si)) return null;
    return mi * 60 + si;
  }
  const n = parseInt(str, 10);
  return Number.isNaN(n) ? null : n;
}

// Parse un nombre éventuellement vide. '' / null → null.
export function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
