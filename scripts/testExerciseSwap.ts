// Test PC des helpers de remplacement d'exercice (amélioration 14).
//   npx tsx scripts/testExerciseSwap.ts
import { getChainInfo, getEffectiveVariation } from '../src/utils/exerciseSwap';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`✅ ${msg}`);
  else {
    failures++;
    console.error(`❌ ${msg}`);
  }
}

type Sets = { setNumber: number | null; side: string | null }[];
const B = (n: number) => ({ setNumber: n, side: null });
const L = (n: number) => ({ setNumber: n, side: 'L' });
const R = (n: number) => ({ setNumber: n, side: 'R' });

function mk(id: string, order: number, name: string, setLogs: Sets, plan: string | null = 'plan1', exerciseId = name) {
  return {
    log: {
      id,
      order,
      exerciseId,
      selectedVariation: null as string | null,
      mesoExerciseId: plan,
      programExerciseId: null,
    },
    exercise: { name },
    setLogs,
    mesoExercise: plan ? { exerciseId: 'Couché', selectedVariation: 'prise neutre' } : null,
    programExercise: null,
  };
}

// Pas de chaîne : série 1
{
  const a = mk('a', 0, 'Couché', []);
  const c = getChainInfo(a, [a]);
  assert(c.startSetNumber === 1 && c.previousSets.length === 0, 'seul log → départ série 1');
}
// 2 séries faites sur le couché, haltères derrière → reprise à 3
{
  const a = mk('a', 0, 'Couché', [B(1), B(2)]);
  const b = mk('b', 1, 'Haltères', []);
  const c = getChainInfo(b, [a, b]);
  assert(c.startSetNumber === 3, 'alternative après 2 séries → série 3');
  assert(
    c.previousSets.map((s) => `${s.setNumber}:${s.exerciseName}`).join(',') === '1:Couché,2:Couché',
    'séries précédentes attribuées au couché'
  );
}
// Alternative d'alternative
{
  const a = mk('a', 0, 'Couché', [B(1), B(2)]);
  const b = mk('b', 1, 'Haltères', [B(3)]);
  const c = mk('c', 2, 'Machine', []);
  const info = getChainInfo(c, [a, b, c]);
  assert(info.startSetNumber === 4, 'alternative d\'alternative → série 4');
  assert(info.previousSets[2].exerciseName === 'Haltères', 'la série 3 est attribuée aux haltères');
}
// Série à moitié faite : non comptée
{
  const a = mk('a', 0, 'Couché', [B(1), L(2)]);
  const b = mk('b', 1, 'Haltères', []);
  assert(getChainInfo(b, [a, b]).startSetNumber === 2, 'unilatéral à moitié fait → reprend à cette série');
}
{
  const a = mk('a', 0, 'Couché', [L(1), R(1)]);
  const b = mk('b', 1, 'Haltères', []);
  assert(getChainInfo(b, [a, b]).startSetNumber === 2, 'unilatéral complet (G+D) compte');
}
// Exercice libre / autre ligne de plan : pas de chaîne
{
  const a = mk('a', 0, 'Couché', [B(1)], null);
  const b = mk('b', 1, 'Haltères', [], null);
  assert(getChainInfo(b, [a, b]).startSetNumber === 1, 'exercice libre → série 1');
  const x = mk('x', 0, 'Couché', [B(1)], 'planA');
  const y = mk('y', 1, 'Rowing', [], 'planB');
  assert(getChainInfo(y, [x, y]).startSetNumber === 1, 'autre ligne de plan → pas de chaîne');
}
// Un log postérieur n'entre pas dans la chaîne
{
  const a = mk('a', 0, 'Couché', []);
  const b = mk('b', 1, 'Haltères', [B(3)]);
  assert(getChainInfo(a, [a, b]).startSetNumber === 1, 'log suivant ignoré');
}

// Variante effective
{
  const a = mk('a', 0, 'Couché', [], 'plan1', 'Couché');
  assert(getEffectiveVariation(a) === 'prise neutre', 'log ancien, exercice prévu → variante du plan');
  const b = mk('b', 1, 'Haltères', [], 'plan1', 'Haltères');
  assert(getEffectiveVariation(b) === null, 'log ancien, alternative → aucune');
  const c = mk('c', 0, 'Couché', [], 'plan1', 'Couché');
  c.log.selectedVariation = '';
  assert(getEffectiveVariation(c) === null, '« Aucune » explicite prime sur le plan');
  c.log.selectedVariation = 'large';
  assert(getEffectiveVariation(c) === 'large', 'variante propre au log');
}

if (failures > 0) {
  console.error(`\n${failures} échec(s)`);
  process.exit(1);
}
console.log('\nTout est vert');
