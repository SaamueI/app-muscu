# Phase 10 — Accès aux détails d'une séance

> Document d'implémentation destiné à l'agent qui réalisera la phase.
> Lire `CLAUDE.md` en entier avant de commencer (surtout les sections « Ancrage calendaire » et « Piège FK récurrent »).

## Objectif

Trois fonctionnalités liées, dans cet ordre :

1. Un **écran de détail** d'une séance (`workout_session`), consultable qu'elle soit terminée ou en cours, avec un **mode édition** pour corriger a posteriori les séries enregistrées.
2. Depuis le **calendrier** (`app/calendrier/[date].tsx`) : accéder à ce détail pour tout événement `workout_session` ayant une séance associée.
3. Depuis un **mésocycle ancré** (`app/mesocycles/[id].tsx`) : afficher l'état de chaque séance planifiée (Planifié / Terminé / Annulé) et naviguer vers le détail d'une séance terminée.

Aucune migration DB n'est nécessaire. Les seules écritures sont celles du mode édition (update/delete de `set_logs`), via les helpers existants.

## Étape 1 — Écran détail (consultation + mode édition)

Créer `app/seance/details/[sessionId].tsx` (enregistrer la route dans `app/_layout.tsx` si nécessaire, en `push` normal, pas modal).

**Mode consultation (par défaut) :**

- Réutiliser `getSessionLive(sessionId)` de `src/db/session.ts` : il retourne déjà `{ session, exerciseLogs }` enrichis (exercice, set_logs, meso_sets, program_exercise). **Ne pas** créer de nouvelle requête si celle-ci suffit.
- Afficher : date de la séance, statut, liste des exercices dans l'ordre, et pour chacun ses séries réalisées (`setLogs`) : poids, reps, RIR, reps partielles, PDC, durée d'exécution.
- **Unilatéral** : deux `set_logs` par série logique avec `side='L'`/`'R'` et même `setNumber` — les afficher appariés (ex. « Série 2 — G: 20 kg × 10 / D: 20 kg × 9 »).
- **Unités** : les poids sont stockés en kg ; convertir à l'affichage via `src/utils/weightUtils.ts` selon `exercises.weightUnit` puis fallback `user_settings.weightUnit` (même logique que `app/seance/exercice/[logId].tsx` — s'en inspirer).
- Si la séance est encore `in_progress`, afficher un bouton « Reprendre la séance » qui route vers `/seance/[sessionId]`.

**Mode édition :**

- Un bouton « Modifier » (`headerRight` ou en haut de l'écran) fait basculer en édition. Deux implémentations acceptables — choisir la plus simple à maintenir : un state `editing` sur le même écran, ou une route dédiée `app/seance/details/[sessionId]/modifier.tsx`. La route dédiée est **recommandée** (header propre « Modifier la séance », bouton retour naturel, pas de mélange d'états).
- En édition, chaque série devient tappable → réouvre `SetPerformanceModal` prérempli avec le set (même mécanique que le mode `isEditing` de `app/seance/exercice/[logId].tsx`), sauvegarde via `updateSetLog` de `src/db/session.ts`.
- Suppression d'une série possible en édition, via `deleteSetLog`. **Reprendre la logique unilatérale de `[logId].tsx`** (`handleDeleteSetLog`) : supprimer aussi le set partenaire L/R de même `setNumber`.
- Périmètre : on édite les **séries** (poids, reps, RIR, partials, PDC), pas la structure de la séance (pas d'ajout/suppression d'exercice ici — ça reste le rôle de l'écran live). Ne pas toucher au statut de l'event ni aux liens méso.

## Étape 2 — Accès depuis le calendrier

Dans `app/calendrier/[date].tsx` :

- Le menu contextuel (état `openMenu`) propose aujourd'hui : Commencer/Reprendre (masqué si `completed`), Modifier, Supprimer.
- Ajouter un item **« Voir les détails »** affiché quand `ev.type === 'workout_session'` **et** qu'une séance existe : utiliser `getExistingSession(ev.id)` (déjà importé dans ce fichier) pour récupérer le `workoutSession.id`, puis `router.push('/seance/details/' + sessionId)`.
- Attention : `getExistingSession` est asynchrone — soit le résoudre au clic (simple, recommandé), soit précharger au `load()`. Ne pas afficher l'item pour un événement `planned` sans séance démarrée.

## Étape 3 — État des séances dans un mésocycle ancré

Dans `app/mesocycles/[id].tsx` :

- L'écran charge déjà `meso` et `sessions` (toutes les `meso_sessions` du méso). Il n'interroge **pas** les `calendar_events` actuellement.
- Si `meso.startDate` est non nul (méso ancré), charger en plus les events liés :
  ```ts
  // calendar_events où refType = 'meso_session' et refId ∈ sessions.map(s => s.id)
  // → map mesoSessionId → { status, eventId, date }
  ```
  Utiliser `inArray` de drizzle-orm. `refId` n'a pas de FK (par design), le lien est `(refType='meso_session', refId=mesoSessionId)`.
- Afficher un **badge de statut** sur chaque ligne de séance : réutiliser les couleurs/libellés de `app/calendrier/[date].tsx` (`STATUS_LABELS` / `STATUS_COLORS` — les extraire dans un module partagé, p.ex. `src/utils/eventStatus.ts`, plutôt que de dupliquer).
- Pour une séance dont l'event est `completed` : au tap, chercher le `workout_session` lié (`workoutSessions.mesoSessionId = mesoSession.id` — requête directe, ou via `calendarEventId = event.id`) et router vers `/seance/details/[sessionId]`.
- Méso **non ancré** : ne rien afficher de nouveau (pas de badge « inconnu »).

## Pièges connus

- **Désancrage** : `unanchorMesocycle` détache l'historique (`workoutSessions.mesoSessionId → null`). Après désancrage, une séance réalisée n'est donc **plus** atteignable depuis le méso — c'est le comportement voulu, ne pas essayer de le contourner.
- Un event `completed` a normalement toujours un `workout_session` lié (créé par `startWorkoutSession`), mais coder défensivement : si aucune séance trouvée, ne pas naviguer (ou item grisé).
- Pattern de rafraîchissement : `useFocusEffect(useCallback(() => { load(); }, [load]))` comme partout ailleurs.
- Les seules écritures DB autorisées dans cette phase sont `updateSetLog` / `deleteSetLog` en mode édition. Aucun `db.delete` direct sur d'autres tables.
- L'édition d'une série d'une séance **terminée** ne doit déclencher aucune resynchro calendrier/méso (le statut de l'event ne change pas).

## Critères d'acceptation

- [ ] Depuis le calendrier, ouvrir le détail d'une séance terminée montre exercices + séries + poids convertis dans la bonne unité.
- [ ] Une séance unilatérale affiche les côtés G/D appariés.
- [ ] Le bouton « Modifier » permet de corriger une série (poids, reps, RIR…) et de la supprimer ; la suppression d'un set unilatéral supprime la paire L/R.
- [ ] Quitter le mode édition et revenir : les corrections sont persistées et visibles en consultation.
- [ ] Dans un méso ancré, chaque séance affiche son badge Planifié/Terminé/Annulé, cohérent avec le calendrier.
- [ ] Taper une séance terminée dans le méso ouvre le même écran de détail.
- [ ] Un méso non ancré est visuellement inchangé.
- [ ] Aucune migration.
