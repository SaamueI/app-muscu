// Fusion d'un exercice personnalisé dans un exercice existant.
// Sert à la réconciliation post-import (phase 12, solution 2) : quand
// l'utilisateur constate qu'un exercice fraîchement créé est en réalité un
// doublon d'un exercice du catalogue, on réassigne toutes ses références vers
// la cible puis on supprime le custom devenu orphelin.
//
// Rappel FK (cf. CLAUDE.md) : les colonnes exercise_id référencent exercises.id
// SANS onDelete → il FAUT réassigner toutes les références avant de supprimer,
// sinon la contrainte FK bloque la suppression.

import { and, eq } from 'drizzle-orm';

import { db } from './index';
import { exerciseLogs, exercises, mesoExercises, programExercises } from './schema';

// Déduplique un tableau d'ids, renvoie null si le résultat est vide.
function dedupeCompact(ids: string[]): string[] | null {
  const next: string[] = [];
  for (const id of ids) {
    if (!next.includes(id)) next.push(id);
  }
  return next.length ? next : null;
}

// Remplace fromId par toId dans un tableau d'alternatives, en dédupliquant.
// Renvoie la même référence si fromId est absent (permet de sauter l'update),
// ou null si le tableau devient vide.
function replaceInAlt(alt: string[] | null, fromId: string, toId: string): string[] | null {
  if (!alt || !alt.includes(fromId)) return alt;
  return dedupeCompact(alt.map((id) => (id === fromId ? toId : id)));
}

// Retire id d'un tableau d'alternatives. Renvoie la même référence si id est
// absent (permet de sauter l'update), ou null si le tableau devient vide.
function removeFromAlt(alt: string[] | null, id: string): string[] | null {
  if (!alt || !alt.includes(id)) return alt;
  return dedupeCompact(alt.filter((v) => v !== id));
}

// Réassigne toutes les références de `fromId` vers `toId`, puis supprime
// l'exercice `fromId`. Refuse de supprimer un exercice du catalogue de base
// (garde-fou : seul un isCustom peut être fusionné/supprimé).
// `variation` (optionnel) : si fourni, écrit aussi `selectedVariation` sur les
// lignes template réassignées (meso_exercises / program_exercises) — sert à la
// réconciliation quand l'utilisateur choisit une variante de la cible.
export async function remapExercise(
  fromId: string,
  toId: string,
  variation?: string | null
): Promise<void> {
  if (fromId === toId) return;

  const [from] = await db
    .select({ id: exercises.id, isCustom: exercises.isCustom })
    .from(exercises)
    .where(eq(exercises.id, fromId));
  if (!from) return; // déjà absent
  if (!from.isCustom) {
    throw new Error('Seul un exercice personnalisé peut être fusionné.');
  }

  // 1. Références principales (exercise_id) dans les trois tables. exercise_logs
  // n'a pas de selectedVariation (colonne portée par les lignes template).
  const templateSet =
    variation === undefined
      ? { exerciseId: toId }
      : { exerciseId: toId, selectedVariation: variation };
  await db
    .update(mesoExercises)
    .set(templateSet)
    .where(eq(mesoExercises.exerciseId, fromId));
  await db
    .update(programExercises)
    .set(templateSet)
    .where(eq(programExercises.exerciseId, fromId));
  await db
    .update(exerciseLogs)
    .set({ exerciseId: toId })
    .where(eq(exerciseLogs.exerciseId, fromId));

  // 2. Alternatives (JSON) : meso_exercises + program_exercises.
  const meRows = await db
    .select({ id: mesoExercises.id, alt: mesoExercises.alternativeExerciseIds })
    .from(mesoExercises);
  for (const r of meRows) {
    const next = replaceInAlt(r.alt ?? null, fromId, toId);
    if (next !== (r.alt ?? null)) {
      await db
        .update(mesoExercises)
        .set({ alternativeExerciseIds: next })
        .where(eq(mesoExercises.id, r.id));
    }
  }
  const peRows = await db
    .select({ id: programExercises.id, alt: programExercises.alternativeExerciseIds })
    .from(programExercises);
  for (const r of peRows) {
    const next = replaceInAlt(r.alt ?? null, fromId, toId);
    if (next !== (r.alt ?? null)) {
      await db
        .update(programExercises)
        .set({ alternativeExerciseIds: next })
        .where(eq(programExercises.id, r.id));
    }
  }

  // 3. Suppression du custom devenu orphelin (garde-fou is_custom réaffirmé).
  await db
    .delete(exercises)
    .where(and(eq(exercises.id, fromId), eq(exercises.isCustom, true)));
}

// Récapitulatif des usages d'un exercice, pour l'alerte de suppression
// (fix 06) : nombre de références FK (bloquantes) + mentions en alternative
// (non-FK, à nettoyer mais pas bloquantes).
export interface ExerciseUsage {
  programExerciseCount: number;
  mesoExerciseCount: number;
  logCount: number;
  altCount: number;
}

export async function getExerciseUsage(exerciseId: string): Promise<ExerciseUsage> {
  const peRows = await db
    .select({ id: programExercises.id })
    .from(programExercises)
    .where(eq(programExercises.exerciseId, exerciseId));
  const meRows = await db
    .select({ id: mesoExercises.id })
    .from(mesoExercises)
    .where(eq(mesoExercises.exerciseId, exerciseId));
  const logRows = await db
    .select({ id: exerciseLogs.id })
    .from(exerciseLogs)
    .where(eq(exerciseLogs.exerciseId, exerciseId));

  const allPe = await db
    .select({ alt: programExercises.alternativeExerciseIds })
    .from(programExercises);
  const allMe = await db
    .select({ alt: mesoExercises.alternativeExerciseIds })
    .from(mesoExercises);
  const altCount =
    allPe.filter((r) => r.alt?.includes(exerciseId)).length +
    allMe.filter((r) => r.alt?.includes(exerciseId)).length;

  return {
    programExerciseCount: peRows.length,
    mesoExerciseCount: meRows.length,
    logCount: logRows.length,
    altCount,
  };
}

// Supprime en cascade un exercice personnalisé et toutes ses références
// (exercise_logs → set_logs, meso_exercises → meso_sets, program_exercises),
// puis nettoie les mentions dans les tableaux alternativeExerciseIds restants
// avant de supprimer l'exercice lui-même (garde-fou isCustom, comme
// remapExercise). Ordre important : tables référençantes avant exercises,
// FK sans onDelete sur exercise_id.
export async function deleteExerciseCascade(exerciseId: string): Promise<void> {
  const [row] = await db
    .select({ id: exercises.id, isCustom: exercises.isCustom })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  if (!row) return; // déjà absent
  if (!row.isCustom) {
    throw new Error('Seul un exercice personnalisé peut être supprimé.');
  }

  // set_logs / meso_sets cascadent automatiquement (onDelete: 'cascade').
  await db.delete(exerciseLogs).where(eq(exerciseLogs.exerciseId, exerciseId));
  await db.delete(mesoExercises).where(eq(mesoExercises.exerciseId, exerciseId));
  await db.delete(programExercises).where(eq(programExercises.exerciseId, exerciseId));

  const meRows = await db
    .select({ id: mesoExercises.id, alt: mesoExercises.alternativeExerciseIds })
    .from(mesoExercises);
  for (const r of meRows) {
    const next = removeFromAlt(r.alt ?? null, exerciseId);
    if (next !== (r.alt ?? null)) {
      await db
        .update(mesoExercises)
        .set({ alternativeExerciseIds: next })
        .where(eq(mesoExercises.id, r.id));
    }
  }
  const peRows = await db
    .select({ id: programExercises.id, alt: programExercises.alternativeExerciseIds })
    .from(programExercises);
  for (const r of peRows) {
    const next = removeFromAlt(r.alt ?? null, exerciseId);
    if (next !== (r.alt ?? null)) {
      await db
        .update(programExercises)
        .set({ alternativeExerciseIds: next })
        .where(eq(programExercises.id, r.id));
    }
  }

  await db
    .delete(exercises)
    .where(and(eq(exercises.id, exerciseId), eq(exercises.isCustom, true)));
}
