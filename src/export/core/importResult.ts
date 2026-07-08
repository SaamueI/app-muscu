// Type de retour partagé des imports (méso/programme). PUR (pas de dépendance).
// createdExercises = exercices personnalisés créés faute de correspondance par
// nom → alimente la réconciliation post-import (phase 12, solution 2).

export type CreatedExercise = { id: string; name: string };

export type ImportResult = {
  id: string; // id du mésocycle / programme créé
  createdExercises: CreatedExercise[];
};
