// Test PC du CSV et des templates (phase 12) — aucune dépendance Expo.
//   npx tsx scripts/testCsvImport.ts
// Vérifie : round-trip pivot → CSV → parse (méso + programme), et
// auto-cohérence des 4 templates (méso/programme × xlsx/csv).

import { buildMesoWorkbook, parseMesoWorkbook } from '../src/export/core/mesoXlsx';
import { buildProgramWorkbook, parseProgramWorkbook } from '../src/export/core/programXlsx';
import { mesoToCsv, parseMesoCsv } from '../src/export/core/mesoCsv';
import { programToCsv, parseProgramCsv } from '../src/export/core/programCsv';
import { SAMPLE_MESOCYCLE, SAMPLE_PROGRAM } from '../src/export/core/sampleData';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}`);
  }
}

// ─── 1. Round-trip pivot → CSV → parse (méso) ────────────────────────────────

{
  const csv = mesoToCsv(SAMPLE_MESOCYCLE);
  const parsed = parseMesoCsv(csv, 'Import test');
  check(parsed.name === 'Import test', 'méso CSV : nom = celui fourni à l\'import');
  check(parsed.sessions.length === SAMPLE_MESOCYCLE.sessions.length, 'méso CSV : même nombre de séances');
  check(
    JSON.stringify(parsed.sessions.map((s) => s.title)) ===
      JSON.stringify(SAMPLE_MESOCYCLE.sessions.map((s) => s.title)),
    'méso CSV : titres de séance préservés dans l\'ordre'
  );
  check(
    JSON.stringify(parsed.sessions.map((s) => s.exercises.map((e) => e.exerciseName))) ===
      JSON.stringify(SAMPLE_MESOCYCLE.sessions.map((s) => s.exercises.map((e) => e.exerciseName))),
    'méso CSV : exercices préservés dans l\'ordre'
  );
  check(
    JSON.stringify(parsed.sessions.map((s) => s.exercises.map((e) => e.sets))) ===
      JSON.stringify(SAMPLE_MESOCYCLE.sessions.map((s) => s.exercises.map((e) => e.sets))),
    'méso CSV : séries (reps/poids/rir/repos/tempo) préservées'
  );
  check(
    JSON.stringify(parsed.sessions.map((s) => s.exercises.map((e) => e.supersetLabel))) ===
      JSON.stringify(SAMPLE_MESOCYCLE.sessions.map((s) => s.exercises.map((e) => e.supersetLabel))),
    'méso CSV : supersets préservés'
  );
}

// ─── 2. Round-trip pivot → CSV → parse (programme) ───────────────────────────

{
  const csv = programToCsv(SAMPLE_PROGRAM);
  const parsed = parseProgramCsv(csv, 'Import test');
  check(parsed.name === 'Import test', 'programme CSV : nom = celui fourni à l\'import');
  check(parsed.sessions.length === SAMPLE_PROGRAM.sessions.length, 'programme CSV : même nombre de séances');
  check(
    JSON.stringify(parsed.sessions.map((s) => s.exercises.map((e) => ({ n: e.exerciseName, t: e.targets })))) ===
      JSON.stringify(SAMPLE_PROGRAM.sessions.map((s) => s.exercises.map((e) => ({ n: e.exerciseName, t: e.targets })))),
    'programme CSV : exercices + objectifs préservés'
  );
}

// ─── 3. Auto-cohérence des templates XLSX (round-trip exact) ────────────────

{
  const buf = buildMesoWorkbook(SAMPLE_MESOCYCLE, 'buffer') as Uint8Array;
  const parsed = parseMesoWorkbook({ type: 'buffer', data: buf });
  check(
    JSON.stringify(parsed) === JSON.stringify(SAMPLE_MESOCYCLE),
    'template méso XLSX : round-trip exact'
  );
}
{
  const buf = buildProgramWorkbook(SAMPLE_PROGRAM, 'buffer') as Uint8Array;
  const parsed = parseProgramWorkbook({ type: 'buffer', data: buf });
  check(
    JSON.stringify(parsed) === JSON.stringify(SAMPLE_PROGRAM),
    'template programme XLSX : round-trip exact'
  );
}

// ─── 4. Auto-cohérence des templates CSV (se réimportent sans erreur) ────────

{
  const csv = mesoToCsv(SAMPLE_MESOCYCLE);
  try {
    parseMesoCsv(csv, 'Modèle');
    console.log('✅ template méso CSV : se réimporte sans erreur');
  } catch (e) {
    failures++;
    console.error(`❌ template méso CSV : erreur à l'import — ${e}`);
  }
}
{
  const csv = programToCsv(SAMPLE_PROGRAM);
  try {
    parseProgramCsv(csv, 'Modèle');
    console.log('✅ template programme CSV : se réimporte sans erreur');
  } catch (e) {
    failures++;
    console.error(`❌ template programme CSV : erreur à l'import — ${e}`);
  }
}

// ─── 5. Cas d'erreur ─────────────────────────────────────────────────────────

function expectThrow(fn: () => void, msg: string) {
  try {
    fn();
    failures++;
    console.error(`❌ ${msg} (aucune erreur levée)`);
  } catch {
    console.log(`✅ ${msg}`);
  }
}

expectThrow(() => parseMesoCsv('', 'x'), 'méso CSV vide → erreur');
expectThrow(
  () => parseMesoCsv('Foo,Bar\n1,2', 'x'),
  'méso CSV en-têtes invalides (Semaine/Exercice manquants) → erreur'
);
expectThrow(() => parseProgramCsv('', 'x'), 'programme CSV vide → erreur');
expectThrow(
  () => parseProgramCsv('Foo,Bar\n1,2', 'x'),
  'programme CSV en-têtes invalides (Séance/Exercice manquants) → erreur'
);

// ─── 6. Mojibake (accents cassés par une réinterprétation Latin-1) ───────────
// Reproduit le bug rapporté : un CSV généré par un LLM dont les accents ont
// été cassés (ex. "Séance" → "SÃ©ance") faisait échouer l'import avec
// « colonne Séance manquante ». readCsvSheet doit réparer ça avant de parser.

function mojibake(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

{
  const csv = mojibake(programToCsv(SAMPLE_PROGRAM));
  try {
    const parsed = parseProgramCsv(csv, 'Import test');
    check(
      JSON.stringify(parsed.sessions.map((s) => s.name)) ===
        JSON.stringify(SAMPLE_PROGRAM.sessions.map((s) => s.name)),
      'programme CSV mojibaké : en-têtes ET noms de séance/exercice réparés'
    );
  } catch (e) {
    failures++;
    console.error(`❌ programme CSV mojibaké : import échoué — ${e}`);
  }
}

// ─── Bilan ───────────────────────────────────────────────────────────────────

if (failures) {
  console.error(`\n❌ ${failures} test(s) échoué(s).`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests CSV/templates OK.');
}
