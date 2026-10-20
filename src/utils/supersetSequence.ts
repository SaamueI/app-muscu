// Moteur de séquence d'un superset en séance live (amélioration 01).
//
// Même principe que `computeProgress` (exerciseProgress.ts) : AUCUN compteur « étape
// courante » tenu à la main. La prochaine étape est recalculée à chaque fois à partir des
// set_logs déjà enregistrés des deux exercices → on peut quitter l'écran en plein superset
// et y revenir, il reprend exactement où on en était.
//
// Fonctions pures (aucun import React / DB) → testables sous Node : `npm run test:superset`.
import { computeProgress, type LoggedSet, type Progress, type Side } from './exerciseProgress';

// 'a' = exercice choisi pour commencer, 'b' = l'autre. Dans une « manche » (un tour du
// superset), A passe toujours avant B.
export type ExKey = 'a' | 'b';

// 'perExercise' : repos après chaque exercice. 'perRound' : un seul repos en fin de manche.
export type RestMode = 'perExercise' | 'perRound';

// null = pas de repos ; { seconds: null } = repos en chrono libre (aucune durée prévue,
// le chrono monte) ; { seconds: n } = compte à rebours.
export type Rest = { seconds: number | null } | null;

export type SupersetExercise = {
  setLogs: LoggedSet[];
  // Séries prévues au plan (total, comme pour computeProgress) ; 0 si inconnu (programme à N variable)
  plannedSetCount: number;
  // > 1 quand le log remplace un exercice en cours de route (amélioration 14)
  startSetNumber: number;
  // État ACTUEL du toggle « Unilatéral » (ne sert que pour la prochaine série à démarrer)
  unilateral: boolean;
  firstSide: Side;
  // Réglages « repos » de l'exercice (voir le bloc Réglages du superset)
  restBetweenSides: boolean;
  halveRest: boolean;
  // Repos de base après la série `setNumber` (repos choisi au picker, sinon objectif du plan),
  // avant ÷ 2. null = aucune durée prévue.
  baseRest: (setNumber: number) => number | null;
};

export type SupersetStep = {
  exercise: ExKey;
  setNumber: number;
  side: Side | null;
  // Manche (1, 2, 3…) à laquelle appartient l'étape
  round: number;
  // Repos qui suit cette étape une fois terminée
  rest: Rest;
};

export type ObjectiveRowData = {
  exercise: ExKey;
  setNumber: number;
  round: number;
  status: 'done' | 'pending' | 'current' | 'todo';
  sidesDone: Side[];
};

// ─── Manches ──────────────────────────────────────────────────────────────────
// Deux exercices n'ont pas forcément le même nombre de séries prévues (A : 3, B : 4) :
// la manche 4 ne contient alors que B. Au-delà du plan des deux, les manches
// supplémentaires (« hors plan ») contiennent à nouveau A et B.
//
// k = rang de la série de l'exercice (1, 2, 3…, indépendant de startSetNumber).

// Séries prévues restantes de l'exercice ; null = inconnu (pas de manche « sautée »).
function plannedRemaining(ex: SupersetExercise): number | null {
  if (ex.plannedSetCount <= 0) return null;
  return Math.max(0, ex.plannedSetCount - (ex.startSetNumber - 1));
}

// Manche de la k-ième série de X (pX = ses séries prévues, pO = celles de l'autre).
function roundOf(k: number, pX: number | null, pO: number | null): number {
  if (pX == null || pO == null) return k;
  if (k <= pX) return k;
  return Math.max(pX, pO) + (k - pX);
}

// Réciproque : rang de la série de X dans la manche `round`, ou null si X n'y participe pas.
function setIndexInRound(pX: number | null, pO: number | null, round: number): number | null {
  if (pX == null || pO == null) return round;
  if (round <= pX) return round;
  const m = Math.max(pX, pO);
  if (round <= m) return null;
  return pX + (round - m);
}

// ─── Avancement par exercice ──────────────────────────────────────────────────

function progressOf(ex: SupersetExercise): Progress {
  return computeProgress({
    setLogs: ex.setLogs,
    plannedSetCount: ex.plannedSetCount,
    isUnilateral: ex.unilateral,
    firstSide: ex.firstSide,
    startSetNumber: ex.startSetNumber,
  });
}

// Série à moitié faite (un seul côté enregistré) : c'est toujours la prochaine étape.
function isHalfDone(p: Progress): boolean {
  const cur = p.sets.find((s) => s.status === 'current');
  return cur != null && cur.sidesDone.length > 0;
}

// Même test depuis l'exercice : sert à griser le toggle « Unilatéral » entre les deux côtés.
export function hasHalfDoneSet(ex: SupersetExercise): boolean {
  return isHalfDone(progressOf(ex));
}

// ─── Repos ────────────────────────────────────────────────────────────────────

// Repos effectif d'un exercice : base ÷ 2 si besoin. Une base de 0 s = pas de repos
// (un plan typique met 0 s sur A et 1:30 sur B) ; pas de base = chrono libre.
function restFrom(base: number | null, halve: boolean): Rest {
  if (base == null) return { seconds: null };
  const v = halve ? Math.round(base / 2) : base;
  return v > 0 ? { seconds: v } : null;
}

// Le plus long des repos : durée si au moins une est chiffrée, sinon chrono libre, sinon rien.
function maxRest(list: Rest[]): Rest {
  const timed = list.flatMap((r) => (r && r.seconds != null ? [r.seconds] : []));
  if (timed.length > 0) return { seconds: Math.max(...timed) };
  return list.some((r) => r && r.seconds == null) ? { seconds: null } : null;
}

// Cette série est-elle unilatérale ? Les lignes déjà enregistrées font foi, sinon le toggle.
function isUnilateralSet(ex: SupersetExercise, setNumber: number): boolean {
  const logged = ex.setLogs.filter((l) => l.setNumber === setNumber);
  if (logged.length > 0) return logged.some((l) => l.side === 'L' || l.side === 'R');
  return ex.unilateral;
}

// ÷ 2 : ne vaut que pour une série unilatérale AVEC repos entre les côtés (le réglage
// n'est proposé qu'à cette condition). Il divise tous les repos de l'exercice.
function halveApplies(ex: SupersetExercise, unilateralSet: boolean): boolean {
  return unilateralSet && ex.restBetweenSides && ex.halveRest;
}

// Repos qui suit une étape donnée (exercice, série, côté). Sert aussi au « Terminer série »,
// qui connaît l'étape en cours via le store et non via la prochaine étape.
export function restAfterStep(
  a: SupersetExercise,
  b: SupersetExercise,
  mode: RestMode,
  step: { exercise: ExKey; setNumber: number; side: Side | null }
): Rest {
  const x = step.exercise === 'a' ? a : b;
  const pX = plannedRemaining(x);
  const pO = plannedRemaining(step.exercise === 'a' ? b : a);
  const uni = step.side != null;
  const own = restFrom(x.baseRest(step.setNumber), halveApplies(x, uni));

  // Premier côté d'une série unilatérale : repos entre les côtés (ou rien)
  const secondSide =
    uni && x.setLogs.some((l) => l.setNumber === step.setNumber && l.side != null && l.side !== step.side);
  if (uni && !secondSide) return x.restBetweenSides ? own : null;

  // Fin de la série de X
  if (mode === 'perExercise') return own;

  // 'perRound' : repos seulement en fin de manche
  const round = roundOf(step.setNumber - x.startSetNumber + 1, pX, pO);
  if (step.exercise === 'a') {
    // B suit dans la manche : pas de repos ; sinon A est seul et clôt la manche
    return setIndexInRound(plannedRemaining(b), plannedRemaining(a), round) != null ? null : own;
  }
  const kA = setIndexInRound(plannedRemaining(a), plannedRemaining(b), round);
  if (kA == null) return own;
  const aSetNumber = a.startSetNumber + kA - 1;
  const aRest = restFrom(a.baseRest(aSetNumber), halveApplies(a, isUnilateralSet(a, aSetNumber)));
  return maxRest([aRest, own]);
}

// ─── Prochaine étape ──────────────────────────────────────────────────────────

export function getNextStep(a: SupersetExercise, b: SupersetExercise, mode: RestMode): SupersetStep {
  const progA = progressOf(a);
  const progB = progressOf(b);
  const pA = plannedRemaining(a);
  const pB = plannedRemaining(b);
  const kA = progA.next.setNumber - a.startSetNumber + 1;
  const kB = progB.next.setNumber - b.startSetNumber + 1;
  const roundA = roundOf(kA, pA, pB);
  const roundB = roundOf(kB, pB, pA);

  // Une série à moitié faite reprend toujours sur le côté manquant ; sinon la plus
  // ancienne manche d'abord, A avant B à manche égale.
  let key: ExKey;
  if (isHalfDone(progA)) key = 'a';
  else if (isHalfDone(progB)) key = 'b';
  else key = roundA <= roundB ? 'a' : 'b';

  const next = (key === 'a' ? progA : progB).next;
  return {
    exercise: key,
    setNumber: next.setNumber,
    side: next.side,
    round: key === 'a' ? roundA : roundB,
    rest: restAfterStep(a, b, mode, { exercise: key, setNumber: next.setNumber, side: next.side }),
  };
}

// ─── Objectifs dans l'ordre d'exécution (A·S1, B·S1, A·S2, B·S2…) ─────────────

export function getObjectiveRows(
  a: SupersetExercise,
  b: SupersetExercise,
  next: Pick<SupersetStep, 'exercise' | 'setNumber'>
): ObjectiveRowData[] {
  const pA = plannedRemaining(a);
  const pB = plannedRemaining(b);
  const rows: ObjectiveRowData[] = [];
  const add = (key: ExKey, ex: SupersetExercise, pX: number | null, pO: number | null) => {
    for (const s of progressOf(ex).sets) {
      rows.push({
        exercise: key,
        setNumber: s.setNumber,
        round: roundOf(s.setNumber - ex.startSetNumber + 1, pX, pO),
        status:
          s.status === 'done' || s.status === 'pending'
            ? s.status
            : key === next.exercise && s.setNumber === next.setNumber
            ? 'current'
            : 'todo',
        sidesDone: s.sidesDone,
      });
    }
  };
  add('a', a, pA, pB);
  add('b', b, pB, pA);
  return rows.sort((x, y) => x.round - y.round || (x.exercise === y.exercise ? 0 : x.exercise === 'a' ? -1 : 1));
}

// ─── « À suivre » (amélioration 01b) ──────────────────────────────────────────

// Étape qui suivra `current` une fois terminée : on ajoute virtuellement sa ligne à son
// exercice, puis on recalcule. null = l'étape courante est la dernière prévue au plan des
// deux exercices (les manches hors plan restent possibles). Si un des deux plans est
// inconnu (programme à N variable), on ne peut pas parler de fin de plan : jamais null.
export function peekStepAfter(
  a: SupersetExercise,
  b: SupersetExercise,
  mode: RestMode,
  current: { exercise: ExKey; setNumber: number; side: Side | null }
): SupersetStep | null {
  const withCurrent = (ex: SupersetExercise): SupersetExercise => ({
    ...ex,
    setLogs: [...ex.setLogs, { setNumber: current.setNumber, side: current.side }],
  });
  const nextA = current.exercise === 'a' ? withCurrent(a) : a;
  const nextB = current.exercise === 'b' ? withCurrent(b) : b;
  const step = getNextStep(nextA, nextB, mode);
  if (a.plannedSetCount <= 0 || b.plannedSetCount <= 0) return step;
  // Toutes les séries prévues de x sont faites (étape courante comprise) : la prochaine
  // série à faire est au-delà du plan.
  const planDone = (x: SupersetExercise) => progressOf(x).next.setNumber > x.plannedSetCount;
  return planDone(nextA) && planDone(nextB) ? null : step;
}
