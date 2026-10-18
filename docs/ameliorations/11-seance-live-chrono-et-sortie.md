# 11 — Séance live : chrono global + sortie de séance

> **Statut : ✅ implémenté et validé par l'utilisateur (2026-10-18)** — `tsc` à 0 erreur.
>
> **Notes d'implémentation (écarts et ajouts par rapport au plan) :**
> - Chrono de l'écran exercice posé via `headerRight` dans `app/_layout.tsx` (composant `src/components/SessionClock.tsx`) plutôt que `navigation.setOptions` : même rendu, l'écran exercice n'est pas touché.
> - Ré-hydratation (question 4) : `restoreOpenSession` dans `src/db/session.ts`, appelée au lancement depuis `app/_layout.tsx`.
> - Boutons « + Ajouter un exercice » et « Annuler la séance » dans un **pied de page fixe** sous la `ScrollView` (et non en bas de liste comme écrit au § D) : toujours visibles quelle que soit la longueur de la liste.
> - **Bug découvert après coup** : la croix du widget annule/termine sans navigation, donc les écrans déjà affichés (séance planifiée « Poursuivre / Terminer », calendrier, détail d'un méso) ne recevaient pas de nouveau focus et restaient périmés. Correctif : `finishSession` et `cancelWorkoutSession` appellent `notifySessionEnded()` (`activeSessionStore.ts`) ; les 4 écrans concernés s'abonnent via le hook `useReloadOnSessionEnded(load)` (`useSessionTimer.ts`).
> Décisions actées (2026-10-08) : Toutes les recommandations ci-dessous ont été validées.

Deux demandes regroupées parce qu'elles touchent les mêmes fichiers (`app/seance/[sessionId].tsx`, `src/components/ActiveSessionBanner.tsx`, `src/utils/activeSessionStore.ts`).

## Problème

1. **Pas de chrono global** : on ne sait pas depuis combien de temps la séance a commencé. Il faut l'afficher sur l'écran séance, sur les écrans exercice live, et dans le widget « Séance en cours » (`ActiveSessionBanner`).
2. **Sortie de séance trop lourde** : la flèche retour de l'écran séance ouvre une alerte *Retour / Interrompre / Annuler la séance…* (`handleBackPress`). On veut interrompre directement, sans alerte.
3. **La croix du widget** masque simplement le widget (`bannerDismissed: true`). On veut à la place une alerte *Annuler la séance / Terminer la séance / Retour*.

## Ce qui existe

- `workout_sessions.started_at` (ISO) est **déjà posé** par `startWorkoutSession` (`src/db/session.ts`) → aucune migration : le chrono global se calcule `Date.now() - Date.parse(startedAt)`.
- `TimerDisplay` (`src/components/TimerDisplay.tsx`) sait afficher un chrono qui monte (`targetSeconds={null}`) à partir d'un `startedAt: number`.
- La logique d'annulation (`confirmCancel` : 0 série → annulation directe, sinon confirmation avec le nombre de séries) et de fin (`handleFinish` → `finishSession`) vit aujourd'hui **dans** `app/seance/[sessionId].tsx`.
- Le bouton retour **matériel** Android sur l'écran séance fait déjà un simple `router.back()` (aucun `BackHandler`) : le nouveau comportement de la flèche s'aligne dessus.

## Proposition

### A. Chrono global

1. **Store** — ajouter `sessionStartedAt: number | null` à `ActiveSession` (`activeSessionStore.ts`), posé dans le `load()` de `app/seance/[sessionId].tsx` à partir de `data.session.startedAt` (en même temps que `sessionId`).
   > Pourquoi le store et pas une requête DB dans chaque écran ? Le widget est monté **une fois** dans `app/_layout.tsx` et se rafraîchit chaque seconde (`useActiveSessionTick`) : lire une variable en mémoire coûte zéro, une requête SQLite par seconde serait du gaspillage. La DB reste la source de vérité, le store n'en est qu'une copie.
2. **Écran séance** (`app/seance/[sessionId].tsx`) — sous le titre du header : `⏱ 42:13` (composant `TimerDisplay`, `targetSeconds={null}`).
3. **Écran exercice live** (`app/seance/exercice/[logId].tsx`) — dans le header natif via `navigation.setOptions({ headerRight })`, petit texte gris. *(Voir question 1.)*
4. **Widget** — `ActiveSessionBanner` affiche toujours `Séance · 42:13` ; le chrono de repos/exécution reste affiché à côté quand il tourne.
5. `TimerDisplay` affiche `m:ss` : au-delà d'une heure il faut `h:mm:ss` (`secondsToDisplay` à étendre — ne change rien pour les chronos de repos < 1 h).

### B. Flèche retour = interrompre

`handleBackPress` → `router.back()` direct, plus d'alerte. Le widget réapparaît sur les autres écrans (comportement « Interrompre » actuel).

### C. Croix du widget = alerte

```
Séance en cours
[Annuler la séance]  [Terminer la séance]  [Retour]
```

3 boutons : pile la limite Android (cf. `CLAUDE.md`).

- **Annuler la séance** → même logique que `confirmCancel` (0 série → annule directement, sinon 2ᵉ alerte de confirmation avec le nombre de séries).
- **Terminer la séance** → `finishSession(sessionId)` directement (l'alerte sert déjà de confirmation).
- **Retour** → ferme l'alerte, le widget reste.

**Factorisation** : extraire `confirmCancel` / `doFinish` dans un nouveau `src/utils/sessionExitFlow.ts` (`promptCancelSession(sessionId)`, `finishSessionNow(sessionId)`) — appelé à la fois par l'écran séance (bouton « Terminer ») et par le widget. Le widget n'a pas les `exerciseLogs` en mémoire : `promptCancelSession` compte les séries par une requête (`set_logs` ⋈ `exercise_logs` sur `workout_session_id`).

Le widget n'est plus masquable (✅ acté) : le champ `bannerDismissed` du store devient inutile → le supprimer (et sa remise à `false` dans `load()`).

### D. Bouton « Annuler la séance » sur l'écran séance — ✅ acté

La flèche n'ouvrant plus d'alerte, on ajoute un bouton **« Annuler la séance »** sur l'écran séance live, en bas de la liste, sous « + Ajouter un exercice » : texte rouge sans fond (action destructive mais rare, elle ne doit pas concurrencer « Terminer » dans le header). Il appelle `promptCancelSession(sessionId)` (même logique : 0 série → direct, sinon confirmation), puis `router.back()`.

## Questions (toutes tranchées : recommandations validées)

1. **Où afficher le chrono global sur l'écran exercice live ?** Reco : à droite du header natif (« Exercice ……… ⏱ 42:13 »), discret, ne prend pas de place dans le scroll. Alternative : sous le nom de l'exercice.
*(Q2 « annuler depuis l'écran séance » et Q3 « masquer le widget » : tranchées → bouton dédié (§ D), widget non masquable.)*
4. **Après un redémarrage de l'app** (app tuée par Android), le store est vide : le widget disparaît alors que la séance est toujours ouverte en DB (`finished_at IS NULL`). Hors périmètre demandé, mais c'est le bon moment : au lancement (`app/_layout.tsx`), chercher une séance non terminée **commencée il y a moins de 12 h** et ré-hydrater `sessionId` + `sessionStartedAt`. Reco : l'inclure (≈ 15 lignes), sinon le chrono global est perdu au premier kill.

## Marche à suivre

1. `activeSessionStore.ts` : `sessionStartedAt`, suppression de `bannerDismissed`.
2. `TimerDisplay.tsx` : format `h:mm:ss` au-delà de 3600 s.
3. `src/utils/sessionExitFlow.ts` (nouveau) : `promptCancelSession`, `finishSessionNow` (+ éventuellement `restoreOpenSession` si question 4 = oui, sinon dans `session.ts`).
4. `app/seance/[sessionId].tsx` : poser `sessionStartedAt`, chrono dans le header, `handleBackPress` → `router.back()`, `confirmCancel`/`doFinish` remplacés par les helpers, bouton « Annuler la séance » en bas de liste (§ D).
5. `ActiveSessionBanner.tsx` : chrono global + alerte sur la croix (`router` pour ne rien faire de plus : après annulation/fin, `resetActiveSession()` est déjà appelé par `cancelWorkoutSession`/`finishSession`, donc le widget disparaît tout seul au tick suivant).
6. `app/seance/exercice/[logId].tsx` : chrono global (selon question 1).

Pas de migration.

## Points d'attention

- **Terminer depuis le widget alors qu'un exercice est « en cours d'exécution »** : `finishSession` reset le store, le timer s'arrête. Pas de série perdue (une série n'existe qu'après « Valider » dans le modal).
- Le widget est monté hors de toute route (`_layout.tsx`) : `Alert.alert` y fonctionne, mais pas `useFocusEffect` — d'où la requête ponctuelle dans `promptCancelSession`.
- Le calendrier affiche « en cours » via `getEffectiveStatus` : après annulation/fin depuis le widget, l'écran calendrier se rafraîchit au prochain focus (pattern `useFocusEffect` déjà en place) — rien à faire.

## Vérification (device)

- Démarrer une séance → chrono à 0:00 sur l'écran séance, puis visible sur un exercice et dans le widget, mêmes valeurs à la seconde près.
- Flèche retour → aucune alerte, widget visible sur le calendrier.
- Bouton « Annuler la séance » en bas de l'écran séance → même comportement que depuis le widget, retour au calendrier.
- Croix du widget → *Retour* (rien ne change), *Terminer* (événement « terminé » au calendrier), *Annuler* avec 0 série (direct) puis avec ≥ 1 série (2ᵉ confirmation).
- Séance > 1 h → `1:02:03`.
- `npx tsc --noEmit` à 0 erreur.
