import { useEffect, useState } from 'react';

import { getActiveSession } from './activeSessionStore';

export function useActiveSessionTick(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return getActiveSession();
}
