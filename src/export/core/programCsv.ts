// Sérialisation CSV d'un programme (cœur pur, sans Expo).
//   programToCsv(data)          → texte CSV
//   parseProgramCsv(text, name) → ProgramExport (+ throw si invalide)
//
// Une ligne = un exercice (objectifs agrégés, pas de notion de semaine).
// Pas d'onglet Méta ni de colonnes techniques : l'ordre des séances est
// déduit des blocs contigus de lignes partageant la même séance, et la
// couleur est assignée automatiquement.

import { readCsvSheet, rowsToCsv } from './csv';
import {
  PROGRAM_FORMAT_VERSION,
  type ProgramExerciseExport,
  type ProgramExport,
  type ProgramSessionExport,
} from './programTypes';
import { rowToTargets, type Row } from './programXlsx';
import { secondsToMMSS, SESSION_COLORS } from './style';
import { parseAlternatives } from './transform';

type CsvCol = { key: string; header: string; required?: boolean };

export const PROGRAM_CSV_COLS: CsvCol[] = [
  { key: 'seance', header: 'Séance', required: true },
  { key: 'jour', header: 'Jour' },
  { key: 'exercice', header: 'Exercice', required: true },
  { key: 'variation', header: 'Variation' },
  { key: 'superset', header: 'Superset' },
  { key: 'alternatives', header: 'Alternatives' },
  { key: 'seriesMin', header: 'Séries min' },
  { key: 'seriesMax', header: 'Séries max' },
  { key: 'repsMin', header: 'Reps min' },
  { key: 'repsMax', header: 'Reps max' },
  { key: 'poidsMin', header: 'Poids min (kg)' },
  { key: 'poidsMax', header: 'Poids max (kg)' },
  { key: 'rirMin', header: 'RIR min' },
  { key: 'rirMax', header: 'RIR max' },
  { key: 'repos', header: 'Repos' },
  { key: 'duree', header: 'Durée' },
  { key: 'tempo', header: 'Tempo' },
];

// ─── Écriture ──────────────────────────────────────────────────────────────

export function programToCsv(data: ProgramExport): string {
  const rows: (string | number | null)[][] = [];
  for (const s of data.sessions) {
    for (const ex of s.exercises) {
      const t = ex.targets;
      const row: Row = {
        seance: s.name,
        jour: s.day ?? '',
        exercice: ex.exerciseName,
        variation: ex.selectedVariation ?? '',
        superset: ex.supersetLabel ?? '',
        alternatives: ex.alternatives.join(' ; '),
        seriesMin: t.setsMin,
        seriesMax: t.setsMax,
        repsMin: t.repsMin,
        repsMax: t.repsMax,
        poidsMin: t.weightMin,
        poidsMax: t.weightMax,
        rirMin: t.rirMin,
        rirMax: t.rirMax,
        repos: secondsToMMSS(t.restSeconds),
        duree: secondsToMMSS(t.durationSeconds),
        tempo: t.tempo ?? '',
      };
      rows.push(PROGRAM_CSV_COLS.map((c) => row[c.key] ?? ''));
    }
  }
  return rowsToCsv(PROGRAM_CSV_COLS.map((c) => c.header), rows);
}

// ─── Lecture / validation ────────────────────────────────────────────────────

export function parseProgramCsv(csvText: string, importName: string): ProgramExport {
  const raw = readCsvSheet(csvText);
  if (raw.length === 0) throw new Error('Fichier CSV vide.');

  const headers = (raw[0] as string[]).map((h) => String(h).trim());
  const headerToKey = new Map(PROGRAM_CSV_COLS.map((c) => [c.header, c.key]));
  const missing = PROGRAM_CSV_COLS.filter((c) => c.required && !headers.includes(c.header)).map(
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

  const sessions: ProgramSessionExport[] = [];
  const colorByName = new Map<string, string>();
  const colorFor = (key: string): string => {
    let c = colorByName.get(key);
    if (!c) {
      c = SESSION_COLORS[colorByName.size % SESSION_COLORS.length];
      colorByName.set(key, c);
    }
    return c;
  };

  let curSessionKey: string | null = null;
  let curSession: ProgramSessionExport | null = null;
  let order = 0;

  for (const r of rows) {
    const name = r.seance ? String(r.seance).trim() : '';
    const day = r.jour ? String(r.jour).trim() : '';
    const sessionKey = `${name}::${day}`;

    if (sessionKey !== curSessionKey) {
      if (!name) throw new Error(`Une séance (ligne ${rows.indexOf(r) + 2}) n'a pas de nom.`);
      curSession = {
        order: order++,
        name,
        day: day || null,
        color: colorFor(name),
        exercises: [],
      };
      sessions.push(curSession);
      curSessionKey = sessionKey;
    }

    const exerciseName = String(r.exercice ?? '').trim();
    if (!exerciseName) {
      throw new Error(`Séance « ${curSession!.name} » : un exercice n'a pas de nom.`);
    }
    const exo: ProgramExerciseExport = {
      exerciseName,
      selectedVariation: r.variation ? String(r.variation).trim() : null,
      supersetLabel: r.superset ? String(r.superset).trim() : null,
      alternatives: parseAlternatives(r.alternatives),
      targets: rowToTargets(r),
    };
    curSession!.exercises.push(exo);
  }

  return {
    formatVersion: PROGRAM_FORMAT_VERSION,
    name: importName,
    description: null,
    sessions,
  };
}
