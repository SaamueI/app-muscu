// Test PC du moteur d'avancement de l'exercice live (amélioration 13).
//   npx tsx scripts/testExerciseProgress.ts
import {
  computeProgress,
  fixedPlannedSets,
  getEffectiveRest,
  isUnilateralHint,
  type LoggedSet,
} from '../src/utils/exerciseProgress';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}`);
  }
}

const L = (n: number): LoggedSet => ({ setNumber: n, side: 'L' });
const R = (n: number): LoggedSet => ({ setNumber: n, side: 'R' });
const B = (n: number): LoggedSet => ({ setNumber: n, side: null });

const base = { plannedSetCount: 4, isUnilateral: false, firstSide: 'L' as const };
const statuses = (p: ReturnType<typeof computeProgress>) => p.sets.map((s) => s.status).join(',');

// Bilatéral
{
  const p = computeProgress({ ...base, setLogs: [] });
  assert(p.next.setNumber === 1 && p.next.side === null, 'départ : série 1, sans côté');
  assert(statuses(p) === 'current,todo,todo,todo', 'départ : 1ʳᵉ ligne bleue');
}
{
  const p = computeProgress({ ...base, setLogs: [B(1), B(2)] });
  assert(p.next.setNumber === 3, 'bilatéral 2 faites → série 3');
  assert(statuses(p) === 'done,done,current,todo', 'bilatéral : vert, vert, bleu, todo');
}

// Unilatéral
{
  const p = computeProgress({ ...base, isUnilateral: true, setLogs: [] });
  assert(p.next.side === 'L', 'unilatéral : commence par firstSide L');
}
{
  const p = computeProgress({ ...base, isUnilateral: true, firstSide: 'R', setLogs: [] });
  assert(p.next.side === 'R', 'firstSide = R → commence par D');
}
{
  const p = computeProgress({ ...base, isUnilateral: true, setLogs: [L(1)] });
  assert(p.next.setNumber === 1 && p.next.side === 'R', 'moitié faite : même série, côté D');
  assert(p.sets[0].status === 'current' && p.sets[0].sidesDone.join() === 'L', 'moitié faite : bleu + « G ✓ »');
}
{
  const p = computeProgress({ ...base, isUnilateral: true, setLogs: [L(1), R(1)] });
  assert(p.next.setNumber === 2 && p.next.side === 'L', 'G+D faits → série 2 côté G');
  assert(p.sets[0].status === 'done', 'G+D faits → vert');
}
{
  // Série commencée par D (firstSide = R) : le côté manquant est G, quel que soit firstSide
  const p = computeProgress({ ...base, isUnilateral: true, firstSide: 'L', setLogs: [R(1)] });
  assert(p.next.setNumber === 1 && p.next.side === 'L', 'D fait en premier → manque G');
}

// Mode changé entre deux séries
{
  const p = computeProgress({ ...base, isUnilateral: true, setLogs: [B(1)] });
  assert(p.next.setNumber === 2 && p.next.side === 'L', 'série 1 bilatérale, toggle activé → série 2 en G');
  assert(p.sets[0].status === 'done', 'série bilatérale = faite');
}
{
  // Toggle désactivé alors qu'une série est à moitié faite : la moitié reste prioritaire
  const p = computeProgress({ ...base, isUnilateral: false, setLogs: [L(1)] });
  assert(p.next.setNumber === 1 && p.next.side === 'R', 'moitié faite prime sur le toggle');
}
{
  const p = computeProgress({ ...base, isUnilateral: false, setLogs: [L(1), R(1)] });
  assert(p.next.setNumber === 2 && p.next.side === null, 'unilatérale faite, toggle off → bilatérale');
}

// Trou après suppression
{
  const p = computeProgress({ ...base, setLogs: [B(2), B(3)] });
  assert(p.next.setNumber === 1, 'trou : la plus petite série manquante');
  assert(statuses(p) === 'current,done,done,todo', 'trou : 1 bleu, 2-3 verts');
}

// Hors plan
{
  const p = computeProgress({ ...base, plannedSetCount: 2, setLogs: [B(1), B(2)] });
  assert(p.next.setNumber === 3, 'plan terminé → série 3 hors plan');
  assert(p.sets.length === 3 && p.sets[2].status === 'current', 'hors plan : ligne 3 bleue');
}
{
  const p = computeProgress({ ...base, plannedSetCount: 2, setLogs: [B(1), B(2), B(3), B(4)] });
  assert(p.sets.length === 5 && p.sets[3].status === 'done', 'séries hors plan déjà faites : vertes');
}

// Exercice libre
{
  const p = computeProgress({ ...base, plannedSetCount: 0, setLogs: [B(1)] });
  assert(p.next.setNumber === 2, 'libre : série 2');
  assert(p.sets.length === 2, 'libre : lignes = séries faites + prochaine');
}

// startSetNumber
{
  const p = computeProgress({ ...base, setLogs: [], startSetNumber: 3 });
  assert(p.next.setNumber === 3, 'startSetNumber = 3 → démarre à 3');
  assert(p.sets[0].setNumber === 3, 'startSetNumber : lignes à partir de 3');
}
{
  const p = computeProgress({ ...base, setLogs: [B(1), B(2), B(3)], startSetNumber: 3 });
  assert(p.next.setNumber === 4, 'startSetNumber : séries < 3 ignorées');
}

// setNumber null (legacy) ignoré
{
  const p = computeProgress({ ...base, setLogs: [{ setNumber: null, side: null }] });
  assert(p.next.setNumber === 1, 'setNumber null ignoré');
}

// isUnilateralHint
assert(isUnilateralHint({ variation: 'Unilatéral', lastPerf: null }), 'variante « Unilatéral »');
assert(isUnilateralHint({ variation: 'unilatérale, prise neutre', lastPerf: [] }), 'variante « unilatérale, … »');
assert(isUnilateralHint({ variation: 'UNILATERAL', lastPerf: null }), 'variante « UNILATERAL »');
assert(!isUnilateralHint({ variation: 'prise neutre', lastPerf: [{ side: null }] }), 'prise neutre + historique bilatéral → non');
assert(isUnilateralHint({ variation: 'prise neutre', lastPerf: [{ side: 'L' }, { side: 'R' }] }), 'historique G/D → oui');
assert(isUnilateralHint({ variation: null, lastPerf: [{ side: 'R' }] }), 'sans variante + historique unilatéral → oui');
assert(!isUnilateralHint({ variation: null, lastPerf: null }), 'rien → non');

// getEffectiveRest
assert(getEffectiveRest({ override: null, target: 120, halve: false }) === 120, 'repos = objectif');
assert(getEffectiveRest({ override: 180, target: 120, halve: false }) === 180, 'override prime sur objectif');
assert(getEffectiveRest({ override: null, target: 120, halve: true }) === 60, 'repos ÷ 2');
assert(getEffectiveRest({ override: 180, target: 120, halve: true }) === 90, 'override ÷ 2');
assert(getEffectiveRest({ override: null, target: null, halve: true }) === null, 'pas de repos → null même ÷ 2');
assert(getEffectiveRest({ override: 45, target: null, halve: true }) === 23, '45 ÷ 2 arrondi');

// Encodage différé (amélioration 01b) : une ligne « à encoder » compte comme faite
{
  const pend = (l: LoggedSet): LoggedSet => ({ ...l, isPending: true });
  const p = computeProgress({ ...base, setLogs: [B(1), pend(B(2))] });
  assert(statuses(p) === 'done,pending,current,todo', 'à encoder : série 2 orange, la 3 en cours');
  assert(p.next.setNumber === 3, 'à encoder : ne repropose pas la série 2');
  const u = computeProgress({ ...base, isUnilateral: true, setLogs: [pend(L(1))] });
  assert(u.sets[0].status === 'current' && u.next.side === 'R', 'unilatéral, G à encoder : reste en cours, côté D');
  const u2 = computeProgress({ ...base, isUnilateral: true, setLogs: [L(1), pend(R(1))] });
  assert(u2.sets[0].status === 'pending', 'unilatéral, D à encoder : série complète orange');
}

// fixedPlannedSets
assert(fixedPlannedSets(3, 3) === 3, '3–3 → 3 lignes');
assert(fixedPlannedSets(3, 4) === 0, '3–4 → agrégé');
assert(fixedPlannedSets(3, null) === 0, 'un seul renseigné → agrégé');
assert(fixedPlannedSets(null, null) === 0, 'aucun → agrégé');

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests passent.');
