import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import TimerDisplay from './TimerDisplay';
import { useActiveSessionTick } from '../utils/useSessionTimer';

type Props = {
  excludeLogId?: string;
};

export default function GlobalRestBanner({ excludeLogId }: Props) {
  const router = useRouter();
  const s = useActiveSessionTick();

  if (s.timerPhase !== 'rest' || !s.activeExerciseLogId) return null;
  if (excludeLogId && s.activeExerciseLogId === excludeLogId) return null;

  const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000);
  const isNegative = s.timerTargetSeconds != null && elapsed > s.timerTargetSeconds;

  return (
    <Pressable
      style={[styles.banner, isNegative && styles.bannerNegative]}
      onPress={() => router.push(`/seance/exercice/${s.activeExerciseLogId}` as any)}
    >
      <Text style={styles.title} numberOfLines={1}>
        Repos — {s.restForExerciseName ?? 'Exercice'}
      </Text>
      <TimerDisplay
        startedAt={s.timerStartedAt}
        targetSeconds={s.timerTargetSeconds}
        isRunning
        style={styles.time}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#34C759',
  },
  bannerNegative: {
    backgroundColor: '#FF3B30',
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 12,
  },
  time: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
  },
});
