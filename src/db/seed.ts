import { count } from 'drizzle-orm';
import { db } from './index';
import { exercises } from './schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RAW: RawExercise[] = require('./exercises.json');

interface RawExercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  equipment: string | null;
  level: string;
  mechanic: string | null;
  force: string | null;
}

const TIME_CATEGORIES = new Set(['cardio', 'stretching']);

export async function seedExercises() {
  const [{ value }] = await db.select({ value: count() }).from(exercises);
  if (value > 0) return;

  const rows = RAW.map((e) => ({
    id: e.id,
    name: e.name,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles.length > 0 ? e.secondaryMuscles : null,
    description: e.instructions.join('\n\n'),
    measurementType: TIME_CATEGORIES.has(e.category)
      ? ('time' as const)
      : ('reps' as const),
    isCustom: false,
    equipment: e.equipment,
    category: e.category,
    level: ['beginner', 'intermediate', 'expert'].includes(e.level)
      ? (e.level as 'beginner' | 'intermediate' | 'expert')
      : null,
    mechanic: ['compound', 'isolation'].includes(e.mechanic ?? '')
      ? (e.mechanic as 'compound' | 'isolation')
      : null,
    force: ['pull', 'push', 'static'].includes(e.force ?? '')
      ? (e.force as 'pull' | 'push' | 'static')
      : null,
  }));

  // Insert in batches of 100 to avoid SQLite limits
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(exercises).values(rows.slice(i, i + 100));
  }
}
