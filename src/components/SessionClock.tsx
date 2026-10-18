import { StyleSheet } from 'react-native';

import TimerDisplay from './TimerDisplay';
import { getActiveSession } from '../utils/activeSessionStore';

// Chrono global de la séance (temps écoulé depuis started_at), pour les
// headers natifs. Lit le store à chaque rendu ; TimerDisplay gère son propre tick.
export default function SessionClock() {
  const startedAt = getActiveSession().sessionStartedAt;
  if (startedAt == null) return null;
  return (
    <TimerDisplay
      startedAt={startedAt}
      targetSeconds={null}
      isRunning
      style={styles.text}
    />
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, fontWeight: '600' },
});
