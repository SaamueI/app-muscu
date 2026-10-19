// Remplacement d'exercice en séance live + variante effective (amélioration 14).
// Fonctions pures (aucun import React / DB à l'exécution) → testables sous Node :
// `npm run test:swap`. Les types viennent de session.ts (import de type uniquement).
import type { ExerciseLogEnriched } from '../db/session';

// Partie du log utile ici : on accepte des objets minimaux pour les tests.
type LogLike = {
  log: {
    id: string;
    order: number;
    exerciseId: string;
    selectedVariation: string | null;
    mesoExerciseId: string | null;
    programExerciseId: string | null;
  };
  exercise: { name: string };
  setLogs: { setNumber: number | null; side: string | null }[];
  mesoExercise: { exerciseId: string; selectedVariation: string | null } | null;
  programExercise: { exerciseId: string; selectedVariation: string | null } | null;
};

// Variante réellement faite sur ce log.
// - '' (« Aucune » choisie) → null ;
// - valeur propre au log → elle ;
// - null (log créé avant la migration) → variante du plan, mais seulement si c'est
//   bien l'exercice prévu qui est fait (la variante du plan ne vaut pas pour une alternative).
export function getEffectiveVariation(e: LogLike): string | null {
  const own = e.log.selectedVariation;
  if (own === '') return null;
  if (own != null) return own;
  const plan = e.mesoExercise ?? e.programExercise;
  if (plan && plan.exerciseId === e.log.exerciseId) return plan.selectedVariation ?? null;
  return null;
}

export type PreviousSet = { setNumber: number; exerciseName: string };

export type ChainInfo<T = LogLike> = {
  // 1 si ce log n'en remplace aucun ; sinon : 1 + plus haute série COMPLÈTE de la chaîne
  startSetNumber: number;
  // Séries déjà faites par les logs remplacés (pour « fait — Développé couché »)
  previousSets: PreviousSet[];
  // Logs remplacés (du plus ancien au plus récent), pour afficher leurs séries
  previousLogs: T[];
};

// Séries complètes d'un log : une ligne sans côté, ou les deux côtés G et D.
function completeSetNumbers(setLogs: LogLike['setLogs']): number[] {
  const byNumber = new Map<number, { none: boolean; l: boolean; r: boolean }>();
  for (const s of setLogs) {
    if (s.setNumber == null) continue;
    const g = byNumber.get(s.setNumber) ?? { none: false, l: false, r: false };
    if (s.side === 'L') g.l = true;
    else if (s.side === 'R') g.r = true;
    else g.none = true;
    byNumber.set(s.setNumber, g);
  }
  return [...byNumber.entries()].filter(([, g]) => g.none || (g.l && g.r)).map(([n]) => n);
}

// « Chaîne » des remplacements : les logs de la même séance qui partagent la même ligne
// de plan que `target` et le précèdent (order inférieur). Déduit, sans colonne dédiée.
// Un exercice libre (aucune ligne de plan) n'a pas de chaîne.
export function getChainInfo<T extends LogLike>(target: T, all: T[]): ChainInfo<T> {
  const planKey = target.log.mesoExerciseId ?? target.log.programExerciseId;
  if (!planKey) return { startSetNumber: 1, previousSets: [], previousLogs: [] };

  const chain = all.filter(
    (o) =>
      o.log.id !== target.log.id &&
      (o.log.mesoExerciseId ?? o.log.programExerciseId) === planKey &&
      o.log.order < target.log.order
  );

  const previousSets: PreviousSet[] = [];
  const previousLogs = [...chain].sort((a, b) => a.log.order - b.log.order);
  for (const o of previousLogs) {
    for (const n of completeSetNumbers(o.setLogs)) {
      previousSets.push({ setNumber: n, exerciseName: o.exercise.name });
    }
  }
  previousSets.sort((a, b) => a.setNumber - b.setNumber);
  const highest = previousSets.reduce((m, s) => Math.max(m, s.setNumber), 0);
  return { startSetNumber: highest + 1, previousSets, previousLogs };
}

// Même calcul directement depuis les données de séance chargées.
export function getChainInfoFor(logId: string, logs: ExerciseLogEnriched[]): ChainInfo<ExerciseLogEnriched> {
  const target = logs.find((l) => l.log.id === logId);
  return target ? getChainInfo(target, logs) : { startSetNumber: 1, previousSets: [], previousLogs: [] };
}
