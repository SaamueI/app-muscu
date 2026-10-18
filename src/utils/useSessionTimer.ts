import { useEffect, useState } from 'react';

import { getActiveSession, subscribeSessionEnded } from './activeSessionStore';

export function useActiveSessionTick(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return getActiveSession();
}

/** Rappelle `reload` quand une séance est terminée ou annulée (depuis n'importe où). */
export function useReloadOnSessionEnded(reload: () => void) {
  useEffect(() => subscribeSessionEnded(reload), [reload]);
}
