// Test PC du moteur de séquence d'un superset (amélioration 01).
//   npx tsx scripts/testSupersetSequence.ts
import type { LoggedSet, Side } from '../src/utils/exerciseProgress';
import {
  getNextStep,
  getObjectiveRows,
  peekStepAfter,
  restAfterStep,
  type RestMode,
  type SupersetExercise,
} from '../src/utils/supersetSequence';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}`);
  }
}
function eq(actual: string, expected: string, msg: string) {
  if (actual === expected) {
    console.log(`✅ ${msg}`);
  } else {
    failures++;
    console.error(`❌ ${msg}\n     attendu : ${expected}\n     obtenu  : ${actual}`);
  }
}

type Cfg = {
  planned: number;
  // Toggle Unilatéral : constant, ou fonction de la manche (pour « mode changé entre deux manches »)
  uni: boolean | ((round: number) => boolean);
  betweenSides?: boolean; // défaut true
  halve?: boolean;
  rest?: number | null; // repos de base ; défaut 60
  logs?: LoggedSet[]; // séries déjà enregistrées (reprise)
  start?: number;
};

function makeEx(cfg: Cfg, logs: LoggedSet[], round: number, firstSide: Side): SupersetExercise {
  return {
    setLogs: logs,
    plannedSetCount: cfg.planned,
    startSetNumber: cfg.start ?? 1,
    unilateral: typeof cfg.uni === 'function' ? cfg.uni(round) : cfg.uni,
    firstSide,
    restBetweenSides: cfg.betweenSides ?? true,
    halveRest: cfg.halve ?? false,
    baseRest: () => (cfg.rest === undefined ? 60 : cfg.rest),
  };
}

// Déroule le superset : à chaque étape on « enregistre » la série puis on recalcule.
// Renvoie une ligne par étape : « A1G ·60 » (repos après, « - » = aucun, « ~ » = chrono libre).
function run(
  a: Cfg,
  b: Cfg,
  opts: { mode?: RestMode; firstSide?: Side; steps: number }
): string {
  const mode = opts.mode ?? 'perExercise';
  const firstSide = opts.firstSide ?? 'L';
  const logs: Record<'a' | 'b', LoggedSet[]> = { a: [...(a.logs ?? [])], b: [...(b.logs ?? [])] };
  const out: string[] = [];
  let lastRound = 1;
  for (let i = 0; i < opts.steps; i++) {
    // Le toggle dépend de la manche à venir : on calcule d'abord une étape pour la connaître
    const probe = getNextStep(makeEx(a, logs.a, lastRound, firstSide), makeEx(b, logs.b, lastRound, firstSide), mode);
    lastRound = probe.round;
    const step = getNextStep(makeEx(a, logs.a, probe.round, firstSide), makeEx(b, logs.b, probe.round, firstSide), mode);
    logs[step.exercise].push({ setNumber: step.setNumber, side: step.side });
    const letter = step.exercise === 'a' ? 'A' : 'B';
    const side = step.side === 'L' ? 'G' : step.side === 'R' ? 'D' : '';
    const rest = step.rest == null ? '-' : step.rest.seconds == null ? '~' : String(step.rest.seconds);
    out.push(`${letter}${step.setNumber}${side}:${rest}`);
  }
  return out.join(' ');
}

const bi = (planned: number, extra: Partial<Cfg> = {}): Cfg => ({ planned, uni: false, ...extra });
const uni = (planned: number, extra: Partial<Cfg> = {}): Cfg => ({ planned, uni: true, ...extra });

// ── 2 bilatéraux ──────────────────────────────────────────────────────────────
eq(
  run(bi(2), bi(2), { steps: 4 }),
  'A1:60 B1:60 A2:60 B2:60',
  '2 bilatéraux, repos entre chaque exercice : A → B → A → B, repos après chacun'
);
eq(
  run(bi(2), bi(2), { mode: 'perRound', steps: 4 }),
  'A1:- B1:60 A2:- B2:60',
  '2 bilatéraux, 1 fois sur 2 : repos seulement après B'
);
eq(
  run(bi(2, { rest: 0 }), bi(2, { rest: 90 }), { mode: 'perRound', steps: 4 }),
  'A1:- B1:90 A2:- B2:90',
  '1 fois sur 2 : A à 0 s, B à 1:30 → 1:30 en fin de manche'
);
eq(
  run(bi(2, { rest: 120 }), bi(2, { rest: 90 }), { mode: 'perRound', steps: 2 }),
  'A1:- B1:120',
  '1 fois sur 2 : repos de fin de manche = max des deux (A > B)'
);
eq(
  run(bi(1, { rest: 0 }), bi(1, { rest: 90 }), { steps: 2 }),
  'A1:- B1:90',
  'entre chaque exercice : repos de base 0 s = pas de repos'
);
eq(
  run(bi(1, { rest: null }), bi(1, { rest: null }), { steps: 2 }),
  'A1:~ B1:~',
  'sans durée prévue : repos en chrono libre'
);
eq(
  run(bi(1, { rest: null }), bi(1, { rest: 90 }), { mode: 'perRound', steps: 2 }),
  'A1:- B1:90',
  '1 fois sur 2 : A sans durée, B chiffré → la durée chiffrée'
);

// ── Les 4 cas de latéralité ──────────────────────────────────────────────────
eq(
  run(uni(1), uni(1), { steps: 4 }),
  'A1G:60 A1D:60 B1G:60 B1D:60',
  '2 unilatéraux : A-G → A-D → B-G → B-D'
);
eq(
  run(uni(1), bi(1), { steps: 3 }),
  'A1G:60 A1D:60 B1:60',
  'A unilatéral + B bilatéral : A-G → A-D → B'
);
eq(
  run(bi(1), uni(1), { steps: 3 }),
  'A1:60 B1G:60 B1D:60',
  'A bilatéral + B unilatéral : A → B-G → B-D'
);
eq(
  run(uni(2), uni(2), { firstSide: 'R', steps: 4 }),
  'A1D:60 A1G:60 B1D:60 B1G:60',
  'côté de départ Droite : D puis G'
);
eq(
  run(uni(2), bi(2), { firstSide: 'R', steps: 6 }),
  'A1D:60 A1G:60 B1:60 A2D:60 A2G:60 B2:60',
  'côté de départ Droite, 2 manches, A unilatéral + B bilatéral'
);

// ── Repos entre côtés / ÷ 2 (exemple du plan § 4) ─────────────────────────────
eq(
  run(uni(1, { halve: true, rest: 60 }), uni(1, { betweenSides: false, rest: 90 }), { steps: 4 }),
  'A1G:30 A1D:30 B1G:- B1D:90',
  "§4, entre chaque exercice : A-G → repos A/2 → A-D → repos A/2 → B-G → B-D → repos B"
);
eq(
  run(uni(1, { halve: true, rest: 60 }), uni(1, { betweenSides: false, rest: 90 }), { mode: 'perRound', steps: 4 }),
  'A1G:30 A1D:- B1G:- B1D:90',
  '§4, 1 fois sur 2 : A-G → repos A/2 → A-D → B-G → B-D → repos max(A/2, B)'
);
eq(
  run(uni(1, { halve: true, rest: 200 }), uni(1, { betweenSides: false, rest: 90 }), { mode: 'perRound', steps: 4 }),
  'A1G:100 A1D:- B1G:- B1D:100',
  '1 fois sur 2 : le ÷ 2 de A est déjà appliqué dans le max (200/2 = 100 > 90)'
);
eq(
  run(uni(1, { betweenSides: false }), bi(1), { steps: 3 }),
  'A1G:- A1D:60 B1:60',
  'repos entre côtés désactivé : G et D enchaînés'
);
eq(
  run(uni(1, { betweenSides: false, halve: true }), bi(1), { steps: 3 }),
  'A1G:- A1D:60 B1:60',
  '÷ 2 sans repos entre côtés : ignoré (non proposé dans l\'interface)'
);
eq(
  run(bi(1, { halve: true }), bi(1), { steps: 2 }),
  'A1:60 B1:60',
  '÷ 2 sur un exercice bilatéral : sans effet'
);

// ── Nombre de séries différent ───────────────────────────────────────────────
eq(
  run(bi(3), bi(4), { steps: 8 }),
  'A1:60 B1:60 A2:60 B2:60 A3:60 B3:60 B4:60 A4:60',
  'A : 3 séries, B : 4 → la manche 4 ne contient que B ; puis hors plan'
);
eq(
  run(bi(3), bi(4), { mode: 'perRound', steps: 8 }),
  'A1:- B1:60 A2:- B2:60 A3:- B3:60 B4:60 A4:-',
  'idem en « 1 fois sur 2 » : B seul en manche 4 → son propre repos'
);
eq(
  run(bi(4), bi(3), { steps: 7 }),
  'A1:60 B1:60 A2:60 B2:60 A3:60 B3:60 A4:60',
  'A : 4 séries, B : 3 → la manche 4 ne contient que A'
);
eq(
  run(bi(2), bi(2), { steps: 6 }),
  'A1:60 B1:60 A2:60 B2:60 A3:60 B3:60',
  'au-delà du plan des deux : manches supplémentaires hors plan'
);
eq(
  run(bi(0), bi(3), { steps: 4 }),
  'A1:60 B1:60 A2:60 B2:60',
  'nombre de séries inconnu (programme à N variable) : alternance simple'
);

// ── Reprise après interruption (dérivé de la DB) ─────────────────────────────
eq(
  run(uni(2, { logs: [{ setNumber: 1, side: 'L' }] }), uni(2), { steps: 3 }),
  'A1D:60 B1G:60 B1D:60',
  'reprise : A-G déjà fait → A-D, puis B'
);
eq(
  run(bi(2, { logs: [{ setNumber: 1, side: null }] }), bi(2), { steps: 3 }),
  'B1:60 A2:60 B2:60',
  'reprise : A1 fait → B1 puis A2'
);
eq(
  run(bi(2, { logs: [{ setNumber: 1, side: null }, { setNumber: 2, side: null }] }), bi(2, { logs: [{ setNumber: 1, side: null }] }), { steps: 1 }),
  'B2:60',
  'reprise : A fini, B à la série 2'
);

// ── Mode changé entre deux manches ───────────────────────────────────────────
eq(
  run({ planned: 2, uni: (r) => r >= 2 }, bi(2), { steps: 6 }),
  'A1:60 B1:60 A2G:60 A2D:60 B2:60 A3G:60',
  'A passe unilatéral à la manche 2 : la manche est recalculée à chaque étape'
);
{
  // Série à moitié faite : le toggle repasse à « bilatéral » mais on termine quand même le côté manquant
  const a: SupersetExercise = {
    setLogs: [{ setNumber: 1, side: 'L' }],
    plannedSetCount: 2,
    startSetNumber: 1,
    unilateral: false,
    firstSide: 'L',
    restBetweenSides: true,
    halveRest: false,
    baseRest: () => 60,
  };
  const b: SupersetExercise = { ...a, setLogs: [] };
  const s = getNextStep(a, b, 'perExercise');
  assert(s.exercise === 'a' && s.setNumber === 1 && s.side === 'R', 'toggle décoché en cours de série : on termine le côté manquant');
}

// ── Plan 14 : exercice remplacé (startSetNumber) ─────────────────────────────
eq(
  run(
    bi(3, { start: 3, logs: [{ setNumber: 1, side: null }, { setNumber: 2, side: null }] }),
    bi(3, { logs: [{ setNumber: 1, side: null }, { setNumber: 2, side: null }] }),
    { steps: 2 }
  ),
  'A3:60 B3:60',
  'exercice remplacé : A reprend à la série 3 (start = 3), 1 série prévue restante'
);

// ── Étape déduite pour le « Terminer série » ─────────────────────────────────
{
  const a = makeEx(uni(1, { halve: true, rest: 60 }), [{ setNumber: 1, side: 'L' }], 1, 'L');
  const b = makeEx(bi(1), [], 1, 'L');
  const r = restAfterStep(a, b, 'perExercise', { exercise: 'a', setNumber: 1, side: 'R' });
  assert(r?.seconds === 30, 'restAfterStep : fin de série unilatérale ÷ 2 → 30 s');
  const r2 = restAfterStep(a, b, 'perExercise', { exercise: 'a', setNumber: 1, side: 'L' });
  assert(r2?.seconds === 30, 'restAfterStep : premier côté (G déjà enregistré) ');
}

// ── Objectifs entrelacés ─────────────────────────────────────────────────────
{
  const a = makeEx(bi(2, { logs: [{ setNumber: 1, side: null }] }), [{ setNumber: 1, side: null }], 1, 'L');
  const b = makeEx(bi(3), [], 1, 'L');
  const next = getNextStep(a, b, 'perExercise');
  const rows = getObjectiveRows(a, b, next);
  eq(
    rows.map((r) => `${r.exercise.toUpperCase()}${r.setNumber}:${r.status[0]}`).join(' '),
    'A1:d B1:c A2:t B2:t B3:t',
    'objectifs dans l\'ordre d\'exécution, A1 vert, B1 en cours'
  );
}

// ── Encodage différé + « À suivre » (amélioration 01b) ───────────────────────
{
  // Une ligne à encoder compte comme faite : la séquence avance
  const a = makeEx(bi(2), [{ setNumber: 1, side: null, isPending: true }], 1, 'L');
  const b = makeEx(bi(2), [], 1, 'L');
  const next = getNextStep(a, b, 'perExercise');
  assert(next.exercise === 'b' && next.setNumber === 1, 'A1 à encoder → la suite est B1');
  const rows = getObjectiveRows(a, b, next);
  eq(
    rows.map((r) => `${r.exercise.toUpperCase()}${r.setNumber}:${r.status[0]}`).join(' '),
    'A1:p B1:c A2:t B2:t',
    'objectifs : A1 orange (à encoder), B1 en cours'
  );
}
{
  const peek = (a: Cfg, b: Cfg, cur: { exercise: 'a' | 'b'; setNumber: number; side: Side | null }, mode: RestMode = 'perExercise') => {
    const s = peekStepAfter(makeEx(a, a.logs ?? [], 1, 'L'), makeEx(b, b.logs ?? [], 1, 'L'), mode, cur);
    return s == null ? 'fin' : `${s.exercise.toUpperCase()}${s.setNumber}${s.side === 'L' ? 'G' : s.side === 'R' ? 'D' : ''}`;
  };
  eq(peek(bi(2), bi(2), { exercise: 'a', setNumber: 1, side: null }), 'B1', 'À suivre : 2 bilatéraux, après A1 → B1');
  eq(peek(uni(1), uni(1), { exercise: 'a', setNumber: 1, side: 'L' }), 'A1D', 'À suivre : 2 unilatéraux, après A1G → A1D');
  eq(
    peek(uni(1, { logs: [{ setNumber: 1, side: 'L' }] }), uni(1), { exercise: 'a', setNumber: 1, side: 'R' }),
    'B1G',
    'À suivre : après A1D → B1G'
  );
  eq(peek(uni(1), bi(1), { exercise: 'a', setNumber: 1, side: 'L' }), 'A1D', 'À suivre : mixte, après A1G → A1D');
  eq(
    peek(
      bi(1, { logs: [{ setNumber: 1, side: null }] }),
      uni(1, { logs: [{ setNumber: 1, side: 'L' }] }),
      { exercise: 'b', setNumber: 1, side: 'R' },
      'perRound'
    ),
    'fin',
    'À suivre : B1D est la dernière étape prévue → fin du plan'
  );
  eq(
    peek(bi(1, { logs: [{ setNumber: 1, side: null }] }), bi(2), { exercise: 'b', setNumber: 1, side: null }),
    'B2',
    'À suivre : A fini, B a encore une série → B2'
  );
  eq(
    peek(bi(0, { logs: [{ setNumber: 1, side: null }] }), bi(0), { exercise: 'b', setNumber: 1, side: null }),
    'A2',
    'À suivre : plan inconnu → jamais « fin », manche suivante'
  );
}

if (failures > 0) {
  console.error(`\n${failures} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests passent');
