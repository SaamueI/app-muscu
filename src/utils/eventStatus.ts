export const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  in_progress: 'En cours',
  completed: 'Terminé',
  skipped: 'Annulé',
};

export const STATUS_COLORS: Record<string, string> = {
  planned: '#007AFF',
  in_progress: '#FF9500',
  completed: '#34C759',
  skipped: '#8E8E93',
};

// Une séance planifiée mais déjà démarrée (workout_session existante, non
// terminée) est affichée comme "en cours" sans que ce soit persisté en base
// (calendar_events.status n'a que planned/completed/skipped).
export function getEffectiveStatus(status: string, hasActiveSession: boolean): string {
  if (status === 'planned' && hasActiveSession) return 'in_progress';
  return status;
}
