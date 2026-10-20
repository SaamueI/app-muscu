import { useEffect, useState } from 'react';

import { getActiveSession, setActiveSession, subscribeSessionEnded, tickAutoStart } from './activeSessionStore';

export function useActiveSessionTick(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return getActiveSession();
}

/**
 * Minuteur GLOBAL du démarrage automatique en fin de repos (mode Auto). Monté UNE fois,
 * dans app/_layout.tsx : contrairement à un minuteur d'écran, il continue de tourner quand
 * l'utilisateur quitte l'écran exercice/superset — la série démarre donc quel que soit
 * l'écran affiché. Les écrans ne font que publier la prochaine série (`autoNext`).
 */
export function useAutoStartTicker() {
  useEffect(() => {
    const id = setInterval(() => tickAutoStart(), 1000);
    return () => clearInterval(id);
  }, []);
}

/** Suspend le démarrage auto tant qu'un modal de saisie est ouvert sur cet écran. */
export function useSuspendAutoStart(suspended: boolean) {
  useEffect(() => {
    if (!suspended) return;
    setActiveSession({ autoStartSuspended: true });
    return () => setActiveSession({ autoStartSuspended: false });
  }, [suspended]);
}

/** Rappelle `reload` quand une séance est terminée ou annulée (depuis n'importe où). */
export function useReloadOnSessionEnded(reload: () => void) {
  useEffect(() => subscribeSessionEnded(reload), [reload]);
}
