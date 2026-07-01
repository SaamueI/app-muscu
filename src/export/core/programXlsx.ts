// Sérialisation XLSX d'un programme (cœur pur, sans Expo).
//   buildProgramWorkbook(data)  → base64 | Uint8Array
//   parseProgramWorkbook(input) → ProgramExport (+ throw si invalide)
//
// Onglets : « Méta » (clé/valeur) + « Programme » (1 ligne = 1 exercice).
// Objectifs AGRÉGÉS (Séries min/max), pas de notion de semaine.

import * as XLSX from 'xlsx-js-style';

import {
  PROGRAM_FORMAT_VERSION,
  type ProgramExerciseExport,
  type ProgramExport,
  type ProgramSessionExport,
  type ProgramTargets,
} from './programTypes';
import {
  dataStyle,
  HEADER_OPTIONAL,
  HEADER_REQUIRED,
  headerStyle,
  lighten,
  mmssToSeconds,
  num,
  secondsToMMSS,
} from './style';

const META_SHEET = 'Méta';
const DATA_SHEET = 'Programme';
const TEMPO_RE = /^\d+-\d+-\d+-\d+$/;

type Col = {
  key: string;
  header: string;
  w: number;
  hidden?: boolean;
  center?: boolean;
  required?: boolean;
};
const COLS: Col[] = [
  { key: 'seance', header: 'Séance', w: 20, required: true },
  { key: 'jour', header: 'Jour', w: 11 },
  { key: 'exercice', header: 'Exercice', w: 26, required: true },
  { key: 'variation', header: 'Variation', w: 16 },
  { key: 'superset', header: 'Superset', w: 9, center: true },
  { key: 'alternatives', header: 'Alternatives', w: 26 },
  { key: 'seriesMin', header: 'Séries min', w: 10, center: true },
  { key: 'seriesMax', header: 'Séries max', w: 10, center: true },
  { key: 'repsMin', header: 'Reps min', w: 9, center: true },
  { key: 'repsMax', header: 'Reps max', w: 9, center: true },
  { key: 'poidsMin', header: 'Poids min (kg)', w: 13, center: true },
  { key: 'poidsMax', header: 'Poids max (kg)', w: 13, center: true },
  { key: 'rirMin', header: 'RIR min', w: 8, center: true },
  { key: 'rirMax', header: 'RIR max', w: 8, center: true },
  { key: 'repos', header: 'Repos', w: 8, center: true },
  { key: 'duree', header: 'Durée', w: 8, center: true },
  { key: 'tempo', header: 'Tempo', w: 10, center: true },
  { key: '_ordreSeance', header: '_ordreSeance', w: 6, hidden: true, center: true, required: true },
  { key: '_ordreExo', header: '_ordreExo', w: 6, hidden: true, center: true, required: true },
  { key: '_couleur', header: '_couleur', w: 10, hidden: true },
];

type Row = Record<string, string | number | null>;

// ─── Construction ──────────────────────────────────────────────────────────────

function buildDataRows(data: ProgramExport): Row[] {
  const rows: Row[] = [];
  for (const s of data.sessions) {
    s.exercises.forEach((ex, exIdx) => {
      const t = ex.targets;
      rows.push({
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
        _ordreSeance: s.order,
        _ordreExo: exIdx,
        _couleur: s.color,
      });
    });
  }
  return rows;
}

function buildDataSheet(data: ProgramExport): XLSX.WorkSheet {
  const rows = buildDataRows(data);
  const aoa: (string | number | null)[][] = [COLS.map((c) => c.header)];
  for (const r of rows) aoa.push(COLS.map((c) => r[c.key] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLS.map((c) => ({ wch: c.w, hidden: c.hidden }));

  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < COLS.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      if (r === 0) {
        cell.s = headerStyle(COLS[c].required ? HEADER_REQUIRED : HEADER_OPTIONAL);
      } else {
        const color = (rows[r - 1]._couleur as string) || '#FFFFFF';
        cell.s = dataStyle(lighten(color, 0.86), { center: COLS[c].center });
      }
    }
  }
  return ws;
}

function buildMetaSheet(data: ProgramExport): XLSX.WorkSheet {
  const aoa = [
    ['Champ', 'Valeur'],
    ['type', 'programme'],
    ['formatVersion', data.formatVersion],
    ['nom', data.name],
    ['description', data.description ?? ''],
    ['', ''],
    ['Légende en-têtes', ''],
    ['Obligatoire', 'colonne à toujours remplir'],
    ['Optionnel', 'peut rester vide'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 18 }, { wch: 40 }];

  const setStyle = (r: number, c: number, style: unknown) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (ws[ref]) ws[ref].s = style;
  };
  setStyle(0, 0, headerStyle());
  setStyle(0, 1, headerStyle());
  setStyle(6, 0, headerStyle()); // titre « Légende en-têtes »
  setStyle(7, 0, headerStyle(HEADER_REQUIRED));
  setStyle(8, 0, headerStyle(HEADER_OPTIONAL));
  return ws;
}

export type BuildOutput = 'base64' | 'buffer';

export function buildProgramWorkbook(
  data: ProgramExport,
  output: BuildOutput = 'base64'
): string | Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildMetaSheet(data), META_SHEET);
  XLSX.utils.book_append_sheet(wb, buildDataSheet(data), DATA_SHEET);
  return XLSX.write(wb, {
    type: output === 'base64' ? 'base64' : 'buffer',
    bookType: 'xlsx',
    cellStyles: true,
  });
}

// ─── Lecture / validation ────────────────────────────────────────────────────

export type ParseInput =
  | { type: 'base64'; data: string }
  | { type: 'buffer'; data: Uint8Array | ArrayBuffer };

function readMeta(wb: XLSX.WorkBook): Map<string, string> {
  const ws = wb.Sheets[META_SHEET];
  if (!ws) throw new Error(`Onglet « ${META_SHEET} » introuvable.`);
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
  const map = new Map<string, string>();
  for (const row of rows.slice(1)) {
    if (row[0] != null && row[0] !== '') map.set(String(row[0]).trim(), String(row[1] ?? '').trim());
  }
  return map;
}

function readDataRows(wb: XLSX.WorkBook): Row[] {
  const ws = wb.Sheets[DATA_SHEET];
  if (!ws) throw new Error(`Onglet « ${DATA_SHEET} » introuvable.`);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (raw.length === 0) return [];
  const headers = (raw[0] as string[]).map((h) => String(h).trim());
  const headerToKey = new Map(COLS.map((c) => [c.header, c.key]));
  const missing = ['Séance', 'Exercice', '_ordreSeance', '_ordreExo'].filter(
    (h) => !headers.includes(h)
  );
  if (missing.length) {
    throw new Error(`Colonnes manquantes dans « ${DATA_SHEET} » : ${missing.join(', ')}.`);
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
  return rows;
}

function rowToTargets(r: Row): ProgramTargets {
  const t: ProgramTargets = {
    setsMin: num(r.seriesMin),
    setsMax: num(r.seriesMax),
    repsMin: num(r.repsMin),
    repsMax: num(r.repsMax),
    weightMin: num(r.poidsMin),
    weightMax: num(r.poidsMax),
    rirMin: num(r.rirMin),
    rirMax: num(r.rirMax),
    restSeconds: mmssToSeconds(r.repos as string),
    durationSeconds: mmssToSeconds(r.duree as string),
    tempo: r.tempo ? String(r.tempo).trim() : null,
  };
  validateTargets(t, String(r.exercice ?? '').trim());
  return t;
}

function validateTargets(t: ProgramTargets, exname: string) {
  const pairs: [string, number | null, number | null][] = [
    ['séries', t.setsMin, t.setsMax],
    ['reps', t.repsMin, t.repsMax],
    ['poids', t.weightMin, t.weightMax],
    ['RIR', t.rirMin, t.rirMax],
  ];
  for (const [label, min, max] of pairs) {
    if (min != null && max != null && min > max) {
      throw new Error(`« ${exname} » : ${label} min (${min}) > max (${max}).`);
    }
  }
  if (t.tempo != null && !TEMPO_RE.test(t.tempo)) {
    throw new Error(`« ${exname} » : tempo « ${t.tempo} » invalide (attendu n-n-n-n).`);
  }
}

export function parseProgramWorkbook(input: ParseInput): ProgramExport {
  const wb = XLSX.read(input.data, { type: input.type, cellStyles: false });

  const meta = readMeta(wb);
  if (meta.get('type') !== 'programme') {
    throw new Error(
      `Ce fichier n'est pas un programme (type = « ${meta.get('type') ?? '?'} »).`
    );
  }
  const version = parseInt(meta.get('formatVersion') ?? '0', 10);
  if (version > PROGRAM_FORMAT_VERSION) {
    throw new Error(
      `Fichier créé par une version plus récente (format ${version} > ${PROGRAM_FORMAT_VERSION}).`
    );
  }

  const rows = readDataRows(wb);
  const sessionMap = new Map<number, ProgramSessionExport>();

  for (const r of rows) {
    const sOrder = num(r._ordreSeance) ?? 0;
    let session = sessionMap.get(sOrder);
    if (!session) {
      session = {
        order: sOrder,
        name: r.seance ? String(r.seance).trim() : '',
        day: r.jour ? String(r.jour).trim() : null,
        color: r._couleur ? String(r._couleur) : '#007AFF',
        exercises: [],
      };
      if (!session.name) throw new Error(`Une séance (ordre ${sOrder}) n'a pas de nom.`);
      sessionMap.set(sOrder, session);
    }
    const exo: ProgramExerciseExport = {
      exerciseName: String(r.exercice ?? '').trim(),
      selectedVariation: r.variation ? String(r.variation).trim() : null,
      supersetLabel: r.superset ? String(r.superset).trim() : null,
      alternatives: String(r.alternatives ?? '')
        .split(';')
        .map((x) => x.trim())
        .filter(Boolean),
      targets: rowToTargets(r),
    };
    if (!exo.exerciseName) {
      throw new Error(`Séance « ${session.name} » : un exercice n'a pas de nom.`);
    }
    session.exercises.push(exo);
  }

  const sessions = [...sessionMap.values()].sort((a, b) => a.order - b.order);
  return {
    formatVersion: PROGRAM_FORMAT_VERSION,
    name: meta.get('nom') ?? 'Programme importé',
    description: meta.get('description') || null,
    sessions,
  };
}
