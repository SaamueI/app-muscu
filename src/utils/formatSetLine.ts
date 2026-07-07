import { formatWeight } from './weightUtils';
import type { setLogs } from '../db/schema';

type SetLogRow = typeof setLogs.$inferSelect;

function formatExecSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

export function formatSetLine(sl: SetLogRow, unit: 'kg' | 'lb'): string {
  const parts: string[] = [];
  if (sl.weight != null) parts.push(formatWeight(sl.weight, unit));
  if (sl.reps != null) parts.push(`× ${sl.reps} reps`);
  if (sl.partialReps != null && sl.partialReps > 0) parts.push(`+${sl.partialReps} partielles`);
  if (sl.rir != null) parts.push(`RIR ${sl.rir}`);
  if (sl.pdc) parts.push('PDC');
  if (sl.executionSeconds != null) parts.push(`${formatExecSeconds(sl.executionSeconds)} exec.`);
  return parts.join(' · ') || '—';
}
