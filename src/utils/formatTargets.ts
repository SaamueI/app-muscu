type ProgramExerciseTargets = {
  targetSetsMin?: number | null;
  targetSetsMax?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeightMin?: number | null;
  targetWeightMax?: number | null;
  targetRirMin?: number | null;
  targetRirMax?: number | null;
  targetRestSeconds?: number | null;
  targetDurationSeconds?: number | null;
};

function formatRange(min?: number | null, max?: number | null, unit = ''): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}${unit}`;
  return `${min ?? max}${unit}`;
}

export function formatTargets(pe: ProgramExerciseTargets): string {
  const parts: string[] = [];

  const sets = formatRange(pe.targetSetsMin, pe.targetSetsMax);
  if (sets) parts.push(`${sets} série${(pe.targetSetsMax ?? pe.targetSetsMin ?? 0) > 1 ? 's' : ''}`);

  const reps = formatRange(pe.targetRepsMin, pe.targetRepsMax);
  if (reps) parts.push(`${reps} reps`);

  const weight = formatRange(pe.targetWeightMin, pe.targetWeightMax, ' kg');
  if (weight) parts.push(weight);

  const rir = formatRange(pe.targetRirMin, pe.targetRirMax);
  if (rir) parts.push(`RIR ${rir}`);

  if (pe.targetRestSeconds != null) parts.push(`${pe.targetRestSeconds}s repos`);
  if (pe.targetDurationSeconds != null) parts.push(`${pe.targetDurationSeconds}s`);

  return parts.join(' · ');
}
