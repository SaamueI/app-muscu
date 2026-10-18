// Moteur d'avancement d'un exercice en séance live (amélioration 13).
//
// Principe : on ne tient AUCUN compteur « série courante / côté courant » à la main.
// On le recalcule à chaque fois à partir des set_logs déjà enregistrés. Fonctions pures
// (aucun import React / DB) → testables sous Node : `npm run test:progress`.

export type Side = 'L' | 'R';

export type LoggedSet = { setNumber: number | null; side: Side | string | null };

export type SetState = {
  setNumber: number;
  // done = série complète ; current = prochaine série à faire ; todo = le reste
  status: 'done' | 'current' | 'todo';
  // Côtés déjà enregistrés (unilatéral à moitié fait : un seul élément)
  sidesDone: Side[];
};

export type Progress = {
  next: { setNumber: number; side: Side | null };
  sets: SetState[];
};

type ComputeInput = {
  setLogs: LoggedSet[];
  // Nombre de séries prévues (méso : mesoSets.length ; programme à N fixe) ; 0 si libre
  plannedSetCount: number;
  // État ACTUEL du toggle : ne sert que pour la prochaine série à démarrer
  isUnilateral: boolean;
  firstSide: Side;
  // > 1 quand le log remplace un exercice en cours de route (plan 14)
  startSetNumber?: number;
};

type Group = { hasNone: boolean; hasL: boolean; hasR: boolean };

export function computeProgress({
  setLogs,
  plannedSetCount,
  isUnilateral,
  firstSide,
  startSetNumber = 1,
}: ComputeInput): Progress {
  const groups = new Map<number, Group>();
  for (const l of setLogs) {
    if (l.setNumber == null || l.setNumber < startSetNumber) continue;
    const g = groups.get(l.setNumber) ?? { hasNone: false, hasL: false, hasR: false };
    if (l.side === 'L') g.hasL = true;
    else if (l.side === 'R') g.hasR = true;
    else g.hasNone = true;
    groups.set(l.setNumber, g);
  }

  const isDone = (g: Group) => g.hasNone || (g.hasL && g.hasR);
  const maxLogged = Math.max(startSetNumber - 1, ...groups.keys());

  // 1. Une série à moitié faite est toujours la prochaine, sur le côté manquant
  //    (quel que soit le toggle : on ne change pas de mode au milieu d'une série).
  let next: Progress['next'] | null = null;
  for (let n = startSetNumber; n <= maxLogged; n++) {
    const g = groups.get(n);
    if (g && !isDone(g)) {
      next = { setNumber: n, side: g.hasL ? 'R' : 'L' };
      break;
    }
  }

  // 2. Sinon : la plus petite série manquante (trou après suppression) ou max + 1.
  if (!next) {
    let n = startSetNumber;
    while (groups.has(n)) n++;
    next = { setNumber: n, side: isUnilateral ? firstSide : null };
  }

  const last = Math.max(plannedSetCount, maxLogged, next.setNumber);
  const sets: SetState[] = [];
  for (let n = startSetNumber; n <= last; n++) {
    const g = groups.get(n);
    const sidesDone: Side[] = [];
    if (g?.hasL) sidesDone.push('L');
    if (g?.hasR) sidesDone.push('R');
    const status: SetState['status'] =
      g && isDone(g) ? 'done' : n === next.setNumber ? 'current' : 'todo';
    sets.push({ setNumber: n, status, sidesDone });
  }

  return { next, sets };
}

// ─── Unilatéral : pré-réglage du toggle ───────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Le toggle est pré-coché si la variante prévue contient « unilatéral » (toute
// orthographe : « Unilatérale », « unilateral »…) OU si la dernière séance de cet
// exercice contenait des lignes côté G/D.
export function isUnilateralHint({
  variation,
  lastPerf,
}: {
  variation: string | null | undefined;
  lastPerf: { side: string | null }[] | null | undefined;
}): boolean {
  if (variation && normalize(variation).includes('unilateral')) return true;
  return (lastPerf ?? []).some((s) => s.side === 'L' || s.side === 'R');
}

// ─── Repos ────────────────────────────────────────────────────────────────────

// Repos réellement appliqué : le choix de l'utilisateur (override) prime sur l'objectif
// du plan ; « ÷ 2 » (unilatéral) divise le résultat. null = pas de décompte (chrono libre).
export function getEffectiveRest({
  override,
  target,
  halve,
}: {
  override: number | null | undefined;
  target: number | null | undefined;
  halve: boolean;
}): number | null {
  const base = override ?? target ?? null;
  if (base == null) return null;
  return halve ? Math.round(base / 2) : base;
}

// ─── Exercices de programme ───────────────────────────────────────────────────

// Un objectif de programme est agrégé (« 3–4 séries »). On ne peut dérouler des lignes
// « Série 1 … N » que si N est fixe : min et max renseignés et égaux.
export function fixedPlannedSets(
  min: number | null | undefined,
  max: number | null | undefined
): number {
  return min != null && max != null && min === max && min > 0 ? min : 0;
}
