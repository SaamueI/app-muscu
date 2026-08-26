# 07 — L'annulation d'une séance live ne réinitialise pas sa date

## Problème

`startPlannedSession` (`src/utils/startSessionFlow.ts`) propose trois choix quand on démarre une séance planifiée un autre jour (fix 04). Le choix **« Encoder aujourd'hui »** déplace l'événement :

```ts
await db.update(calendarEvents).set({ date: today }).where(eq(calendarEvents.id, ev.id));
```

La date planifiée d'origine est alors **perdue**. Si la séance est ensuite annulée, `cancelWorkoutSession` (`src/db/session.ts`) remet bien `status = 'planned'` mais laisse l'événement au jour courant :

> Séance planifiée **mardi**, démarrée **jeudi** avec « Encoder aujourd'hui », puis annulée → elle réapparaît planifiée **jeudi**, alors qu'elle n'a jamais eu lieu et que le planning disait mardi.

## Décisions actées

Mémoriser la date d'origine sur le `workout_session` créé, et la restaurer **à l'annulation uniquement**. Une séance terminée garde la date à laquelle elle a réellement été faite (comportement voulu du fix 04, inchangé).

## Marche à suivre

### 1. Migration — `workout_sessions.moved_event_from_date`

```sql
-- src/db/migrations/00NN_workout_session_moved_from.sql
ALTER TABLE `workout_sessions` ADD COLUMN `moved_event_from_date` text;
```

Nullable, sans défaut — même forme que la migration 0012 (`created_event`).

- `src/db/schema.ts` → `movedEventFromDate: text('moved_event_from_date'),` sur `workoutSessions`.
- `src/db/migrations/migrations.js` → import + entrée.
- `meta/_journal.json` → `when` **strictement supérieur** au précédent (dernier connu : `1782700002000`).

Migrations écrites à la main (`drizzle-kit generate` est cassé, cf. `CLAUDE.md`), puis `npx expo start --clear`.

### 2. `startWorkoutSession` — `src/db/session.ts`

Ajouter `movedEventFromDate?: string` au type `StartParams` et le poser dans le `db.insert(workoutSessions).values({ … })` :

```ts
movedEventFromDate: params.movedEventFromDate ?? null,
```

Rien d'autre à changer : la branche « événement ad hoc » (`!params.calendarEventId`) ne déplace jamais rien, elle crée l'événement à `today`.

### 3. `startPlannedSession` — `src/utils/startSessionFlow.ts`

Branche **« Encoder aujourd'hui »** uniquement :

```ts
await db.update(calendarEvents).set({ date: today }).where(eq(calendarEvents.id, ev.id));
const sessionId = await startWorkoutSession({
  calendarEventId: ev.id,
  movedEventFromDate: ev.date!,   // date d'origine, avant déplacement
});
```

Branche **« Encoder au {date planifiée} »** : ne rien passer, l'événement n'a pas bougé.

Les libellés et le nombre de boutons ne changent pas — l'alerte reste à **3 boutons**, pile la limite Android.

### 4. `cancelWorkoutSession` — `src/db/session.ts`

Dans la branche `else` (événement préexistant), inclure la date d'origine quand elle existe :

```ts
await db
  .update(calendarEvents)
  .set({
    status: 'planned',
    ...(session.movedEventFromDate ? { date: session.movedEventFromDate } : {}),
  })
  .where(eq(calendarEvents.id, session.calendarEventId));
```

La branche `session.createdEvent` reste inchangée : l'événement ad hoc est supprimé, il n'y a rien à restaurer.

### 5. `finishSession` — inchangé

Une séance terminée reste au jour où elle a été faite : c'est tout l'intérêt du choix « Encoder aujourd'hui ». Ne pas toucher à cette fonction.

## Points d'attention

- **Événement « à la semaine »** (`date` null, `week` renseignée) : `startPlannedSession` sort avant l'alerte, `movedEventFromDate` reste null, rien à restaurer. Ne pas tenter de gérer un déplacement de semaine ici.
- **Événement de méso ancré** : la date restaurée est celle que `syncMesoCalendarEvents` recalculerait de toute façon depuis `startDate + weekIndex + day` — la restauration va donc dans le même sens que le ré-ancrage, pas de nouveau conflit à arbitrer.
- **« Interrompre »** (quitter la séance sans l'annuler, `handleBackPress` dans `app/seance/[sessionId].tsx`) ne restaure rien : la séance existe toujours, l'événement doit rester au jour d'encodage.
- La colonne n'est lue **qu'à l'annulation** : les `workout_sessions` créés avant la migration ont `null` et gardent exactement le comportement actuel. Aucun backfill nécessaire.
- `cancelWorkoutSession` supprime le `workout_session` **avant** de toucher l'événement : lire `session.movedEventFromDate` dans la ligne déjà chargée en début de fonction, pas après le `delete`.

## Vérification

- `npx tsc --noEmit` → 0 erreur.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Séance planifiée **hier** → « Commencer » → « Encoder aujourd'hui » → l'événement passe à aujourd'hui dans le calendrier.
  2. Depuis la séance live → retour → « Annuler la séance » → l'événement est de retour **hier**, statut « planifié », et plus rien aujourd'hui.
  3. Même scénario avec « Encoder au {date} » → annulation → l'événement n'a jamais bougé, il est toujours hier et redevient planifié.
  4. Séance démarrée hors calendrier (événement ad hoc) → annulation → l'événement est bien **supprimé**, pas restauré.
  5. Séance déplacée puis **terminée** → l'événement reste à aujourd'hui, statut « terminé ».
