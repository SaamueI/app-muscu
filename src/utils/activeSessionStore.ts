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
  // Repos choisi par l'utilisateur pour un exercice (prime sur l'objectif du plan)
  restOverrideByLog: Record<string, number>;
  // « Repos ÷ 2 » (unilatéral), par exercice — éphémère, réinitialisé à chaque séance
  halveRestByLog: Record<string, boolean>;
  // Côté de départ choisi pour un exercice (prime sur le réglage Paramètres) — éphémère
  startSideByLog: Record<string, 'L' | 'R'>;
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
  restOverrideByLog: {},
  halveRestByLog: {},
  startSideByLog: {},
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

// Remplacement d'exercice en cours de route (amélioration 14) : l'exercice actif change de
// log, on déplace donc avec lui ses réglages éphémères. Sans effet sur l'exercice actif
// si `fromId` n'en est pas un.
export function moveActiveExerciseLog(fromId: string, toId: string, exerciseName: string): void {
  const move = <T,>(rec: Record<string, T>): Record<string, T> => {
    if (!(fromId in rec)) return rec;
    const { [fromId]: value, ...rest } = rec;
    return { ...rest, [toId]: value };
  };
  const wasActive = state.activeExerciseLogId === fromId;
  state = {
    ...state,
    activeExerciseLogId: wasActive ? toId : state.activeExerciseLogId,
    restForExerciseName: wasActive ? exerciseName : state.restForExerciseName,
    restOverrideByLog: move(state.restOverrideByLog),
    halveRestByLog: move(state.halveRestByLog),
    startSideByLog: move(state.startSideByLog),
  };
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
