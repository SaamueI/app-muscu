// Test PC des transformations pures.  npx tsx scripts/testTransform.ts
import {
  buildNameIndex,
  groupIdsToLabels,
  labelsToGroupIds,
  normalizeName,
} from '../src/export/core/transform';

let failures = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}\n    attendu: ${b}\n    obtenu : ${a}`);
  }
}

// groupIdsToLabels
eq(groupIdsToLabels([null, null]), [null, null], 'solo → null');
eq(
  groupIdsToLabels(['g1', 'g1', null, 'g2']),
  ['A', 'A', null, 'B'],
  'deux groupes → A,A,null,B'
);
eq(
  groupIdsToLabels(Array.from({ length: 27 }, (_, i) => `g${i}`)).slice(25),
  ['Z', 'AA'],
  'base 26 : 26e → AA'
);

// labelsToGroupIds : même étiquette → même UUID, étiquettes ≠ → UUID ≠
let n = 0;
const gen = () => `uuid${n++}`;
const ids = labelsToGroupIds(['A', 'A', null, 'B'], gen);
eq(ids[0] === ids[1], true, 'même label → même UUID');
eq(ids[2], null, 'null label → null');
eq(ids[0] !== ids[3] && ids[3] != null, true, 'labels ≠ → UUID ≠');

// round-trip labels
const original = ['g-xyz', 'g-xyz', null, 'g-abc', 'g-abc'];
const labels = groupIdsToLabels(original);
let m = 0;
const regen = () => `new${m++}`;
const back = labelsToGroupIds(labels, regen);
eq(back[0] === back[1], true, 'round-trip : groupe 1 reste groupé');
eq(back[3] === back[4], true, 'round-trip : groupe 2 reste groupé');
eq(back[0] !== back[3], true, 'round-trip : groupes restent distincts');
eq(back[2], null, 'round-trip : solo reste solo');

// matching de noms
eq(normalizeName('  Développé   COUCHÉ '), 'développé couché', 'normalisation');
const idx = buildNameIndex([
  { id: 'e1', name: 'Squat' },
  { id: 'e2', name: 'squat' }, // doublon → premier gagne
  { id: 'e3', name: 'Soulevé de terre' },
]);
eq(idx.get(normalizeName('SQUAT')), 'e1', 'matching insensible à la casse, premier gagne');
eq(idx.get(normalizeName('Soulevé de terre')), 'e3', 'matching exact');
eq(idx.has(normalizeName('Inconnu')), false, 'nom absent → non trouvé');

if (failures) {
  console.error(`\n❌ ${failures} test(s) échoué(s).`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests transform OK.');
}
