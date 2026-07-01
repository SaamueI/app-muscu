import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';

type Props = {
  startedAt: number;
  targetSeconds: number | null;
  isRunning: boolean;
  style?: TextStyle;
};

function secondsToDisplay(n: number): string {
  const abs = Math.abs(n);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const sign = n < 0 ? '-' : '';
  return `${sign}${m}:${String(s).padStart(2, '0')}`;
}

export default function TimerDisplay({ startedAt, targetSeconds, isRunning, style }: Props) {
  const [, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const displayValue =
    targetSeconds != null ? targetSeconds - elapsed : elapsed;

  const isNegative = targetSeconds != null && displayValue < 0;
  const isCountingDown = targetSeconds != null;

  return (
    <Text
      style={[
        styles.text,
        isCountingDown && displayValue > 0 && styles.green,
        isNegative && styles.red,
        style,
      ]}
    >
      {secondsToDisplay(displayValue)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#8E8E93',
    textAlign: 'center',
  },
  green: {
    color: '#34C759',
  },
  red: {
    color: '#FF3B30',
  },
});
