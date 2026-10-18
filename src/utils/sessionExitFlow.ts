import { eq } from 'drizzle-orm';
import { Alert } from 'react-native';

import { db } from '../db';
import { exerciseLogs, setLogs, workoutSessions } from '../db/schema';
import { cancelWorkoutSession, finishSession } from '../db/session';

// Flux de sortie d'une séance live, partagé entre l'écran séance (boutons
// « Terminer » / « Annuler la séance ») et le widget « Séance en cours » (croix).
// Ni l'un ni l'autre ne connaît forcément les exercise_logs en mémoire : on
// recompte les séries par une requête ponctuelle.

async function countSets(sessionId: string): Promise<number> {
  const rows = await db
    .select({ id: setLogs.id })
    .from(setLogs)
    .innerJoin(exerciseLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
    .where(eq(exerciseLogs.workoutSessionId, sessionId));
  return rows.length;
}

/** Termine la séance sans confirmation (l'appelant a déjà demandé). */
export async function finishSessionNow(sessionId: string, onDone?: () => void): Promise<void> {
  await finishSession(sessionId);
  onDone?.();
}

/**
 * Annule la séance : directement si aucune série n'est enregistrée, sinon
 * après une confirmation qui annonce le nombre de séries perdues.
 */
export async function promptCancelSession(sessionId: string, onDone?: () => void): Promise<void> {
  const doCancel = async () => {
    await cancelWorkoutSession(sessionId);
    onDone?.();
  };

  const setCount = await countSets(sessionId);
  if (setCount === 0) {
    await doCancel();
    return;
  }

  const [session] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, sessionId));
  const eventMsg = session?.createdEvent
    ? "L'événement du calendrier sera supprimé."
    : 'La séance redeviendra planifiée dans le calendrier.';
  Alert.alert(
    'Annuler la séance',
    `Les ${setCount} série${setCount > 1 ? 's' : ''} enregistrée${setCount > 1 ? 's' : ''} seront supprimées. ${eventMsg}`,
    [
      { text: 'Retour', style: 'cancel' },
      { text: 'Annuler la séance', style: 'destructive', onPress: doCancel },
    ]
  );
}

/** Alerte de la croix du widget : Annuler / Terminer / Retour (3 boutons = limite Android). */
export function promptExitSession(sessionId: string): void {
  Alert.alert('Séance en cours', undefined, [
    { text: 'Annuler la séance', style: 'destructive', onPress: () => { promptCancelSession(sessionId); } },
    { text: 'Terminer la séance', onPress: () => { finishSessionNow(sessionId); } },
    { text: 'Retour', style: 'cancel' },
  ]);
}
