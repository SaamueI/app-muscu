// Test PC du cœur export/import mésocycle — aucune dépendance Expo.
//   npx tsx scripts/testMesoExport.ts
// Génère out.xlsx (à ouvrir dans Excel/LibreOffice pour valider le rendu)
// puis vérifie le round-trip build → parse.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildMesoWorkbook, parseMesoWorkbook } from '../src/export/core/mesoXlsx';
import type { MesocycleExport, MesoSessionExport } from '../src/export/core/mesoTypes';
import { MESO_FORMAT_VERSION } from '../src/export/core/mesoTypes';

function makeSession(
  weekIndex: number,
  order: number,
  title: string,
  day: string,
  color: string
): MesoSessionExport {
  return {
    weekIndex,
    order,
    title,
    day,
    color,
    note: order === 0 ? 'Échauffement 10 min' : null,
    exercises: [
      {
        exerciseName: 'Développé couché',
        selectedVariation: 'Barre',
        supersetLabel: 'A',
        alternatives: ['Développé haltères', 'Développé incliné'],
        note: 'Attention à l\'épaule droite, ne pas descendre trop bas',
        sets: [
          { setNumber: 1, repsMin: 6, repsMax: 8, weightMin: 80, weightMax: 85, rirMin: 2, rirMax: 3, restSeconds: 180, durationSeconds: null, tempo: '3-1-1-0' },
          { setNumber: 2, repsMin: 6, repsMax: 8, weightMin: 80, weightMax: 85, rirMin: 1, rirMax: 2, restSeconds: 180, durationSeconds: null, tempo: '3-1-1-0' },
          { setNumber: 3, repsMin: 8, repsMax: 10, weightMin: 75, weightMax: null, rirMin: 0, rirMax: 1, restSeconds: 150, durationSeconds: null, tempo: null },
        ],
      },
      {
        exerciseName: 'Écarté poulie',
        selectedVariation: null,
        supersetLabel: 'A',
        alternatives: [],
        note: null,
        sets: [
          { setNumber: 1, repsMin: 12, repsMax: 15, weightMin: 15, weightMax: null, rirMin: 1, rirMax: 2, restSeconds: 90, durationSeconds: null, tempo: null },
        ],
      },
      {
        // Exercice sans série (objectifs non saisis) — doit survivre au round-trip.
        exerciseName: 'Gainage',
        selectedVariation: null,
        supersetLabel: null,
        alternatives: ['Planche latérale'],
        note: null,
        sets: [],
      },
    ],
  };
}

const sample: MesocycleExport = {
  formatVersion: MESO_FORMAT_VERSION,
  name: 'Méso Hypertrophie — Bloc 1',
  numWeeks: 2,
  startDate: '2026-07-06',
  notes: 'Progression +2.5 kg/semaine sur le couché.',
  sessions: [
    makeSession(1, 0, 'Push', 'Monday', '#E63946'),
    makeSession(1, 1, 'Pull', 'Thursday', '#1D4ED8'),
    makeSession(2, 0, 'Push', 'Monday', '#E63946'),
    makeSession(2, 1, 'Pull', 'Thursday', '#1D4ED8'),
  ],
};

// 1) Build (en mémoire)
const buf = buildMesoWorkbook(sample, 'buffer') as Uint8Array;

// 2) Parse → round-trip (ne touche pas au disque)
const parsed = parseMesoWorkbook({ type: 'buffer', data: buf });

// 3) Écriture du fichier (fallback horodaté si out.xlsx est ouvert dans Excel)
function writeOut(buf: Uint8Array): string {
  const primary = path.join(process.cwd(), 'out.xlsx');
  try {
    fs.writeFileSync(primary, buf);
    return primary;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EBUSY') throw e;
    const alt = path.join(process.cwd(), `out-${Date.now()}.xlsx`);
    fs.writeFileSync(alt, buf);
    return alt;
  }
}
const outPath = writeOut(buf);
console.log(`✅ Écrit ${outPath} (${buf.length} octets) — ouvre-le pour vérifier les couleurs.`);

const a = JSON.stringify(sample, null, 2);
const b = JSON.stringify(parsed, null, 2);
if (a === b) {
  console.log('✅ Round-trip OK : le fichier ré-importé est identique à la source.');
} else {
  console.error('❌ Round-trip DIFFÉRENT. Diff (source ≠ relu) :');
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) console.error(`  L${i}: \n    src: ${la[i]}\n    relu: ${lb[i]}`);
  }
  process.exit(1);
}
