import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import TimerDisplay from './TimerDisplay';
import { useActiveSessionTick } from '../utils/useSessionTimer';

type Props = {
  // Écran qui affiche déjà ce repos (exercice, ou les deux exercices d'un superset)
  excludeLogId?: string | string[];
};

// Bandeau « repos en cours » (phase 11), et depuis l'amélioration 01b « superset en cours » :
// un superset quitté en pleine série ou avant d'avoir commencé reste visible (pas seulement
// pendant ses repos), et le tap y ramène.
export default function GlobalRestBanner({ excludeLogId }: Props) {
  const router = useRouter();
  const s = useActiveSessionTick();

  const excluded = excludeLogId == null ? [] : Array.isArray(excludeLogId) ? excludeLogId : [excludeLogId];
  const sup = s.activeSuperset;
  // Le chrono actif appartient-il au superset en cours ? (il peut avoir été quitté pour un autre exercice)
  const supOwnsTimer = sup != null && (s.activeExerciseLogId === sup.a || s.activeExerciseLogId === sup.b);
  const supersetHref = sup ? `/seance/superset?a=${sup.a}&b=${sup.b}` : null;

  // ─── Repos en cours (exercice seul ou superset) ───
  if (s.timerPhase === 'rest' && s.activeExerciseLogId) {
    if (excluded.includes(s.activeExerciseLogId)) return null;
    const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000);
    const isNegative = s.timerTargetSeconds != null && elapsed > s.timerTargetSeconds;
    return (
      <Pressable
        style={[styles.banner, isNegative && styles.bannerNegative]}
        onPress={() =>
          router.push((supOwnsTimer ? supersetHref : `/seance/exercice/${s.activeExerciseLogId}`) as any)
        }
      >
        <Text style={styles.title} numberOfLines={1}>
          Repos — {s.restForExerciseName ?? 'Exercice'}
        </Text>
        <TimerDisplay startedAt={s.timerStartedAt} targetSeconds={s.timerTargetSeconds} isRunning style={styles.time} />
      </Pressable>
    );
  }

  // ─── Superset en cours, hors repos : série en cours, ou en attente de « Commencer » ───
  // (si un AUTRE exercice est en pleine série, on ne masque pas son état par celui du superset)
  if (!sup || excluded.includes(sup.a) || excluded.includes(sup.b)) return null;
  const running = supOwnsTimer && s.timerPhase === 'execution';
  if (!running && s.timerPhase !== 'idle') return null;
  return (
    <Pressable style={[styles.banner, styles.bannerSuperset]} onPress={() => router.push(supersetHref as any)}>
      <Text style={styles.title} numberOfLines={1}>
        {running ? 'Superset en cours — série' : 'Superset en cours — reprendre ›'}
      </Text>
      {running && (
        <TimerDisplay startedAt={s.timerStartedAt} targetSeconds={s.timerTargetSeconds} isRunning style={styles.time} />
      )}
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
  bannerSuperset: {
    backgroundColor: '#007AFF',
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
