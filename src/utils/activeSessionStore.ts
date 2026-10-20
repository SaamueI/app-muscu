export type TimerPhase = 'idle' | 'execution' | 'rest';

// Prochaine série à démarrer quand le repos en mode Auto arrive à 0. Publiée par l'écran
// qui possède le chrono (exercice ou superset) ; lue par le minuteur GLOBAL
// (useAutoStartTicker, monté une fois dans app/_layout.tsx), pour que la série démarre
// même si l'utilisateur est sur un autre écran.
export type AutoNextStep = {
  logId: string;
  setNumber: number;
  side: 'L' | 'R' | null;
  execSeconds: number | null;
  // Superset : le repos réel avant la série est mesuré au démarrage (amélioration 01b)
  superset: boolean;
};

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
  // ─── Superset (amélioration 01) ───
  // Superset en cours : a = exercice qui commence la manche, b = l'autre. activeExerciseLogId
  // reste le log de l'étape courante (a ou b).
  activeSuperset: { a: string; b: string } | null;
  // Toggle « Unilatéral » par exercice (éphémère). Alimenté par l'écran superset et par le
  // toggle de l'écran exercice : un choix déjà fait n'est pas écrasé par la détection.
  unilateralByLog: Record<string, boolean>;
  // Superset : repos après chaque exercice, ou une fois par manche
  supersetRestMode: 'perExercise' | 'perRound';
  // Superset, par exercice unilatéral : repos entre les deux côtés (absent = activé)
  restBetweenSidesByLog: Record<string, boolean>;
  // ─── Superset : encodage différé + repos réel (amélioration 01b) ───
  // « Encoder les perfs à la pause » : sans repos après l'étape, pas de modal ; les séries
  // terminées attendent (lignes is_pending) et sont encodées au prochain repos.
  deferEncodingInSuperset: boolean;
  // Date.now() du dernier « Terminer série » du superset actif (null = aucune étape terminée)
  lastStepEndedAt: number | null;
  // Repos réel avant la série en cours, figé au « Commencer », écrit au « Terminer »
  restBeforeSeconds: number | null;
  // ─── Démarrage auto en fin de repos ───
  // null = rien à démarrer (ex. la série terminée n'a pas encore été enregistrée)
  autoNext: AutoNextStep | null;
  // Un modal de saisie est ouvert : on n'interrompt pas l'utilisateur
  autoStartSuspended: boolean;
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
  activeSuperset: null,
  unilateralByLog: {},
  supersetRestMode: 'perExercise',
  restBetweenSidesByLog: {},
  deferEncodingInSuperset: true,
  lastStepEndedAt: null,
  restBeforeSeconds: null,
  autoNext: null,
  autoStartSuspended: false,
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
    unilateralByLog: move(state.unilateralByLog),
    restBetweenSidesByLog: move(state.restBetweenSidesByLog),
    activeSuperset: state.activeSuperset
      ? {
          a: state.activeSuperset.a === fromId ? toId : state.activeSuperset.a,
          b: state.activeSuperset.b === fromId ? toId : state.activeSuperset.b,
        }
      : null,
  };
}

// Fin de repos en mode Auto : démarre `autoNext` si le compte à rebours est écoulé.
// Appelée chaque seconde par le minuteur global. Une seule exécution par repos : la phase
// passe à 'execution', la condition ne peut plus être vraie au tick suivant.
export function tickAutoStart(now: number = Date.now()): void {
  const st = state;
  const next = st.autoNext;
  if (st.timerPhase !== 'rest' || st.timerTargetSeconds == null || st.timerMode !== 'auto') return;
  if (st.autoStartSuspended || !next) return;
  const elapsed = Math.floor((now - st.timerStartedAt) / 1000);
  if (elapsed < st.timerTargetSeconds) return;
  state = {
    ...st,
    activeExerciseLogId: next.logId,
    timerPhase: 'execution',
    timerStartedAt: now,
    timerTargetSeconds: next.execSeconds,
    isUnilateral: next.side != null,
    currentSide: next.side,
    currentSetNumber: next.setNumber,
    restBeforeSeconds:
      next.superset && st.lastStepEndedAt != null
        ? Math.max(0, Math.round((now - st.lastStepEndedAt) / 1000))
        : st.restBeforeSeconds,
    autoNext: null,
  };
}

// Superset « en cours » : posé dès l'ouverture de l'écran superset (pas seulement au
// premier « Commencer »), effacé par « Terminer le superset » ou quand un de ses exercices
// est marqué fait. Changer de paire repart sans repos mesuré : le dernier « Terminer »
// appartenait à l'autre superset.
export function enterSuperset(a: string, b: string): void {
  const sup = state.activeSuperset;
  const samePair = sup != null && ((sup.a === a && sup.b === b) || (sup.a === b && sup.b === a));
  if (samePair) return;
  state = { ...state, activeSuperset: { a, b }, lastStepEndedAt: null, restBeforeSeconds: null };
}

export function leaveSuperset(): void {
  state = {
    ...state,
    activeSuperset: null,
    lastStepEndedAt: null,
    restBeforeSeconds: null,
    // Un repos peut encore courir : il ne doit plus lancer d'étape du superset terminé
    autoNext: state.autoNext?.superset ? null : state.autoNext,
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
