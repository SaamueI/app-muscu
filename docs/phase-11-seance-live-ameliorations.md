# Phase 11 — Séance live : préremplissage par dernières perfs + chrono de repos global

> Document d'implémentation destiné à l'agent qui réalisera la phase.
> Lire `CLAUDE.md` (sections « Timer séance live » et « Patterns récurrents ») avant de commencer.

## Objectif

Trois améliorations de la séance live :

1. **Préremplissage** du modal de saisie (`SetPerformanceModal`) avec les **dernières performances enregistrées** de l'exercice, au lieu des objectifs (meso_sets / program_exercises).
2. Le **chrono de repos continue d'être visible** quand on quitte l'exercice : après avoir terminé un exercice, le repos en cours s'affiche aussi sur l'écran de séance et sur l'écran des autres exercices.
3. **Quitter la séance sans la terminer** : bouton retour en haut à gauche de `app/seance/[sessionId].tsx`, pop-up « Clôturer / Interrompre », et en cas d'interruption un **bandeau de reprise global** (visible dans toute l'app) affichant le chrono en cours, masquable sans conséquence.

Aucune migration DB. Tout se joue dans l'UI et `activeSessionStore`.

## Étape 1 — Préremplissage par les dernières perfs

État actuel (`app/seance/exercice/[logId].tsx`, ~lignes 314-323) : `prefillWeightKg` / `prefillReps` / `prefillRir` viennent de `mesoSet.target*` puis `programExercise.target*`.

Marche à suivre :

- `getPreviousPerfs(exerciseId, limit)` existe déjà dans `src/db/session.ts` : il retourne les N dernières séances contenant l'exercice, avec leurs `set_logs` groupés par séance et triés par `setNumber`. L'utiliser avec `limit = 1` (dernière séance).
- **Important** : exclure la séance en cours des résultats (le helper ne filtre pas par statut — vérifier, et si besoin passer le `workoutSessionId` courant à exclure, ou filtrer sur `workoutSessions.status = 'completed'`).
- Règle de préremplissage pour la série `n` (= `s.currentSetNumber`) :
  1. Chercher dans la dernière séance le `set_log` de même `setNumber` (et même `side` si unilatéral).
  2. À défaut (série n jamais faite), prendre le dernier `set_log` de cette séance.
  3. À défaut (aucun historique), **fallback sur les objectifs actuels** (comportement existant — ne pas le supprimer).
- Préremplir aussi `partialReps` et `pdc` depuis le set_log historique (actuellement forcés à `null`/`false` pour une nouvelle série).
- Le mode **édition** d'un set existant (`isEditing`) ne change pas : il préremplit toujours avec le set édité.
- Charger l'historique une fois dans le `load()` de l'écran (il affiche déjà un bloc historique — vérifier si `getPreviousPerfs` y est déjà appelé et réutiliser ce state au lieu de requêter deux fois).

Décision produit déjà tranchée : priorité au **même numéro de série** de la **dernière séance**, pas au meilleur set ni à une moyenne.

## Étape 2 — Chrono de repos visible partout

État actuel : le store `src/utils/activeSessionStore.ts` est module-level et basé sur des timestamps (`timerStartedAt = Date.now()`), donc le chrono **tourne déjà** en continu, y compris après navigation. Il est simplement masqué : dans `[logId].tsx` (~lignes 299-304), `phase` est forcée à `'idle'` quand `s.activeExerciseLogId !== logId`.

Marche à suivre :

- Créer un composant `src/components/GlobalRestBanner.tsx` : si `getActiveSession().timerPhase === 'rest'`, afficher un bandeau compact « Repos en cours — mm:ss » (réutiliser `TimerDisplay` ou sa logique de tick). Le bandeau doit se re-rendre via un `setInterval` local (le store n'est pas réactif — regarder comment `[logId].tsx` fait déjà tiquer son timer et reprendre le même mécanisme).
- L'afficher :
  - sur `app/seance/[sessionId].tsx` (liste À faire / Faits) ;
  - en haut de `app/seance/exercice/[logId].tsx` **quand le repos appartient à un autre exercice** (`s.activeExerciseLogId !== logId`). Quand il appartient à l'exercice courant, l'UI existante suffit.
- Ajouter au store un champ `restForExerciseName?: string` (ou similaire) renseigné au démarrage du repos, pour que le bandeau puisse dire *de quel exercice* vient le repos.
- **Comportement au changement d'exercice** (décision tranchée) : si l'utilisateur démarre une série d'un autre exercice pendant un repos en cours, le repos est simplement remplacé (transition `rest → execution` normale, `activeExerciseLogId` mis à jour). Pas de double timer.
- Tap sur le bandeau → naviguer vers l'exercice propriétaire du repos (`/seance/exercice/[activeExerciseLogId]`).

## Étape 3 — Quitter la séance sans la terminer + bandeau de reprise

**Bouton retour et pop-up :**

- Vérifier comment la route `/seance/[sessionId]` est configurée (header dans `app/_layout.tsx` ou options de l'écran). Ajouter un bouton retour explicite en `headerLeft` (ne pas compter sur le geste back seul — l'intercepter aussi si possible via `usePreventRemove` / listener `beforeRemove`, sinon au minimum le bouton).
- Au tap : `Alert.alert` à trois choix :
  - **Clôturer** — appelle `finishSession(sessionId)` (comportement du bouton « Terminer » actuel) puis `router.back()` ;
  - **Interrompre** — `router.back()` sans rien écrire en DB : la séance reste `in_progress`, le timer continue (il est basé sur des timestamps) ;
  - **Annuler** — ferme le pop-up.

**Bandeau de reprise global :**

- Créer `src/components/ActiveSessionBanner.tsx`, monté **une seule fois dans `app/_layout.tsx`** (au-dessus du `Stack`, position absolue en bas ou en haut) pour être visible sur tous les écrans.
- Visible quand : `getActiveSession().sessionId != null` **et** que l'utilisateur n'est pas déjà sur un écran `/seance/*` (utiliser `usePathname()` d'expo-router) **et** que le bandeau n'a pas été masqué.
- Contenu : titre court (« Séance en cours »), le **chrono en cours** (même mécanique de tick que l'étape 2 — mutualiser le hook de tick entre `GlobalRestBanner` et ce bandeau, p.ex. `src/utils/useSessionTimer.ts`), et une croix pour le masquer.
- Tap sur le bandeau → `router.push('/seance/' + sessionId)`.
- **Masquage sans conséquence** : ajouter un flag `bannerDismissed: boolean` dans `activeSessionStore` (défaut `false`). La croix le passe à `true` ; il est remis à `false` au démarrage d'une nouvelle séance et par `resetActiveSession()`. Masquer le bandeau ne touche ni au timer ni à la séance — on peut toujours la reprendre via le calendrier (« Reprendre la séance », existant).
- Forme : un **bandeau** fixe (recommandé — simple, fiable). Une bulle flottante déplaçable in-app est acceptable en alternative, mais ne pas y investir si ça complique (la vraie bulle système par-dessus les autres apps est hors scope, voir phase 13).
- **Contrainte d'ordre** : `sessionId` est bien renseigné dans le store, mais vérifier qu'il est remis à `null`/reset à `finishSession` ; le bandeau ne doit jamais pointer vers une séance déjà clôturée.

## Pièges connus

- Le store n'a **pas** de mécanisme de souscription : chaque écran qui affiche le timer doit tiquer lui-même (interval + `getActiveSession()` à chaque tick). Ne pas introduire de lib d'état pour ça.
- `timerTargetSeconds` peut être `null` (chrono libre) ou un nombre (compte à rebours, mode `'auto'`/`'manual'` avec négatif possible) — le bandeau doit gérer les deux, comme `TimerDisplay`.
- `resetActiveSession()` est appelé à la fin de séance — vérifier que le bandeau disparaît bien partout à ce moment.
- Ne pas casser le cas unilatéral (`currentSide`) dans le préremplissage.

## Critères d'acceptation

- [ ] Nouvelle série d'un exercice déjà pratiqué : le modal propose les valeurs de la même série de la dernière séance terminée.
- [ ] Exercice jamais pratiqué : le modal propose les objectifs (comportement d'avant).
- [ ] Terminer un exercice pendant le repos puis ouvrir un autre exercice : le repos reste visible (bandeau) et continue de décompter juste.
- [ ] Le bandeau apparaît aussi sur l'écran de séance, et disparaît à `finishSession`.
- [ ] Démarrer une série ailleurs remplace proprement le repos en cours.
- [ ] Bouton retour sur l'écran séance → pop-up Clôturer / Interrompre / Annuler ; « Clôturer » équivaut au bouton « Terminer ».
- [ ] Après « Interrompre », le bandeau de reprise est visible sur les autres écrans (calendrier, onglets…), affiche le chrono qui défile, et un tap ramène sur la séance avec un état intact.
- [ ] La croix masque le bandeau sans arrêter ni le timer ni la séance ; la séance reste reprenable depuis le calendrier.
- [ ] Le bandeau n'apparaît jamais pour une séance clôturée.

## Notes d'implémentation (état final)

> Contenu déplacé de `CLAUDE.md` pour garder ce dernier concis. Trois axes ci-dessus, plus deux ajustements suite aux retours de test sur device.

**Préremplissage du modal** (`SetPerformanceModal` depuis `[logId].tsx`) : priorité à la série précédente de **la séance en cours** (`getPrefillFromCurrentSession`), puis à la même série (sinon la dernière) de la dernière séance **terminée** (`getPrefillFromHistory` / `getPreviousPerfs(exerciseId, limit, excludeSessionId)` — exclut la séance en cours et filtre `finishedAt` non nul), puis fallback objectifs (comportement historique inchangé).

**Chrono de repos visible partout** : `GlobalRestBanner` (prop `excludeLogId`) monté sur l'écran séance et sur l'écran exercice ; store enrichi de `restForExerciseName`. Le chrono continue de tourner après « Terminer l'exercice ✓ » (plus de reset forcé à `idle`). Bandeau rouge si le temps est négatif (mode manuel).

**Piège corrigé dans `[logId].tsx`** : `load()` réclamait auparavant `activeExerciseLogId` pour cet écran dès son ouverture, même sans avoir démarré de série — ce qui écrasait le timer d'un autre exercice réellement actif. Résolu par un état local (`localNextSetNumber`/`localIsUnilateral`/`localCurrentSide`) utilisé tant que l'écran n'est pas l'exercice actif (`isActive`) ; le store global n'est réclamé qu'au moment de `handleCommencer`/`handleSelectPreset`. Les fonctions d'objectifs (`getTargetRestSeconds`, `getCurrentMesoSet`, `getPrefillFromHistory`…) prennent le `setNumber`/`side` en paramètre explicite plutôt que de lire le store — ne pas revenir à un `getActiveSession()` implicite dans ces helpers. (Résumé dans `CLAUDE.md` → « Pièges connus ».)

**Interruption de séance + bandeau de reprise** : bouton retour + `Alert` Clôturer/Interrompre/Annuler sur `[sessionId].tsx`. `ActiveSessionBanner` monté globalement (`app/_layout.tsx`, frère du `Stack`) : pilule flottante **déplaçable** (`PanResponder`, seuil de 3px pour distinguer tap et drag, position bornée à l'écran au relâchement) et semi-transparente (`rgba`), masquable (croix → `bannerDismissed`, remis à `false` au démarrage d'une nouvelle séance). `finishSession` appelle `resetActiveSession()` si c'est la séance active.

**État « en cours » du calendrier** (déduit, PAS persisté — `calendar_events.status` reste `planned|completed|skipped`) : `getEffectiveStatus(status, hasActiveSession)` dans `eventStatus.ts` affiche « En cours » (orange `#FF9500`) quand un `workout_session` non terminé existe pour un event `planned`. Appliqué sur les deux vues calendrier (`calendrier/[date].tsx`, `(tabs)/calendrier.tsx`) et le badge de statut méso ancré (`mesocycles/[id].tsx`). Le libellé du bouton (« Commencer »/« Poursuivre ») se base sur l'existence réelle d'une séance, pas sur le statut DB seul. `calendrier/[date].tsx` propose aussi « Terminer la séance » dans le menu d'une séance en cours.

**Bug de duplication corrigé** : le bouton de démarrage sur `mesocycles/[id]/sessions/[mesoSessionId].tsx` créait un nouveau `calendar_event` à chaque appui au lieu de réutiliser celui déjà synchronisé par l'ancrage (`syncMesoCalendarEvents`) → séances « en cours » fantômes qui s'accumulaient à chaque appui/ré-ancrage. Corrigé : réutilise l'event ancré s'il existe (résolution `mesoSessionId` déjà gérée par `startWorkoutSession({calendarEventId})`). Le bouton devient « Poursuivre cette séance » (orange) + « Terminer cette séance » (rouge) une fois une séance en cours détectée pour cette meso_session. En complément, `detachCalendarEventForMesoSession` (désancrage, `src/db/meso.ts`) supprime désormais les séances démarrées-mais-jamais-pratiquées (aucun `set_log`, via `hasLoggedSets`) au lieu de les préserver comme historique fantôme — l'historique réel (au moins une série loggée, ou séance terminée) reste conservé comme avant.
