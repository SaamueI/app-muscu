// Sérialisation XLSX d'un mésocycle (cœur pur, sans Expo).
//   buildMesoWorkbook(data)  → base64 | Uint8Array
//   parseMesoWorkbook(input) → MesocycleExport (+ throw si invalide)
//
// Le fichier contient deux onglets :
//   « Méta »      : clé/valeur (type, version, nom, semaines, date, notes)
//   « Mésocycle » : 1 ligne = 1 série, regroupée et teintée par séance.
// L'import lit par NOM d'en-tête (robuste au style / réordonnancement visuel).

import * as XLSX from 'xlsx-js-style';

import {
  MESO_FORMAT_VERSION,
  type MesoExerciseExport,
  type MesoSessionExport,
  type MesocycleExport,
  type MesoSetTarget,
} from './mesoTypes';
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
const DATA_SHEET = 'Mésocycle';
const TEMPO_RE = /^\d+-\d+-\d+-\d+$/;

// Colonnes de l'onglet données. `hidden` = colonne technique (ordre/couleur)
// nécessaire au round-trip mais masquée pour rester lisible.
// `required` = ne doit jamais être vide → en-tête ambre (sinon ardoise).
type Col = {
  key: string;
  header: string;
  w: number;
  hidden?: boolean;
  center?: boolean;
  required?: boolean;
};
const COLS: Col[] = [
  { key: 'semaine', header: 'Semaine', w: 8, center: true, required: true },
  { key: 'seance', header: 'Séance', w: 20 },
  { key: 'jour', header: 'Jour', w: 11 },
  { key: 'exercice', header: 'Exercice', w: 26, required: true },
  { key: 'variation', header: 'Variation', w: 16 },
  { key: 'superset', header: 'Superset', w: 9, center: true },
  { key: 'alternatives', header: 'Alternatives', w: 26 },
  { key: 'serie', header: 'Série', w: 7, center: true },
  { key: 'repsMin', header: 'Reps min', w: 9, center: true },
  { key: 'repsMax', header: 'Reps max', w: 9, center: true },
  { key: 'poidsMin', header: 'Poids min (kg)', w: 13, center: true },
  { key: 'poidsMax', header: 'Poids max (kg)', w: 13, center: true },
  { key: 'rirMin', header: 'RIR min', w: 8, center: true },
  { key: 'rirMax', header: 'RIR max', w: 8, center: true },
  { key: 'repos', header: 'Repos', w: 8, center: true },
  { key: 'duree', header: 'Durée', w: 8, center: true },
  { key: 'tempo', header: 'Tempo', w: 10, center: true },
  { key: 'note', header: 'Note séance', w: 24 },
  { key: '_ordreSeance', header: '_ordreSeance', w: 6, hidden: true, center: true, required: true },
  { key: '_ordreExo', header: '_ordreExo', w: 6, hidden: true, center: true, required: true },
  { key: '_couleur', header: '_couleur', w: 10, hidden: true },
];

export type Row = Record<string, string | number | null>;

// ─── Construction ──────────────────────────────────────────────────────────────

function buildDataRows(data: MesocycleExport): Row[] {
  const rows: Row[] = [];
  for (const s of data.sessions) {
    s.exercises.forEach((ex, exIdx) => {
      const base: Row = {
        semaine: s.weekIndex,
        seance: s.title ?? '',
        jour: s.day ?? '',
        exercice: ex.exerciseName,
        variation: ex.selectedVariation ?? '',
        superset: ex.supersetLabel ?? '',
        alternatives: ex.alternatives.join(' ; '),
        note: s.note ?? '',
        _ordreSeance: s.order,
        _ordreExo: exIdx,
        _couleur: s.color,
      };
      if (ex.sets.length === 0) {
        rows.push({ ...base, serie: '' });
      } else {
        for (const set of ex.sets) {
          rows.push({
            ...base,
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
    });
  }
  return rows;
}

function buildDataSheet(data: MesocycleExport): XLSX.WorkSheet {
  const rows = buildDataRows(data);
  const aoa: (string | number | null)[][] = [COLS.map((c) => c.header)];
  for (const r of rows) aoa.push(COLS.map((c) => r[c.key] ?? ''));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLS.map((c) => ({ wch: c.w, hidden: c.hidden }));

  // Styles. Ligne 0 = en-têtes ; lignes suivantes teintées par couleur de séance.
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

function buildMetaSheet(data: MesocycleExport): XLSX.WorkSheet {
  const aoa = [
    ['Champ', 'Valeur'],
    ['type', 'mesocycle'],
    ['formatVersion', data.formatVersion],
    ['nom', data.name],
    ['nbSemaines', data.numWeeks],
    ['dateDebut', data.startDate ?? ''],
    ['notes', data.notes ?? ''],
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
  // En-tête du tableau clé/valeur.
  setStyle(0, 0, headerStyle());
  setStyle(0, 1, headerStyle());
  // Légende : pastilles de couleur reprenant les en-têtes du tableau de données.
  setStyle(8, 0, headerStyle()); // titre « Légende en-têtes »
  setStyle(9, 0, headerStyle(HEADER_REQUIRED)); // pastille « Obligatoire »
  setStyle(10, 0, headerStyle(HEADER_OPTIONAL)); // pastille « Optionnel »
  return ws;
}

export type BuildOutput = 'base64' | 'buffer';

export function buildMesoWorkbook(
  data: MesocycleExport,
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

// Mappe header texte → clé interne, pour lire indépendamment de l'ordre.
function readDataRows(wb: XLSX.WorkBook): Row[] {
  const ws = wb.Sheets[DATA_SHEET];
  if (!ws) throw new Error(`Onglet « ${DATA_SHEET} » introuvable.`);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  if (raw.length === 0) return [];
  const headers = (raw[0] as string[]).map((h) => String(h).trim());
  const headerToKey = new Map(COLS.map((c) => [c.header, c.key]));
  const missing = ['Semaine', 'Exercice', '_ordreSeance', '_ordreExo'].filter(
    (h) => !headers.includes(h)
  );
  if (missing.length) {
    throw new Error(`Colonnes manquantes dans « ${DATA_SHEET} » : ${missing.join(', ')}.`);
  }
  const rows: Row[] = [];
  for (const r of raw.slice(1)) {
    const arr = r as unknown[];
    if (arr.every((v) => v === '' || v == null)) continue; // ligne vide
    const row: Row = {};
    headers.forEach((h, i) => {
      const key = headerToKey.get(h);
      if (key) row[key] = (arr[i] ?? '') as string | number | null;
    });
    rows.push(row);
  }
  return rows;
}

export function rowToSet(r: Row): MesoSetTarget | null {
  if (r.serie === '' || r.serie == null) return null;
  const set: MesoSetTarget = {
    setNumber: num(r.serie) ?? 1,
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
  validateSet(set);
  return set;
}

export function validateSet(s: MesoSetTarget) {
  const pairs: [string, number | null, number | null][] = [
    ['reps', s.repsMin, s.repsMax],
    ['poids', s.weightMin, s.weightMax],
    ['RIR', s.rirMin, s.rirMax],
  ];
  for (const [label, min, max] of pairs) {
    if (min != null && max != null && min > max) {
      throw new Error(`Série ${s.setNumber} : ${label} min (${min}) > max (${max}).`);
    }
  }
  if (s.tempo != null && !TEMPO_RE.test(s.tempo)) {
    throw new Error(`Série ${s.setNumber} : tempo « ${s.tempo} » invalide (attendu n-n-n-n).`);
  }
}

export function parseMesoWorkbook(input: ParseInput): MesocycleExport {
  const wb = XLSX.read(input.data, { type: input.type, cellStyles: false });

  const meta = readMeta(wb);
  if (meta.get('type') !== 'mesocycle') {
    throw new Error(
      `Ce fichier n'est pas un mésocycle (type = « ${meta.get('type') ?? '?'} »).`
    );
  }
  const version = parseInt(meta.get('formatVersion') ?? '0', 10);
  if (version > MESO_FORMAT_VERSION) {
    throw new Error(
      `Fichier créé par une version plus récente (format ${version} > ${MESO_FORMAT_VERSION}).`
    );
  }

  const rows = readDataRows(wb);

  // Regroupe par (semaine, ordreSeance) puis ordreExo, dans l'ordre d'apparition.
  // `order` est réinitialisé à chaque semaine → la clé doit inclure la semaine.
  const sessionMap = new Map<string, MesoSessionExport>();
  const exoMap = new Map<string, MesoExerciseExport>();

  for (const r of rows) {
    const week = num(r.semaine) ?? 1;
    const sOrder = num(r._ordreSeance) ?? 0;
    const eOrder = num(r._ordreExo) ?? 0;
    const sessionKey = `${week}:${sOrder}`;
    let session = sessionMap.get(sessionKey);
    if (!session) {
      session = {
        weekIndex: week,
        order: sOrder,
        title: r.seance ? String(r.seance) : null,
        day: r.jour ? String(r.jour) : null,
        color: r._couleur ? String(r._couleur) : '#007AFF',
        note: r.note ? String(r.note) : null,
        exercises: [],
      };
      sessionMap.set(sessionKey, session);
    }
    const exoKey = `${sessionKey}:${eOrder}`;
    let exo = exoMap.get(exoKey);
    if (!exo) {
      exo = {
        exerciseName: String(r.exercice ?? '').trim(),
        selectedVariation: r.variation ? String(r.variation).trim() : null,
        supersetLabel: r.superset ? String(r.superset).trim() : null,
        alternatives: String(r.alternatives ?? '')
          .split(';')
          .map((x) => x.trim())
          .filter(Boolean),
        sets: [],
      };
      if (!exo.exerciseName) {
        throw new Error(`Semaine ${session.weekIndex} : un exercice n'a pas de nom.`);
      }
      exoMap.set(exoKey, exo);
      session.exercises.push(exo);
    }
    const set = rowToSet(r);
    if (set) exo.sets.push(set);
  }

  const sessions = [...sessionMap.values()].sort(
    (a, b) => a.weekIndex - b.weekIndex || a.order - b.order
  );
  return {
    formatVersion: MESO_FORMAT_VERSION,
    name: meta.get('nom') ?? 'Mésocycle importé',
    numWeeks: parseInt(meta.get('nbSemaines') ?? '0', 10) || maxWeek(sessions),
    startDate: meta.get('dateDebut') || null,
    notes: meta.get('notes') || null,
    sessions,
  };
}

function maxWeek(sessions: MesoSessionExport[]): number {
  return sessions.reduce((m, s) => Math.max(m, s.weekIndex), 0);
}
