import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';

import { db } from '../db';
import { calendarEvents } from '../db/schema';
import { startWorkoutSession } from '../db/session';
import { formatShortDate } from './dateUtils';

type CalendarEvent = typeof calendarEvents.$inferSelect;

// Démarre une séance depuis un événement calendrier. Si l'événement est daté
// d'un autre jour qu'aujourd'hui, propose 3 choix pour résoudre l'incohérence
// calendrier × date d'encodage (fix 04). N'affecte pas le chemin "Poursuivre"
// (séance déjà en cours), qui doit rester direct côté appelant.
export function startPlannedSession(ev: CalendarEvent, onStarted: (sessionId: string) => void): void {
  const today = new Date().toISOString().slice(0, 10);

  if (!ev.date || ev.date === today) {
    startWorkoutSession({ calendarEventId: ev.id }).then(onStarted);
    return;
  }

  Alert.alert(
    `Séance planifiée le ${formatShortDate(ev.date)}`,
    "Cette séance n'est pas prévue aujourd'hui.",
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: "Encoder aujourd'hui",
        onPress: async () => {
          await db.update(calendarEvents).set({ date: today }).where(eq(calendarEvents.id, ev.id));
          const sessionId = await startWorkoutSession({ calendarEventId: ev.id });
          onStarted(sessionId);
        },
      },
      {
        text: `Encoder au ${formatShortDate(ev.date)}`,
        onPress: async () => {
          const sessionId = await startWorkoutSession({ calendarEventId: ev.id, date: ev.date! });
          onStarted(sessionId);
        },
      },
    ]
  );
}
