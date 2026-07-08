// Test PC du matcher d'exercices (suggestions de réconciliation).
//   npx tsx scripts/testExerciseMatch.ts
// Le catalogue simule quelques exercices du dataset (anglais).
import {
  normalizeLoose,
  suggestMatches,
  tokensFor,
  type CatalogEntry,
} from '../src/export/core/exerciseMatch';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}`);
  }
}

// Extrait représentatif du dataset anglais.
const CATALOG: CatalogEntry[] = [
  { id: 'bench', name: 'Barbell Bench Press - Medium Grip' },
  { id: 'incline-db', name: 'Incline Dumbbell Press' },
  { id: 'deadlift', name: 'Barbell Deadlift' },
  { id: 'rdl', name: 'Romanian Deadlift' },
  { id: 'squat', name: 'Barbell Full Squat' },
  { id: 'lat-pd', name: 'Wide-Grip Lat Pulldown' },
  { id: 'row', name: 'Bent Over Barbell Row' },
  { id: 'curl', name: 'Dumbbell Bicep Curl' },
  { id: 'lat-raise', name: 'Side Lateral Raise' },
  { id: 'calf', name: 'Standing Calf Raises' },
  { id: 'legpress', name: 'Leg Press' },
  { id: 'skull', name: 'Lying Triceps Press' }, // pas exactement "skull crusher"
  { id: 'facepull', name: 'Face Pull' },
];

function top(name: string): string | null {
  const s = suggestMatches(name, CATALOG);
  return s.length ? s[0].id : null;
}

// normalizeLoose
assert(normalizeLoose('  Développé  COUCHÉ ') === 'developpe couche', 'normalizeLoose accents/espaces');

// tokensFor : traduction FR→EN
const t1 = tokensFor('Développé couché incliné haltères');
assert(t1.has('incline') && t1.has('dumbbell') && t1.has('bench'), 'tokensFor traduit incliné/haltères/couché');

// Matching FR → EN
assert(top('Développé couché') === 'bench', 'Développé couché → Bench Press');
assert(top('Développé incliné haltères') === 'incline-db', 'Développé incliné haltères → Incline Dumbbell Press');
assert(top('Soulevé de terre') === 'deadlift', 'Soulevé de terre → Deadlift');
assert(top('Soulevé de terre roumain') === 'rdl', 'Soulevé de terre roumain → Romanian Deadlift');
assert(top('Tirage vertical') === 'lat-pd', 'Tirage vertical → Lat Pulldown');
assert(top('Rowing barre') === 'row', 'Rowing barre → Bent Over Barbell Row');
assert(top('Curl haltères') === 'curl', 'Curl haltères → Dumbbell Bicep Curl');
assert(top('Élévations latérales') === 'lat-raise', 'Élévations latérales → Side Lateral Raise');
assert(top('Mollets debout') === 'calf', 'Mollets debout → Standing Calf Raises');
assert(top('Presse à cuisses') === 'legpress', 'Presse à cuisses → Leg Press');
assert(top('Tirage visage') === 'facepull', 'Tirage visage → Face Pull');

// Faute de frappe en anglais (sans lexique, via Levenshtein)
assert(top('Barbel Bench Pres') === 'bench', 'Faute EN → Bench Press');

// Absence de match pertinent → aucune suggestion
assert(suggestMatches('Méditation matinale', CATALOG).length === 0, 'Terme hors-sujet → aucune suggestion');

if (failures) {
  console.error(`\n❌ ${failures} test(s) échoué(s).`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests exerciseMatch OK.');
}
