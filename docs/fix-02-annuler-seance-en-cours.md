# Fix 02 — Annuler une séance commencée

## Problème

Une fois une séance démarrée, impossible de l'annuler. L'alerte de retour de [app/seance/[sessionId].tsx:98](../app/seance/[sessionId].tsx) ne propose que « Interrompre » et « Clôturer ». Annuler = supprimer le `workout_session` (et ses logs) et faire redevenir l'événement calendrier « planifié ».

## Décisions actées

- **Sort de l'événement calendrier selon son origine** :
  - événement préexistant (séance planifiée via méso/calendrier) → conservé, statut repassé à `planned` ;
  - événement créé automatiquement par `startWorkoutSession()` (séance libre, ou lancée depuis un méso non ancré / un programme) → **supprimé** aussi, pour ne pas laisser d'événement fantôme.
- Pour savoir si l'événement a été créé au démarrage : nouvelle colonne `workout_sessions.created_event` (booléen), renseignée par `startWorkoutSession`. Robuste au redémarrage de l'app (contrairement à un flag dans `activeSessionStore`).
- Dans l'alerte de retour, « Annuler la séance » **remplace** « Clôturer » (limite Android : 3 boutons max). « Clôturer » reste accessible via le bouton rouge « Terminer » du header, toujours visible.

## Marche à suivre

### 1. Migration 0012 (manuelle — `drizzle-kit generate` est cassé, cf. CLAUDE.md)

- `src/db/migrations/0012_workout_session_created_event.sql` :

```sql
ALTER TABLE `workout_sessions` ADD COLUMN `created_event` integer NOT NULL DEFAULT 0;
```

- Import dans `src/db/migrations/migrations.js` (m0012).
- Entrée `meta/_journal.json` : `idx: 12`, `tag: "0012_workout_session_created_event"`, **`when: 1782700002000`** (strictement > 1782700001000, sinon migration silencieusement ignorée).
- `src/db/schema.ts` → `workoutSessions` : `createdEvent: integer('created_event', { mode: 'boolean' }).notNull().default(false)`.
- Mettre à jour CLAUDE.md (tableau des migrations + prochain `when` disponible).

### 2. `startWorkoutSession` (`src/db/session.ts`)

Dans la branche `!calEventId` (création d'un event ad hoc), insérer le `workout_session` avec `createdEvent: true` ; sinon `false` (défaut).

### 3. Helper `cancelWorkoutSession(sessionId)` (`src/db/session.ts`)

1. Charger la session ; si absente, no-op.
2. `db.delete(workoutSessions)` → cascade automatique vers `exercise_logs` puis `set_logs` (ON DELETE CASCADE).
3. Puis, selon `session.createdEvent` :
   - `true` → `db.delete(calendarEvents)` sur `session.calendarEventId` (possible car la session référençante vient d'être supprimée — FK sans cascade sinon bloquante) ;
   - `false` → `db.update(calendarEvents).set({ status: 'planned' })`.
4. Si `getActiveSession().sessionId === sessionId` → `resetActiveSession()` (coupe timer + bandeaux).

### 4. UI — `app/seance/[sessionId].tsx`

Restructurer `handleBackPress` (≤ 3 boutons par alerte, piège Android) :

- Alerte 1 « Quitter la séance » : `[Retour (cancel), Interrompre → router.back(), Annuler la séance…]`
- Alerte 2 (confirmation destructive) : compter les `set_logs` de la séance (`data.exerciseLogs.reduce(...)`) et afficher p.ex. « Les N séries enregistrées seront supprimées. La séance redeviendra planifiée dans le calendrier. » (adapter le message si `createdEvent` : « L'événement du calendrier sera supprimé. ») → `[Retour (cancel), Annuler la séance (destructive)]` → `await cancelWorkoutSession(sessionId); router.back();`

Les écrans appelants (`calendrier/[date]`, `(tabs)/calendrier`, méso session) rechargent au focus (`useFocusEffect`) → rien d'autre à faire.

## Points d'attention

- Ne **jamais** supprimer le `calendar_event` avant le `workout_session` (FK `workoutSessions.calendarEventId` NOT NULL sans onDelete → erreur).
- Les sessions existantes en base auront `created_event = 0` après migration : une séance libre déjà commencée avant la mise à jour laissera son event « planifié » après annulation — acceptable, cas transitoire.
- `finishSession` et `deleteCalendarEventCascade` ne changent pas.

## Vérification

- `npx tsc --noEmit`, puis `npx expo start --clear` (obligatoire après migration).
- Sur device :
  1. Séance planifiée (méso ancré) commencée → 2 séries loggées → retour → Annuler : logs supprimés, event redevient « planifié », bandeau/timer coupés.
  2. Séance libre (démarrée depuis méso non ancré) → Annuler : plus aucun événement dans le calendrier.
  3. Interrompre et Terminer se comportent comme avant.
