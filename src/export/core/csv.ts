// Helpers CSV génériques (cœur pur, sans Expo), partagés par mesoCsv/programCsv.
// Séparateur ',' en écriture. En lecture, XLSX.read en mode 'string' détecte
// automatiquement ',' / ';' / tab.

import * as XLSX from 'xlsx-js-style';

import { fixMojibake } from './mojibake';

function escapeCsvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(
  headers: string[],
  rows: (string | number | null)[][]
): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCsvCell).join(','));
  return lines.join('\r\n');
}

// Lit un texte CSV et renvoie les lignes brutes (tableaux de cellules),
// en-tête compris (ligne 0). Lance si le fichier n'a aucune feuille.
// Répare d'abord un éventuel mojibake (accents cassés par une réinterprétation
// Latin-1 en cours de route) : ça corrige aussi bien les en-têtes que les
// données, à la source, plutôt que d'exiger des en-têtes sans accent.
export function readCsvSheet(csvText: string): unknown[][] {
  const wb = XLSX.read(fixMojibake(csvText), { type: 'string' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Fichier CSV vide.');
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
}
