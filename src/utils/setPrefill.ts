// Objectifs et préremplissage d'une série en séance live, extraits de l'écran exercice
// (amélioration 01) pour être partagés avec l'écran superset.
//
// Toutes les fonctions prennent leurs entrées en PARAMÈTRES (jamais de lecture implicite
// du store) : sinon un écran non actif pourrait écraser le timer d'un autre exercice
// (piège documenté dans CLAUDE.md).
import type { ExerciseLogEnriched, PerfGroup } from '../db/session';
import type { setLogs } from '../db/schema';

type SetLogRow = typeof setLogs.$inferSelect;

// ─── Objectifs d'une série ────────────────────────────────────────────────────

// Méso : une ligne par série (la dernière sert de repli) ; programme : objectif unique.
function mesoSetFor(enriched: ExerciseLogEnriched, setNumber: number) {
  if (enriched.mesoSets.length === 0) return null;
  return enriched.mesoSets[setNumber - 1] ?? enriched.mesoSets[enriched.mesoSets.length - 1];
}

export function getTargetRestSeconds(enriched: ExerciseLogEnriched, setNumber: number): number | null {
  const ms = mesoSetFor(enriched, setNumber);
  if (ms) return ms.targetRestSeconds ?? null;
  return enriched.programExercise?.targetRestSeconds ?? null;
}

export function getTargetExecutionSeconds(enriched: ExerciseLogEnriched, setNumber: number): number | null {
  const ms = mesoSetFor(enriched, setNumber);
  if (ms) return ms.targetDurationSeconds ?? null;
  return enriched.programExercise?.targetDurationSeconds ?? null;
}

// ─── Préremplissage du modal de saisie ────────────────────────────────────────
// Les lignes « à encoder » (amélioration 01b) n'ont pas de perfs : elles ne servent
// jamais de modèle, sinon on préremplirait avec du vide.

// Série de la dernière séance terminée (même numéro si possible, sinon la dernière).
export function getPrefillFromHistory(
  history: PerfGroup[],
  setNumber: number,
  side: 'L' | 'R' | null,
  isUnilateral: boolean
): SetLogRow | null {
  const last = history[0];
  if (!last || last.sets.length === 0) return null;
  const sideFilter = (sl: SetLogRow) =>
    isUnilateral ? sl.side === side : sl.side == null || sl.side === side;
  const candidates = last.sets.filter((sl) => !sl.isPending && sideFilter(sl));
  if (candidates.length === 0) return null;
  const sameSetNumber = candidates.find((sl) => sl.setNumber === setNumber);
  if (sameSetNumber) return sameSetNumber;
  return candidates[candidates.length - 1];
}

// Série précédente de LA SÉANCE EN COURS (priorité sur l'historique des séances passées,
// pour les séries après la première).
export function getPrefillFromCurrentSession(
  currentSetLogs: SetLogRow[],
  setNumber: number,
  side: 'L' | 'R' | null,
  isUnilateral: boolean
): SetLogRow | null {
  if (setNumber <= 1) return null;
  const sideFilter = (sl: SetLogRow) =>
    isUnilateral ? sl.side === side : sl.side == null || sl.side === side;
  return currentSetLogs.find((sl) => !sl.isPending && sl.setNumber === setNumber - 1 && sideFilter(sl)) ?? null;
}

export type SetPrefill = {
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  partialReps: number | null;
  pdc: boolean;
};

// Valeurs proposées pour la série `setNumber` : dernière série comparable (séance en cours,
// puis historique), sinon objectifs du plan.
export function computePrefill(
  enriched: ExerciseLogEnriched,
  history: PerfGroup[],
  setNumber: number,
  side: 'L' | 'R' | null
): SetPrefill {
  const mesoSet = mesoSetFor(enriched, setNumber);
  const pe = enriched.programExercise;
  const unilateral = side != null;
  const histSet =
    getPrefillFromCurrentSession(enriched.setLogs, setNumber, side, unilateral) ??
    getPrefillFromHistory(history, setNumber, side, unilateral);
  return {
    weightKg:
      histSet?.weight ??
      mesoSet?.targetWeightMin ?? mesoSet?.targetWeightMax ??
      pe?.targetWeightMin ?? pe?.targetWeightMax ?? null,
    reps:
      histSet?.reps ??
      mesoSet?.targetRepsMin ?? mesoSet?.targetRepsMax ??
      pe?.targetRepsMin ?? pe?.targetRepsMax ?? null,
    rir:
      histSet?.rir ??
      mesoSet?.targetRirMin ?? mesoSet?.targetRirMax ??
      pe?.targetRirMin ?? pe?.targetRirMax ?? null,
    partialReps: histSet?.partialReps ?? null,
    pdc: histSet?.pdc ?? false,
  };
}
