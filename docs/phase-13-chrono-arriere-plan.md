# Phase 13 — Chrono en arrière-plan (notification Android)

> Document d'implémentation destiné à l'agent qui réalisera la phase.
> ⚠️ Cette phase change le **workflow de développement** : elle nécessite un *development build* (`expo-dev-client`). L'app ne pourra plus être testée dans Expo Go pour cette fonctionnalité. À valider avec l'utilisateur avant de commencer si ce n'est pas déjà acté.

## Objectif

Quand l'utilisateur quitte l'app pendant une séance avec un timer en cours (repos ou exécution), le chrono reste visible dans une **notification Android persistante** avec un chronomètre qui défile.

**Hors scope (décision actée)** :
- La **bulle flottante** type app Horloge Samsung (overlay `SYSTEM_ALERT_WINDOW`) : coût/fragilité disproportionnés, pas d'équivalent iOS. Ne pas l'implémenter.
- **iOS Live Activities** : phase future éventuelle. Sur iOS, cette phase ne fait rien (le chrono reste correct au retour dans l'app, voir ci-dessous).

## Point de départ — ce qui marche déjà

Le timer (`src/utils/activeSessionStore.ts`) est basé sur des timestamps (`timerStartedAt = Date.now()`, recalcul à l'affichage). Il **survit déjà** à la mise en arrière-plan tant qu'Android ne tue pas le process : en revenant dans l'app, le temps affiché est juste. Cette phase ajoute uniquement la **visibilité** pendant l'arrière-plan.

## Étape 1 — Passage au development build

1. `npx expo install expo-dev-client`
2. Build : soit EAS (`eas build --profile development --platform android`), soit local (`npx expo run:android`, nécessite Android Studio + SDK). Choisir selon l'environnement de l'utilisateur (lui demander si aucun `eas.json` n'existe).
3. Vérifier que l'app existante tourne à l'identique dans le dev build (SQLite, migrations, export/import) avant de toucher aux notifications.
4. Documenter dans `CLAUDE.md` la nouvelle commande de lancement.

## Étape 2 — Notification chronometer avec notifee

Librairie : `@notifee/react-native` (supporte Expo via prebuild ; vérifier la compatibilité SDK 54 / RN 0.81 au moment de l'implémentation — si problème, alternative : module expo-notifications + mises à jour périodiques, dégradé).

Comportement cible :

- Au passage `timerPhase → 'rest'` ou `'execution'` **pendant une séance active** : créer/mettre à jour une notification :
  - `android.asForegroundService: true` (le chrono doit survivre à l'éviction de l'app) ;
  - chronomètre natif : `android: { showChronometer: true, timestamp: timerStartedAt }` — pour un **compte à rebours** (repos avec `timerTargetSeconds`), utiliser `chronometerDirection: 'down'` avec `timestamp = timerStartedAt + timerTargetSeconds * 1000` ;
  - titre : nom de l'exercice + phase (« Repos — Développé couché ») ;
  - `pressAction` qui ré-ouvre l'app sur l'écran exercice actif ;
  - notification non-balayable (`ongoing: true`).
- Au passage `timerPhase → 'idle'` ou à `resetActiveSession()` (fin de séance) : arrêter le service / annuler la notification.
- Brancher ces transitions **dans le store** (`setActiveSession` / `resetActiveSession`) plutôt que dans chaque écran, via un petit module `src/utils/timerNotification.ts` appelé par le store. Garder ce module **importé dynamiquement ou neutralisé sur iOS/web** (no-op) pour ne rien casser ailleurs.
- Enregistrer le foreground service notifee (`notifee.registerForegroundService`) dans l'entrée de l'app (`app/_layout.tsx` ou index).

## Étape 3 — Permissions et manifest

- Android 13+ : permission runtime `POST_NOTIFICATIONS` — la demander au premier démarrage de séance (pas au lancement de l'app), gérer le refus silencieusement (le timer in-app marche toujours).
- Foreground service : notifee gère la déclaration, mais vérifier `foregroundServiceType` requis par l'API level cible (Android 14+ exige un type, p.ex. `specialUse` ou `shortService` — consulter la doc notifee à jour).
- Tester le comportement avec l'optimisation batterie Samsung (l'appareil de l'utilisateur est un Samsung) : app mise en veille profonde = service tué ; documenter la limite, ne pas tenter de la contourner.

## Pièges connus

- **Ne jamais faire tiquer la notification depuis JS** (pas de `setInterval` qui met à jour la notif chaque seconde) : c'est le chronomètre natif qui défile, JS ne met à jour la notification qu'aux **transitions** de phase.
- Le mode `'manual'` du timer continue en négatif après 0 ; `chronometerDirection: 'down'` s'arrête visuellement à 0 — acceptable, ne pas sur-ingénierer.
- Expo Go ne charge pas les modules natifs tiers : tout import statique de notifee dans du code exécuté par Expo Go planterait. Isoler l'import (dynamique + try/catch, ou `Platform`-guard + dev-client check) tant que l'utilisateur utilise encore Expo Go pour le reste.
- Après cette phase, toute nouvelle lib native suit le même chemin (rebuild du dev client requis).

## Critères d'acceptation

- [ ] Pendant un repos, mettre l'app en arrière-plan → notification avec compte à rebours qui défile, sans lag.
- [ ] Taper la notification ré-ouvre l'app sur l'exercice en cours.
- [ ] Fin de séance (ou annulation du timer) → notification disparaît.
- [ ] Refuser la permission notifications ne casse rien in-app.
- [ ] Sur iOS, aucune régression (pas de notification, pas de crash).
- [ ] `CLAUDE.md` mis à jour : workflow dev build + section timer complétée.
