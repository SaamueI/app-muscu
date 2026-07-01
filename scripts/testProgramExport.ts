// Test PC du cœur export/import programme.
//   npx tsx scripts/testProgramExport.ts
// Génère out-programme.xlsx puis vérifie le round-trip build → parse.

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  buildProgramWorkbook,
  parseProgramWorkbook,
} from '../src/export/core/programXlsx';
import type { ProgramExport } from '../src/export/core/programTypes';
import { PROGRAM_FORMAT_VERSION } from '../src/export/core/programTypes';

const sample: ProgramExport = {
  formatVersion: PROGRAM_FORMAT_VERSION,
  name: 'PPL — Débutant',
  description: 'Push / Pull / Legs sur 3 jours.',
  sessions: [
    {
      order: 0,
      name: 'Push',
      day: 'Monday',
      color: '#E63946',
      exercises: [
        {
          exerciseName: 'Développé couché',
          selectedVariation: 'Barre',
          supersetLabel: null,
          alternatives: ['Développé haltères'],
          targets: { setsMin: 3, setsMax: 4, repsMin: 6, repsMax: 10, weightMin: 60, weightMax: 70, rirMin: 1, rirMax: 3, restSeconds: 180, durationSeconds: null, tempo: '3-1-1-0' },
        },
        {
          exerciseName: 'Élévations latérales',
          selectedVariation: null,
          supersetLabel: 'A',
          alternatives: [],
          targets: { setsMin: 3, setsMax: null, repsMin: 12, repsMax: 15, weightMin: null, weightMax: null, rirMin: 0, rirMax: 1, restSeconds: 60, durationSeconds: null, tempo: null },
        },
      ],
    },
    {
      order: 1,
      name: 'Pull',
      day: 'Wednesday',
      color: '#1D4ED8',
      exercises: [
        {
          // Exercice sans aucun objectif (tout null) — doit survivre au round-trip.
          exerciseName: 'Tractions',
          selectedVariation: null,
          supersetLabel: null,
          alternatives: ['Tirage vertical'],
          targets: { setsMin: null, setsMax: null, repsMin: null, repsMax: null, weightMin: null, weightMax: null, rirMin: null, rirMax: null, restSeconds: null, durationSeconds: null, tempo: null },
        },
      ],
    },
  ],
};

const buf = buildProgramWorkbook(sample, 'buffer') as Uint8Array;
const parsed = parseProgramWorkbook({ type: 'buffer', data: buf });

function writeOut(buf: Uint8Array): string {
  const primary = path.join(process.cwd(), 'out-programme.xlsx');
  try {
    fs.writeFileSync(primary, buf);
    return primary;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EBUSY') throw e;
    const alt = path.join(process.cwd(), `out-programme-${Date.now()}.xlsx`);
    fs.writeFileSync(alt, buf);
    return alt;
  }
}
const outPath = writeOut(buf);
console.log(`✅ Écrit ${outPath} (${buf.length} octets).`);

const a = JSON.stringify(sample, null, 2);
const b = JSON.stringify(parsed, null, 2);
if (a === b) {
  console.log('✅ Round-trip OK : programme ré-importé identique à la source.');
} else {
  console.error('❌ Round-trip DIFFÉRENT :');
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) console.error(`  L${i}:\n    src: ${la[i]}\n    relu: ${lb[i]}`);
  }
  process.exit(1);
}
