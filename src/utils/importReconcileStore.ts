// Store module-level (patron altPickerStore) pour transmettre à l'écran de
// détail — puis à l'écran de réconciliation — la liste des exercices
// personnalisés créés lors du dernier import (phase 12, solution 2).
// Rempli par src/export/actions.ts, lu par ImportReconcileBanner et
// app/exercices/reconcilier.tsx, vidé une fois la réconciliation terminée/passée.

import type { CreatedExercise } from '../export/core/importResult';

export type ImportReconcileState = {
  targetId: string; // id du mésocycle / programme importé
  kind: 'mesocycle' | 'programme';
  createdExercises: CreatedExercise[];
};

let pending: ImportReconcileState | null = null;

export function setImportReconcile(state: ImportReconcileState): void {
  pending = state.createdExercises.length > 0 ? state : null;
}

// Lecture sans consommation (la bannière peut être re-rendue plusieurs fois).
export function peekImportReconcile(): ImportReconcileState | null {
  return pending;
}

export function clearImportReconcile(): void {
  pending = null;
}
