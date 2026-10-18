export type TimerPhase = 'idle' | 'execution' | 'rest';

type ActiveSession = {
  sessionId: string | null;
  sessionStartedAt: number | null;
  timerPhase: TimerPhase;
  timerStartedAt: number;
  timerTargetSeconds: number | null;
  timerMode: 'auto' | 'manual';
  isUnilateral: boolean;
  currentSide: 'L' | 'R' | null;
  currentSetNumber: number;
  activeExerciseLogId: string | null;
  lastRestPresets: Record<string, number>;
  lastExecutionSeconds: number | null;
  restForExerciseName: string | null;
};

const DEFAULT: ActiveSession = {
  sessionId: null,
  sessionStartedAt: null,
  timerPhase: 'idle',
  timerStartedAt: 0,
  timerTargetSeconds: null,
  timerMode: 'auto',
  isUnilateral: false,
  currentSide: null,
  currentSetNumber: 1,
  activeExerciseLogId: null,
  lastRestPresets: {},
  lastExecutionSeconds: null,
  restForExerciseName: null,
};

let state: ActiveSession = { ...DEFAULT };

export function getActiveSession(): ActiveSession {
  return state;
}

export function setActiveSession(updates: Partial<ActiveSession>): void {
  state = { ...state, ...updates };
}

export function resetActiveSession(): void {
  state = { ...DEFAULT };
}

// ─── Fin de séance ────────────────────────────────────────────────────────────
// finishSession / cancelWorkoutSession préviennent les écrans abonnés : un écran
// déjà affiché (calendrier, séance planifiée…) ne reçoit pas de nouveau « focus »
// quand la séance est terminée/annulée depuis le widget, il doit donc se recharger.

const endedListeners = new Set<() => void>();

export function subscribeSessionEnded(listener: () => void): () => void {
  endedListeners.add(listener);
  return () => { endedListeners.delete(listener); };
}

export function notifySessionEnded(): void {
  endedListeners.forEach((l) => l());
}
