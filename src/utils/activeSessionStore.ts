export type TimerPhase = 'idle' | 'execution' | 'rest';

type ActiveSession = {
  sessionId: string | null;
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
  bannerDismissed: boolean;
};

const DEFAULT: ActiveSession = {
  sessionId: null,
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
  bannerDismissed: false,
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
