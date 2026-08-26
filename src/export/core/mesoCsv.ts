// Sérialisation CSV d'un mésocycle (cœur pur, sans Expo).
//   mesoToCsv(data)               → texte CSV
//   parseMesoCsv(text, name)      → MesocycleExport (+ throw si invalide)
//
// Contrairement au XLSX, le CSV n'a qu'une seule feuille : pas d'onglet Méta
// (le type méso/programme est imposé par l'écran d'import, pas par le
// fichier), pas de colonnes techniques _ordreSeance/_ordreExo/_couleur.
// L'ordre des séances/exercices est déduit de l'ordre des lignes (blocs
// contigus), et la couleur de séance est assignée automatiquement.

import { readCsvSheet, rowsToCsv } from './csv';
import type {
  MesoExerciseExport,
  MesocycleExport,
  MesoSessionExport,
} from './mesoTypes';
import { MESO_FORMAT_VERSION } from './mesoTypes';
import { rowToSet, type Row } from './mesoXlsx';
import { num, secondsToMMSS, SESSION_COLORS } from './style';
import { parseAlternatives } from './transform';

type CsvCol = { key: string; header: string; required?: boolean };

export const MESO_CSV_COLS: CsvCol[] = [
  { key: 'semaine', header: 'Semaine', required: true },
  { key: 'seance', header: 'Séance' },
  { key: 'jour', header: 'Jour' },
  { key: 'exercice', header: 'Exercice', required: true },
  { key: 'variation', header: 'Variation' },
  { key: 'superset', header: 'Superset' },
  { key: 'alternatives', header: 'Alternatives' },
  { key: 'noteExercice', header: 'Note exercice' },
  { key: 'serie', header: 'Série' },
  { key: 'repsMin', header: 'Reps min' },
  { key: 'repsMax', header: 'Reps max' },
  { key: 'poidsMin', header: 'Poids min (kg)' },
  { key: 'poidsMax', header: 'Poids max (kg)' },
  { key: 'rirMin', header: 'RIR min' },
  { key: 'rirMax', header: 'RIR max' },
  { key: 'repos', header: 'Repos' },
  { key: 'duree', header: 'Durée' },
  { key: 'tempo', header: 'Tempo' },
  { key: 'note', header: 'Note séance' },
];

// ─── Écriture ──────────────────────────────────────────────────────────────

export function mesoToCsv(data: MesocycleExport): string {
  const rows: (string | number | null)[][] = [];
  for (const s of data.sessions) {
    for (const ex of s.exercises) {
      const base: Row = {
        semaine: s.weekIndex,
        seance: s.title ?? '',
        jour: s.day ?? '',
        exercice: ex.exerciseName,
        variation: ex.selectedVariation ?? '',
        superset: ex.supersetLabel ?? '',
        alternatives: ex.alternatives.join(' ; '),
        noteExercice: ex.note ?? '',
        note: s.note ?? '',
      };
      const pushRow = (extra: Row) => {
        const row = { ...base, ...extra };
        rows.push(MESO_CSV_COLS.map((c) => row[c.key] ?? ''));
      };
      if (ex.sets.length === 0) {
        pushRow({});
      } else {
        for (const set of ex.sets) {
          pushRow({
            serie: set.setNumber,
            repsMin: set.repsMin,
            repsMax: set.repsMax,
            poidsMin: set.weightMin,
            poidsMax: set.weightMax,
            rirMin: set.rirMin,
            rirMax: set.rirMax,
            repos: secondsToMMSS(set.restSeconds),
            duree: secondsToMMSS(set.durationSeconds),
            tempo: set.tempo ?? '',
          });
        }
      }
    }
  }
  return rowsToCsv(MESO_CSV_COLS.map((c) => c.header), rows);
}

// ─── Lecture / validation ────────────────────────────────────────────────────

export function parseMesoCsv(csvText: string, importName: string): MesocycleExport {
  const raw = readCsvSheet(csvText);
  if (raw.length === 0) throw new Error('Fichier CSV vide.');

  const headers = (raw[0] as string[]).map((h) => String(h).trim());
  const headerToKey = new Map(MESO_CSV_COLS.map((c) => [c.header, c.key]));
  const missing = MESO_CSV_COLS.filter((c) => c.required && !headers.includes(c.header)).map(
    (c) => c.header
  );
  if (missing.length) {
    throw new Error(`Colonnes manquantes : ${missing.join(', ')}.`);
  }

  const rows: Row[] = [];
  for (const r of raw.slice(1)) {
    const arr = r as unknown[];
    if (arr.every((v) => v === '' || v == null)) continue;
    const row: Row = {};
    headers.forEach((h, i) => {
      const key = headerToKey.get(h);
      if (key) row[key] = (arr[i] ?? '') as string | number | null;
    });
    rows.push(row);
  }
  if (rows.length === 0) throw new Error('Aucune donnée dans le fichier CSV.');

  const sessions: MesoSessionExport[] = [];
  const colorByTitle = new Map<string, string>();
  const colorFor = (key: string): string => {
    let c = colorByTitle.get(key);
    if (!c) {
      c = SESSION_COLORS[colorByTitle.size % SESSION_COLORS.length];
      colorByTitle.set(key, c);
    }
    return c;
  };

  const weekSessionCount = new Map<number, number>();
  let curSessionKey: string | null = null;
  let curSession: MesoSessionExport | null = null;
  let curExoKey: string | null = null;
  let curExo: MesoExerciseExport | null = null;

  for (const r of rows) {
    const week = num(r.semaine) ?? 1;
    const title = r.seance ? String(r.seance).trim() : '';
    const day = r.jour ? String(r.jour).trim() : '';
    const sessionKey = `${week}::${title}::${day}`;

    if (sessionKey !== curSessionKey) {
      const order = weekSessionCount.get(week) ?? 0;
      weekSessionCount.set(week, order + 1);
      curSession = {
        weekIndex: week,
        order,
        title: title || null,
        day: day || null,
        color: colorFor(title || `semaine-${week}-${order}`),
        note: r.note ? String(r.note).trim() : null,
        exercises: [],
      };
      sessions.push(curSession);
      curSessionKey = sessionKey;
      curExoKey = null;
      curExo = null;
    }

    const exerciseName = String(r.exercice ?? '').trim();
    if (!exerciseName) throw new Error(`Semaine ${week} : un exercice n'a pas de nom.`);
    const variation = r.variation ? String(r.variation).trim() : null;
    const superset = r.superset ? String(r.superset).trim() : null;
    const exoKey = `${exerciseName}::${variation ?? ''}::${superset ?? ''}`;

    if (exoKey !== curExoKey) {
      curExo = {
        exerciseName,
        selectedVariation: variation,
        supersetLabel: superset,
        alternatives: parseAlternatives(r.alternatives),
        note: r.noteExercice ? String(r.noteExercice).trim() : null,
        sets: [],
      };
      curSession!.exercises.push(curExo);
      curExoKey = exoKey;
    }

    const set = rowToSet(r);
    if (set) curExo!.sets.push(set);
  }

  return {
    formatVersion: MESO_FORMAT_VERSION,
    name: importName,
    numWeeks: sessions.reduce((m, s) => Math.max(m, s.weekIndex), 0),
    startDate: null,
    notes: null,
    sessions,
  };
}
