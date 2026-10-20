# 01b — Superset : encodage différé des perfs, « À suivre », repos réel

> **Statut : ✅ implémenté (2026-10-20)** — typecheck + tests moteurs OK, **à valider sur device**. Évolution de l'écran superset (plan [01](01-superset-live.md), non modifié). Prompt d'origine : [01b-superset-encodage-differe-prompt.md](01b-superset-encodage-differe-prompt.md).

## Problème

En superset, l'utilisateur enchaîne des séries sans repos et ne veut pas s'interrompre pour encoder ses perfs après chacune. Mais le moteur `supersetSequence.ts` déduit l'étape suivante des `set_logs` enregistrés : une série terminée sans être encodée était considérée comme **pas faite**.

## Décisions

- **« Terminer série » crée tout de suite la ligne `set_logs`**, avec son temps d'exécution et le repos réel, marquée `is_pending`. L'encodage la **complète** ensuite. Le moteur n'a pas changé de principe, et rien n'est perdu (app tuée, retour arrière, changement d'écran).
- Toggle **« Encoder les perfs à la pause »**, activé par défaut, dans le bloc Réglages du superset :
  - activé, sans repos après l'étape : pas de modal ; en Auto la suite démarre (y compris entre deux exercices), en Manuel on attend « Commencer » ;
  - activé, avec un repos : le repos démarre et le **modal à onglets** s'ouvre avec toutes les séries à encoder ;
  - désactivé : le modal s'ouvre aussitôt sur la seule série terminée. Sans repos en Auto, la suite démarre à sa fermeture.
- **Séries à encoder** : orange dans les objectifs et dans « Séries de cette séance », avec au moins le temps d'exécution. Un tap ouvre le modal sur cet onglet ; le ⋮ garde le menu Modifier/Supprimer.
- **Garde-fous** (3 boutons) à « Terminer le superset ✓ » et à la fin de séance (bouton Terminer + croix du widget) : Encoder maintenant / Garder sans perfs / Retour. « Garder sans perfs » laisse les lignes marquées à encoder, complétables depuis Détails de séance.
- **« À suivre »** au-dessus de « Terminer série » : `fin du plan`, sinon `repos 1:30` / `repos`, sinon `Lateral raise — Droite (sans repos)`.
- **Repos réel** : `set_logs.rest_seconds` = temps entre le « Terminer » de l'étape précédente du superset et le « Commencer » de cette série. Superset uniquement (extension à l'écran exercice simple notée dans `CLAUDE.md`).

## Notes d'implémentation

- **Migration 0020** `set_logs.is_pending` (`integer DEFAULT false NOT NULL`, `when` = `1782700010000`). Diagramme ER mis à jour.
- **`src/db/session.ts`** :
  - `createPendingSetLog` ;
  - `completeSetLog` : écrit perfs + note, `isPending: false`, et **ne touche jamais** `executionSeconds`/`restSeconds`/`durationSeconds` ;
  - `countPendingSetLogs(sessionId)` ;
  - `updateSetLog` passe aussi `isPending: false` : toute édition par le modal vaut encodage, y compris depuis Détails.
- **Moteurs purs** :
  - `LoggedSet.isPending?` ; `SetState.status` et `ObjectiveRowData.status` gagnent `'pending'`. Une série complète dont une ligne est à encoder ne change pas le calcul de `next` ; une série unilatérale dont un seul côté existe reste `current`.
  - `peekStepAfter` (`supersetSequence.ts`) ajoute virtuellement la ligne de l'étape courante, puis rappelle `getNextStep`. Il renvoie `null` quand les deux plans sont connus et entièrement faits.
  - Tests ajoutés dans `test:progress` et `test:superset`.
- **`setPrefill.ts`** : les lignes `isPending` ne servent jamais de modèle de préremplissage.
- **Store** : `deferEncodingInSuperset` (défaut `true`), `lastStepEndedAt`, `restBeforeSeconds`.
  - Le repos réel est calculé au « Commencer », que ce soit le bouton, le démarrage auto en fin de repos ou le démarrage auto à la fermeture du modal. Il n'est calculé que si le même `activeSuperset` est actif.
  - Il est écrit dans la ligne au « Terminer ».
  - `finishSuperset` remet ces champs à `null`.
- **Formulaire** : `SetPerformanceForm.tsx` est extrait de `SetPerformanceModal`. Ce dernier devient la coquille `PerformanceSheet` + le formulaire, sans changement de rendu pour l'écran exercice et Détails.
- **`PendingSetsModal.tsx`** :
  - Les onglets sont construits depuis des **ids figés à l'ouverture**. Une série encodée garde ainsi son onglet, avec ✓ déduit de `row.isPending`.
  - Tous les formulaires restent montés (inactifs en `display: 'none'`), pour qu'un changement d'onglet n'efface pas la saisie.
  - « Valider et suivant » passe au prochain onglet non encodé, puis ferme le modal.
- **Écran superset** :
  - `handleTerminer` calcule le repos **avant** d'insérer la ligne, parce que `restAfterStep` raisonne sans l'étape courante.
  - `orderedPendingIds` ordonne les séries en attente selon l'ordre d'exécution (`getObjectiveRows`), côté de départ d'abord.
  - Le timer auto est suspendu tant qu'un modal est ouvert. « + Encoder … » reste la saisie manuelle d'une série complète (`saveSetLog`).
  - Le garde-fou « Encoder maintenant » ne termine le superset que s'il ne reste plus rien à encoder à la fermeture.
- **Écran exercice simple** : les lignes en attente s'affichent en orange. Un tap ouvre le modal en mode « compléter » : préremplissage calculé comme pour une nouvelle série, enregistrement via `updateSetLog`.
- **Écran séance** :
  - `finishWithPendingCheck` (`sessionExitFlow.ts`) gère le garde-fou de fin de séance.
  - Le widget n'a pas les données des séries : il navigue vers `/seance/<id>?encodePending=1`, qui ouvre le modal à onglets de toute la séance.
  - Ce modal se préremplit sans historique : séance en cours, puis plan.
  - La séance se termine à la fermeture du modal s'il ne reste plus rien à encoder.
- **Affichage** : `formatSetLine` ajoute `repos 1:32` et `à encoder`. Les copies locales de la fiche exercice et de l'écran exercice de programme ajoutent `non encodée`.

## Correctif — superset quitté en cours (2026-10-20)

- **Bandeau absent** : `GlobalRestBanner` n'existait que pendant un repos. Il affiche maintenant aussi « Superset en cours — série » (chrono d'exécution) et « Superset en cours — reprendre › » (aucune série lancée). Le tap ramène à l'écran superset.
- **Superset « en cours » dès l'ouverture** : `enterSuperset(a, b)` est appelé au chargement de l'écran superset, et plus seulement au premier « Commencer ». Un changement de paire remet le repos mesuré à zéro. `leaveSuperset()` est appelé à « Terminer le superset », et par `markExerciseDone` quand un des deux exercices est marqué fait, quel que soit l'écran.
- **Écran séance** :
  - un tap sur un exercice du superset en cours renvoie directement à l'écran superset, sans l'alerte « Superset prévu » ;
  - le groupe est titré « SUPERSET EN COURS » et encadré en bleu.
- **Limite connue** : l'état « en cours » vit dans le store en mémoire. Si l'app est tuée, on retombe sur l'alerte « Superset prévu » (les séries déjà faites restent, la séquence reprend où elle en était).

## Correctif — démarrage auto hors de l'écran (2026-10-20)

**Problème.** En mode Auto, la série ne démarrait pas à la fin du repos si l'on n'était pas sur l'écran exercice ou superset. Le cas valait aussi pour un exercice classique. La cause : le passage repos → série était fait par le `setInterval` de l'écran, qui est détruit quand on quitte l'écran.

**Ce qui a changé :**
- **Un seul minuteur global**, `useAutoStartTicker` (`src/utils/useSessionTimer.ts`), est monté dans `app/_layout.tsx`. Il appelle `tickAutoStart` (store) chaque seconde.
- **Les écrans publient la prochaine série** dans `autoNext`, sans la démarrer eux-mêmes.
  - Seul l'écran qui possède le chrono publie.
  - Il ne publie que si la série terminée est enregistrée : en superset, juste après « Terminer » ; en exercice classique, après « Valider » dans le modal.
  - Sinon `autoNext` vaut `null` : on ne relance pas la même série, et le chrono part en négatif comme en mode Manuel.
- **`useSuspendAutoStart`** bloque le démarrage pendant qu'un modal de saisie est ouvert.
- **Nettoyage des démarrages devenus sans objet** : « Terminer série » vide `autoNext` jusqu'à l'enregistrement. `leaveSuperset` efface une étape du superset terminé. `markExerciseDone` efface la série suivante d'un exercice terminé pendant son repos.
- **Repos réel** : en superset, il est calculé par `tickAutoStart` depuis `lastStepEndedAt`.
- **Limite connue** : app en arrière-plan, les minuteurs JS sont gelés. La série démarre au retour dans l'app, avec un chrono d'exécution qui part de ce moment. Le vrai chrono en arrière-plan est l'objet de la phase 13.

## Vérification

- `npx tsc --noEmit` : 0 erreur. `npm run test:progress`, `test:superset` et les autres scripts : verts.
- **Pas de device disponible** : checklist à dérouler par l'utilisateur.
  - [ ] 2 bilatéraux, « Entre chaque exercice », toggle activé : A Terminer → B démarre sans modal (Auto) ; B Terminer → repos + modal à 2 onglets ; « À suivre » correct à chaque étape.
  - [ ] « 1 fois sur 2 » + 2 unilatéraux sans repos entre côtés : 4 étapes enchaînées puis 4 onglets.
  - [ ] Fermer le modal après 1 onglet → 1 série verte, les autres orange avec leur temps d'exécution ; tap sur une orange → modal sur le bon onglet.
  - [ ] Taper une valeur, changer d'onglet, revenir → valeur conservée.
  - [ ] Toggle désactivé → modal immédiat après chaque série.
  - [ ] Tuer l'app en plein enchaînement → au retour, les séries terminées sont là (orange).
  - [ ] « Terminer le superset ✓ », puis « Terminer » la séance (bouton + croix du widget) avec des séries en attente → alerte, les 3 choix.
  - [ ] `repos 1:32` affiché dans la liste et dans Détails ; ~0 s en Auto sans repos.
  - [ ] Écran exercice simple et Détails : saisie et édition inchangées ; une série orange s'y complète.
