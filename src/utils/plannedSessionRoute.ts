import { eq } from 'drizzle-orm';

import { db } from '../db';
import { calendarEvents, mesoSessions, programSessions } from '../db/schema';

type CalendarEvent = typeof calendarEvents.$inferSelect;

// Résout la route vers l'écran de séance planifiée (méso ou programme) pour
// un événement calendrier `workout_session`. Retourne `null` si la cible a
// été supprimée (calendarEvents.refId est sans FK, par design).
export async function getPlannedSessionRoute(ev: CalendarEvent): Promise<string | null> {
  if (!ev.refId) return null;

  // refType absent = event pré-migration 0011 : comportement historique de
  // startWorkoutSession, fallback program_session.
  const refType = ev.refType ?? 'program_session';

  if (refType === 'meso_session') {
    const [ms] = await db
      .select()
      .from(mesoSessions)
      .where(eq(mesoSessions.id, ev.refId));
    if (!ms) return null;
    return `/mesocycles/${ms.mesocycleId}/sessions/${ev.refId}`;
  }

  const [ps] = await db
    .select()
    .from(programSessions)
    .where(eq(programSessions.id, ev.refId));
  if (!ps) return null;
  return `/programmes/${ps.programId}/sessions/${ev.refId}`;
}
