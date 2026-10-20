# Prompt — 01b : superset, encodage différé des perfs + « À suivre » + repos réel

> Prompt d'implémentation à donner tel quel à une nouvelle session Claude Code. Le plan 01 est **déjà implémenté** : ce document ne le remplace pas, il décrit une évolution de l'écran superset. Décisions actées avec l'utilisateur le 2026-10-20.

---

Tu travailles sur `muscu-app` (React Native / Expo, SQLite + Drizzle). L'écran superset (`app/seance/superset.tsx`, amélioration 01) est implémenté et en test sur device. On corrige un problème d'usage : **l'utilisateur enchaîne des séries sans repos et ne veut pas s'interrompre pour encoder ses perfs**. On veut aussi afficher ce qui l'attend après sa série et mesurer le vrai temps de repos.

## À lire avant de commencer

1. `CLAUDE.md`, en entier. Notamment la règle des migrations manuelles, le piège `--> statement-breakpoint`, les 3 boutons max par `Alert` Android, le typecheck à 0 erreur, l'interdiction de tester via `expo start --web`, et la section « Pédagogie » : explique ce que tu fais à l'utilisateur, il débute en React.
2. `docs/ameliorations/01-superset-live.md`, surtout les § Notes d'implémentation. **Ne modifie pas ce fichier.**
3. Le code : `app/seance/superset.tsx`, `src/utils/supersetSequence.ts`, `src/utils/exerciseProgress.ts`, `src/utils/setPrefill.ts`, `src/components/SetPerformanceModal.tsx`, `src/components/live/SetLogList.tsx`, `src/components/live/ObjectivesList.tsx`, `src/components/live/SupersetSettings.tsx`, `src/utils/activeSessionStore.ts`, `src/db/session.ts`, `src/utils/sessionExitFlow.ts`, `src/utils/formatSetLine.ts`, `app/seance/exercice/[logId].tsx`, `app/seance/details/[sessionId].tsx` et `.../modifier.tsx`.

## Le problème, et pourquoi il faut une trace en base

Aujourd'hui, « Terminer série » ouvre le modal de saisie. La série n'existe en base (`set_logs`) qu'après « Valider ». Or le moteur `supersetSequence.ts` **déduit** l'étape suivante des `set_logs` enregistrés : il ne tient aucun compteur. Une série terminée mais pas encore encodée serait donc considérée comme **pas faite**, et le moteur la reproposerait.

**Décision** : « Terminer série » **crée immédiatement** la ligne `set_logs` avec son temps d'exécution, marquée « à encoder ». L'encodage **complète** ensuite cette ligne. Le moteur de séquence n'a pas à changer de principe : la ligne existe, l'étape compte comme faite. Rien n'est perdu si l'app est tuée, si l'utilisateur fait retour ou s'il change d'écran.

## Décisions actées

1. **Toggle « Encoder les perfs à la pause »** dans le bloc Réglages du superset (`SupersetSettings`, section globale, sous le toggle Repos). **Activé par défaut**, éphémère (store, comme les autres réglages du superset).
2. **« Terminer série »** crée toujours la ligne en attente. Ensuite :
   - **toggle activé, pas de repos après cette étape** : pas de modal. En mode Auto, l'étape suivante démarre aussitôt, y compris entre deux exercices différents (décision : on démarre quand même, le trajet est compté dans l'exécution suivante). En mode Manuel, le bouton « Commencer Lateral raise (Droite) » s'affiche ;
   - **toggle activé, un repos suit** : le repos démarre et le **modal à onglets** s'ouvre avec **toutes** les séries en attente du superset ;
   - **toggle désactivé** : le modal à onglets s'ouvre aussitôt sur la seule série qui vient d'être terminée (équivalent du comportement actuel). En Auto sans repos, l'étape suivante démarre à la fermeture du modal, comme aujourd'hui.
3. **Modal à onglets** : un onglet par série en attente, dans l'ordre d'exécution (ex. `Lateral raise · S2 G`, `Lateral raise · S2 D`, `Développé · S2`). Chaque onglet est un formulaire de saisie complet. « Valider » enregistre l'onglet courant et passe au suivant non encodé ; le modal se ferme quand tout est encodé. Un onglet encodé affiche ✓.
4. **Fermer le modal en cours de route** ne perd rien : les séries non encodées restent en attente. Elles apparaissent dans le bloc « Séries de cette séance » avec **au minimum leur temps d'exécution**. Les modifications de séries encodées passent par ce bloc, comme aujourd'hui (menu Modifier/Supprimer).
5. **État « à encoder » visible** dans les objectifs et dans la liste des séries : vert = encodée, **orange = faite mais à encoder**, bleu = en cours. **Un tap sur une série orange ouvre le modal à onglets** sur cet onglet (avec les autres séries en attente du superset).
6. **Garde-fou** : à « Terminer le superset ✓ » et à la fin de séance (bouton « Terminer » de l'écran séance, croix du widget), s'il reste des séries en attente, afficher une alerte « N séries à encoder », avec 3 boutons max : **Encoder maintenant** / **Garder sans perfs** / **Retour**. « Garder sans perfs » laisse les lignes telles quelles (toujours marquées à encoder, complétables plus tard depuis Détails de séance) et poursuit la fin.
7. **« À suivre »** affiché **au-dessus du bouton « Terminer série »** pendant l'exécution :
   - `À suivre : repos 1:30` (compte à rebours prévu) ;
   - `À suivre : repos` (repos en chrono libre, sans durée prévue) ;
   - `À suivre : Lateral raise — Droite (sans repos)` ;
   - `À suivre : fin du plan` quand l'étape terminée est la dernière prévue des deux exercices. Les manches hors plan restent possibles.
8. **Repos réel mesuré** : `set_logs.rest_seconds` (colonne existante, jamais remplie jusqu'ici) = temps réel écoulé entre le « Terminer » de l'étape précédente du superset et le « Commencer » de cette série. Il vaut `null` pour la première étape du superset ou si l'information a été perdue (app tuée). Dans l'écran superset uniquement pour l'instant ; l'extension à l'écran exercice simple est notée dans `CLAUDE.md` pour plus tard.

## Marche à suivre

### 1. Migration — `set_logs.is_pending`

```sql
ALTER TABLE `set_logs` ADD COLUMN `is_pending` integer DEFAULT false NOT NULL;
```

- Prochain numéro : **0020**, `when` strictement supérieur à `1782700009000`. Une seule instruction, donc pas de breakpoint.
- `schema.ts` : `isPending: integer('is_pending', { mode: 'boolean' }).notNull().default(false)` sur `setLogs`.
- `migrations.js`, `meta/_journal.json`, tableau « Migrations appliquées » de `CLAUDE.md`, diagramme ER `docs/schema-diagramme.md` (comparer champ par champ).

### 2. Couche DB — `src/db/session.ts`

- `createPendingSetLog(exerciseLogId, setNumber, side, executionSeconds, restSeconds): Promise<string>` : perfs à `null`, `isPending: true`.
- `completeSetLog(id, data)` : écrit les perfs + note, `isPending: false`, et **conserve** `executionSeconds`/`restSeconds`/`durationSeconds` de la ligne. Le modal les envoie à `null` : même piège que `handleSaveEdit`, déjà corrigé au plan 12.
- `updateSetLog` : passer aussi `isPending: false`. Toute édition par le modal, y compris depuis Détails de séance, vaut encodage.
- `countPendingSetLogs(workoutSessionId)` pour les garde-fous.
- `saveSetLog` (saisie manuelle « + Encoder la série N » du plan 12) reste inchangé : il crée une ligne déjà complète.

### 3. Moteurs purs + tests

- `exerciseProgress.ts` : `LoggedSet` gagne `isPending?: boolean`. Une série dont **toutes** les lignes existent compte toujours comme faite pour l'avancement, mais `SetState.status` gagne la valeur **`'pending'`** : la série est faite et au moins une de ses lignes est à encoder. Le calcul de `next` est inchangé, une série en attente n'est pas « à refaire ».
- `supersetSequence.ts` : même ajout dans `ObjectiveRowData.status` (`getObjectiveRows`). Nouveau helper pur `peekStepAfter(a, b, mode, current: { exercise, setNumber, side })`. Il ajoute virtuellement la ligne de l'étape courante à son exercice, puis rappelle `getNextStep`. Il renvoie l'étape suivante, ou `null` si plus rien n'est prévu au plan, pour le texte « À suivre ». Le repos qui suit l'étape courante est déjà donné par `restAfterStep`.
- `setPrefill.ts` : `getPrefillFromHistory` et `getPrefillFromCurrentSession` **ignorent les lignes `isPending`**, sinon on préremplirait avec du vide.
- Tests : `npm run test:progress` et `npm run test:superset` à compléter. Cas à couvrir : état `pending`, unilatéral avec un côté en attente, `peekStepAfter` dans les 4 cas de latéralité, fin de plan.

### 4. Store — `activeSessionStore.ts`

- `deferEncodingInSuperset: boolean` (défaut `true`).
- `lastStepEndedAt: number | null` : `Date.now()` au « Terminer » d'une étape de superset ; remis à `null` à « Terminer le superset ✓ » et au `resetActiveSession`.
- `restBeforeSeconds: number | null` : calculé au « Commencer » (`round((now - lastStepEndedAt) / 1000)` si `lastStepEndedAt` n'est pas nul et que le même `activeSuperset` est actif), puis consommé au « Terminer » suivant.

### 5. Formulaire de saisie réutilisable

`SetPerformanceModal` contient aujourd'hui l'état du formulaire **et** la coquille du modal. Extrais `src/components/SetPerformanceForm.tsx` (champs + état + bouton Valider, mêmes props de préremplissage) et fais de `SetPerformanceModal` une simple coquille qui l'utilise. **Le rendu et le comportement actuels de l'écran exercice simple et de Détails ne doivent pas changer**, y compris `Keyboard.dismiss` à l'ouverture (plan 12) et la note par série.

### 6. Modal à onglets — `src/components/live/PendingSetsModal.tsx` (nouveau)

- Props : la liste ordonnée des lignes en attente, avec pour chacune l'exercice (nom, unité, `ExerciseLogEnriched` pour le préremplissage via `computePrefill`), le numéro de série, le côté et le temps d'exécution. Plus l'onglet initial, `onComplete(rowId, data)` et `onClose`.
- Barre d'onglets horizontale, défilable si nécessaire. Onglet actif en bleu, encodé avec ✓, en attente en orange.
- **Garder tous les formulaires montés** et masquer les inactifs (`display: 'none'`). Explique ce cas d'école à l'utilisateur : démonter un composant React efface son état local, donc changer d'onglet effacerait ce qui a déjà été tapé. Les garder montés conserve la saisie.
- En tête de chaque onglet, le temps d'exécution en lecture seule (« Exécution : 0:42 »).
- Bouton « Valider » : `onComplete`, puis passage à l'onglet suivant non encodé ; fermeture quand il n'en reste plus.

### 7. Écran superset — `app/seance/superset.tsx`

- `handleTerminer` :
  1. calcule `executionSeconds` ;
  2. appelle `createPendingSetLog(...)` avec `restSeconds = st.restBeforeSeconds` ;
  3. pose `lastStepEndedAt` ;
  4. recharge l'exercice concerné ;
  5. calcule le repos de l'étape terminée (`restAfterStep`) ;
  6. applique la décision n° 2. L'auto-démarrage sans repos se fait **ici**, plus à la validation du modal, quand le toggle est activé.
- `handleSaveNew` disparaît au profit de `onComplete` → `completeSetLog`. `lastExecutionSeconds` n'est plus nécessaire pour le superset, puisque le temps est écrit dès « Terminer ». Garde-le si l'écran exercice simple s'en sert encore.
- Texte « À suivre » au-dessus du bouton « Terminer série » (`peekStepAfter` + `restAfterStep`), en petit, gris foncé.
- Toggle « Encoder les perfs à la pause » dans `SupersetSettings` et dans le résumé du bloc replié.
- `SetLogList` et `ObjectivesList` : état orange. Pour une ligne en attente, `formatSetLine` affiche ce qui existe (`0:42 exec.`) suivi de « à encoder ». Un tap ouvre `PendingSetsModal` sur cet onglet. Le menu Modifier/Supprimer reste disponible pour les lignes encodées ; Supprimer reste possible sur une ligne en attente, par exemple via le menu ⋮.
- `handleFinishSuperset` : garde-fou de la décision n° 6. « Encoder maintenant » ouvre `PendingSetsModal`.
- `formatSetLine` : afficher le repos réel quand il existe (`repos 1:32`), dans les listes live, l'historique et Détails.

### 8. Ailleurs

- **Écran exercice simple** (`[logId].tsx`) : des lignes en attente peuvent y apparaître (superset quitté, puis exercice ouvert seul). Les afficher en orange ; un tap ouvre le modal simple en mode « compléter » (`completeSetLog`).
- **Écran séance + widget** : garde-fou à la fin de séance (`sessionExitFlow.ts` / bouton « Terminer » de `app/seance/[sessionId].tsx`), avec `countPendingSetLogs`. « Encoder maintenant » depuis l'écran séance ouvre `PendingSetsModal` avec toutes les lignes en attente de la séance (`getSessionLive` fournit les `ExerciseLogEnriched` nécessaires au préremplissage). Depuis le widget, qui n'a pas ces données, naviguer vers l'écran séance avec un paramètre (ex. `?encodePending=1`) qui ouvre ce modal. Alertes : 3 boutons max.
- **Détails de séance** : lignes en attente affichées « à encoder » ; l'édition existante les complète (`updateSetLog` → `isPending: false`).
- **Historique et fiche exercice** (`getPreviousPerfs`) : afficher les lignes en attente telles quelles (« 0:42 exec. · non encodée »), sans les masquer.

### 9. Documentation

- Crée `docs/ameliorations/01b-superset-encodage-differe.md` (Problème → Décisions → Implémentation → Notes d'implémentation → Vérification), à partir de ce prompt et de ce que tu as réellement fait. **Ne touche pas à `01-superset-live.md`.**
- `docs/ameliorations/README.md` : ligne 01b dans le tableau d'état.
- `CLAUDE.md` : section « Séance live : superset » (1 à 3 phrases sur l'encodage différé, `is_pending`, `PendingSetsModal`, `rest_seconds`), arborescence (`SetPerformanceForm`, `PendingSetsModal`), migration 0020, prochain `when`. Vérifie que la note « `rest_seconds` hors superset à faire » (déjà ajoutée) est toujours exacte.

## Points d'attention

- **Ne jamais écraser `executionSeconds`/`restSeconds`** en complétant ou en modifiant une ligne : le modal ne les connaît pas.
- Une ligne en attente compte comme faite pour la séquence. Si l'utilisateur la **supprime**, l'étape redevient à faire et il faut renuméroter (`renumberSetsAfterDelete`, comme aujourd'hui).
- Unilatéral : chaque côté est une ligne, donc un onglet, et a sa propre note.
- Changer le toggle en cours de route : la décision s'applique au prochain « Terminer ». Les lignes déjà en attente restent dans la file.
- Lecture du store : les helpers prennent `setNumber`/`side` en paramètre explicite (piège documenté dans `CLAUDE.md`).

## Vérification

- `npx tsc --noEmit` à 0 erreur ; `npm run test:progress` et `npm run test:superset` verts (+ les autres scripts de test existants).
- Aucun device disponible pour toi : dis-le explicitement et fournis à l'utilisateur la checklist device suivante :
  - Superset 2 bilatéraux, « Entre chaque exercice », toggle activé : A Terminer → B démarre sans modal (Auto) ; B Terminer → repos + modal à onglets (2 onglets) ; « À suivre » correct à chaque étape.
  - « 1 fois sur 2 » + 2 unilatéraux sans repos entre côtés : 4 étapes enchaînées puis 4 onglets.
  - Fermer le modal après 1 onglet → 1 série verte, les autres orange avec leur temps d'exécution ; tap sur une orange → modal sur le bon onglet.
  - Changer d'onglet après avoir tapé une valeur → valeur conservée au retour.
  - Toggle désactivé → modal immédiat après chaque série, comme avant.
  - Tuer l'app en plein enchaînement → au retour, les séries terminées sont là (orange).
  - « Terminer le superset ✓ » puis « Terminer » la séance avec des séries en attente → alerte, les 3 choix.
  - `rest_seconds` : repos réel affiché (`repos 1:32`) dans la liste et dans Détails ; vaut ~0 en Auto sans repos.
  - Écran exercice simple et Détails : saisie et édition inchangées.
