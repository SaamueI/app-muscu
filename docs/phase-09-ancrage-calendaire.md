# Phase 09 — Ancrage calendaire des mésocycles

> Notes d'architecture (état final). Contenu déplacé de `CLAUDE.md` pour garder ce dernier concis — voir `CLAUDE.md` (section « Ancrage calendaire » et « Pièges connus ») pour le résumé et le pointeur ici.

Ancrer un mésocycle = choisir sa date de départ (`mesocycles.startDate`, lundi ISO de la semaine sélectionnée via `WeekPickerField`, écran `mesocycles/[id]/ancrer.tsx`). Ça génère des `calendar_events` pour chaque `meso_session` — **jamais** de `workout_sessions` à l'avance (celles-ci restent créées *lazily* par `startWorkoutSession()` quand l'utilisateur commence réellement une séance).

**Fonctions clés** (`src/db/meso.ts`) :
- `syncMesoCalendarEvents(mesocycleId)` — upsert idempotent par `(refType='meso_session', refId=mesoSessionId)`. N'écrase `title`/`date`/`week` que si l'event existant est `status='planned'` : un event déjà `completed`/`skipped` est un enregistrement historique figé (sinon une séance réalisée avant un ré-ancrage se retrouverait déplacée à la nouvelle date en gardant son statut « Terminé »). Branchée automatiquement en fin de `addWeek`/`duplicateWeek`/`deleteWeek`/`copyProgramSessionToMeso`/`addBlankMesoSession` et après modification d'une séance (day/title), donc toujours à jour sans action manuelle — à condition que `mesocycle.startDate` soit renseigné (no-op sinon).
- `detachCalendarEventForMesoSession(mesoSessionId)` — supprime le calendar_event si jamais commencé (orphelin), ou le décorrèle (`refId`/`refType` → `null`, event conservé comme historique autonome) s'il a un `workout_session` lié. Indispensable : `syncMesoCalendarEvents` retrouve un event via `(refType, refId)`, donc un lien laissé intact bloquerait indéfiniment tout futur (ré)ancrage de cette séance.
- `detachMesoSessionHistory(mesoSessionId)` — met à `null` `workoutSessions.mesoSessionId` et `exerciseLogs.mesoExerciseId` (FK sans cascade) pour permettre de supprimer une meso_session déjà exécutée sans violer de contrainte.
- `deleteMesoSessionCascade` / `deleteMesocycleCascade` — enchaînent les deux détachements ci-dessus avant de supprimer (utilisées partout où on supprime une séance/semaine/mésocycle, à la place d'un `db.delete` direct).
- `anchorMesocycle` / `unanchorMesocycle` — le désancrage détache complètement l'historique (mêmes fonctions que ci-dessus), pas seulement les events orphelins.
- `duplicateMesocycle` — copie indépendante (nouveaux IDs), `startDate: null`, jamais ancrée automatiquement.

**Suppression depuis le calendrier** (`src/db/session.ts` → `deleteCalendarEventCascade`) : supprime aussi le `workout_session` lié (cascade vers `exercise_logs`/`set_logs` via les FK du schéma), sinon la contrainte FK sur `workoutSessions.calendarEventId` bloque la suppression d'un event déjà réalisé.

**Piège FK récurrent** : `workoutSessions.calendarEventId`/`mesoSessionId` et `exerciseLogs.mesoExerciseId` référencent leur parent **sans** `onDelete` (`ON DELETE NO ACTION`). Toute suppression côté template (meso_session, mesocycle) ou côté calendrier doit détacher/gérer ces FK explicitement — ne jamais faire de `db.delete` direct sur `mesoSessions`/`mesocycles`/`calendarEvents` s'il peut exister un historique lié. (Résumé dans `CLAUDE.md` → « Pièges connus ».)
