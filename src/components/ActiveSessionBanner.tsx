import { usePathname, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TimerDisplay from './TimerDisplay';
import { setActiveSession } from '../utils/activeSessionStore';
import { useActiveSessionTick } from '../utils/useSessionTimer';

const DRAG_THRESHOLD = 3;

export default function ActiveSessionBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const s = useActiveSessionTick();

  const pan = useRef(new Animated.ValueXY({ x: 12, y: insets.top + 8 })).current;
  const size = useRef({ width: 160, height: 48 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const { width: winW, height: winH } = Dimensions.get('window');
        const { width: pw, height: ph } = size.current;
        const curX = (pan.x as any)._value;
        const curY = (pan.y as any)._value;
        const clampedX = Math.min(Math.max(curX, 8), Math.max(8, winW - pw - 8));
        const clampedY = Math.min(Math.max(curY, insets.top + 4), Math.max(insets.top + 4, winH - ph - 8));
        if (clampedX !== curX || clampedY !== curY) {
          Animated.spring(pan, { toValue: { x: clampedX, y: clampedY }, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  if (!s.sessionId || s.bannerDismissed) return null;
  if (pathname.startsWith('/seance/')) return null;

  const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000);
  const isNegative =
    s.timerPhase !== 'idle' && s.timerTargetSeconds != null && elapsed > s.timerTargetSeconds;

  return (
    <Animated.View
      style={[styles.pill, { transform: pan.getTranslateTransform() }, isNegative && styles.pillNegative]}
      onLayout={(e) => { size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}
      {...panResponder.panHandlers}
    >
      <Pressable style={styles.content} onPress={() => router.push(`/seance/${s.sessionId}` as any)}>
        <Text style={styles.title}>Séance en cours</Text>
        {s.timerPhase !== 'idle' && (
          <TimerDisplay
            startedAt={s.timerStartedAt}
            targetSeconds={s.timerTargetSeconds}
            isRunning
            style={styles.time}
          />
        )}
      </Pressable>
      <Pressable hitSlop={8} onPress={() => setActiveSession({ bannerDismissed: true })}>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,122,255,0.85)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pillNegative: {
    backgroundColor: 'rgba(255,59,48,0.85)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  time: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  close: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
});
