# 14 — Exercice live : basculer sur un exercice alternatif, changer de variante

> **Statut : ✅ implémenté et validé (2026-10-19)** — typecheck 0 erreur, `npm run test:swap` vert. Voir § Notes d'implémentation en fin de document. Décisions actées le 2026-10-18 (plan 13 d'abord, dont il réutilise `computeProgress`). Deux volets : changer d'**exercice** (§ Effet) et changer de **variante** de l'exercice en cours (§ Changer de variante, ajouté le 2026-10-18). La variante *des alternatives dans le plan* est **abandonnée** (voir fin du document).

## Problème

Machine prise, matériel absent… on veut faire un **exercice alternatif** à la place de celui prévu, sans perdre les objectifs de la séance. Aujourd'hui les alternatives sont listées (bloc « Infos exercice », amélioration 06) mais en **lecture seule** : un tap ouvre la fiche catalogue.

## Ce qui existe

- `exercise_logs.exercise_id` = exercice réellement fait ; `exercise_logs.meso_exercise_id` / `program_exercise_id` = ligne du plan (objectifs, alternatives, note). Les deux sont **indépendants** → on peut changer l'exercice sans toucher au lien vers le plan : les objectifs restent affichés.
- `getAlternativeExercises(ids)` (`src/db/session.ts`) et la liste `alternatives` déjà chargée dans `[logId].tsx`.
- `ExercisePicker` (déjà utilisé en Modal plein écran dans `app/seance/[sessionId].tsx` pour « Ajouter un exercice »).
- Tous les helpers d'objectifs indexent le plan **par numéro de série** (`mesoSets[setNumber - 1]`) : c'est ce qui permet de « reprendre à la série 3 » sans rien changer à ces helpers (voir § Effet).

## Décisions actées

- Deux déclencheurs : les chips d'alternatives **et** un picker libre (n'importe quel exercice).
- Séries déjà faites : elles restent sur l'exercice d'origine ; l'alternative **reprend le plan là où on en était** (série 3 si 2 séries faites).
- Le plan (méso/programme) **n'est pas modifié** : le changement ne vaut que pour cette séance.

## Déclencheurs

1. **Chip d'une alternative** (bloc Infos) → alerte :
   ```
   Développé haltères
   [Faire cet exercice]  [Voir la fiche]  [Annuler]
   ```
2. **Lien « Changer d'exercice… »** sous le nom de l'exercice → Modal `ExercisePicker`. `ExercisePicker` n'a pas de prop d'exclusion : ignorer l'exercice courant dans `onSelect` (même astuce que fix 06).

## Effet — helper `swapExerciseLog(logId, newExerciseId): Promise<string>` dans `src/db/session.ts`

Renvoie l'id du log à afficher.

- **0 série enregistrée** sur ce log → `UPDATE exercise_logs SET exercise_id = :new`. L'écran recharge : nom, images, historique, unité de poids et préremplissage suivent le nouvel exercice ; objectifs et note du plan restent.
- **≥ 1 série enregistrée** — exemple : plan Développé couché 4 séries, 2 faites, passage au Développé haltères :
  1. le log d'origine (couché) garde ses 2 séries et est marqué *fait* ;
  2. un **nouveau log** est créé pour les haltères : même `meso_exercise_id`/`program_exercise_id`/`superset_group_id`, `order` = original + 1 (les logs suivants sont décalés de +1) ;
  3. navigation `router.replace` vers le nouveau log.

**Reprise à la série 3** : le nouveau log enregistre ses séries **à partir du numéro 3** (3, 4…). Les objectifs du plan restent alignés tout seuls (`mesoSets[3 - 1]`), sans offset à gérer dans les helpers.

- `computeProgress` (plan 13) reçoit `startSetNumber = 3` : les lignes d'objectifs 1-2 s'affichent en vert avec la mention « fait — Développé couché », la 3 en bleu.
- `startSetNumber` est **déduit**, sans migration : on prend les logs de la même séance qui partagent la même ligne de plan et ont un `order` inférieur (la « chaîne » des remplacements). Le résultat vaut la plus haute série *complète* de cette chaîne + 1. Ça marche aussi pour une alternative d'alternative.
- Conséquence visible et assumée : dans l'historique des haltères et dans Détails, ces séries apparaissent « #3, #4 ». C'est fidèle à la séance (séries 3 et 4 du plan).

**Exercice libre** (ajouté en live, sans ligne de plan) : pas de chaîne déductible ni d'objectifs. Le nouveau log démarre à la série 1, sans mention « remplace ».

## Affichage

- Écran live, sous le nom : « remplace *Développé couché* ». C'est déduit, sans migration : `log.exerciseId !== (mesoExercise ?? programExercise).exerciseId`.
- Même mention sur la carte de l'écran séance et dans Détails de séance.
- Si l'exercice était **actif** (timer en cours) : mettre à jour `restForExerciseName` dans le store pour que le bandeau de repos affiche le bon nom.

## Marche à suivre

1. `src/db/session.ts` : `swapExerciseLog`, `getChainStartSetNumber(log)` (déduction de la chaîne).
2. `[logId].tsx` : alerte sur les chips, lien + Modal `ExercisePicker`, mention « remplace … », `startSetNumber` passé à `computeProgress`, mise à jour du store si actif.
3. `ObjectivesList` (plan 13) : lignes < `startSetNumber` affichées « fait — *exercice d'origine* ».
4. `app/seance/[sessionId].tsx` et `app/seance/details/[sessionId].tsx` : mention « remplace … » sur les cartes (`ExerciseLogEnriched` contient déjà `mesoExercise`/`programExercise`).

5. Volet variante : voir § Changer de variante (migration `exercise_logs.selected_variation`).

## Points d'attention

- Préremplissage : les objectifs de poids du plan concernent l'exercice d'origine (100 kg au couché ≠ haltères). Le préremplissage prend déjà en priorité l'historique **de l'exercice fait** (`getPrefillFromHistory`). Sans historique, il retombe sur l'objectif du plan : c'est acceptable, l'utilisateur corrige.
- Préremplissage « même numéro de série » dans l'historique : la série #3 des haltères ira chercher la #3 de la dernière séance d'haltères, puis la dernière disponible (comportement existant).
- Superset (plan 01) : changer un des deux exercices d'un superset garde le `superset_group_id` → le superset continue avec l'alternative.
- `renumberSetsAfterDelete` sur le nouveau log : supprimer sa série #3 doit renuméroter à partir de `startSetNumber`, sans redescendre à #1 ou #2. Ces numéros appartiennent au log d'origine.

## Vérification (device)

- Méso avec alternative, 0 série → « Faire cet exercice » → nom/historique changent, objectifs identiques ; Détails de séance affiche l'alternative avec « remplace … ».
- Même chose après 2 séries → l'original passe dans « Faits » avec ses 2 séries, l'alternative s'ouvre avec les séries 1-2 en vert « fait — Développé couché » et la 3 en bleu ; sa première série est enregistrée #3.
- Picker libre → n'importe quel exercice.

---

## Changer de variante de l'exercice en cours — ✅ acté

### Problème

En live, la variante est affichée en **lecture seule** dans le bloc Infos, et elle vient du **plan** (`mesoExercise.selectedVariation ?? programExercise.selectedVariation`). On veut pouvoir la changer pour la séance (prise neutre au lieu de pronation, version unilatérale…), sans toucher au plan, comme pour l'exercice alternatif.

Aucune colonne ne permet aujourd'hui de stocker « la variante réellement faite » : `exercise_logs` n'a pas de champ variante. Elle n'est donc pas non plus conservée dans l'historique.

### Migration — `exercise_logs.selected_variation`

```sql
ALTER TABLE `exercise_logs` ADD COLUMN `selected_variation` text;
```

Une seule instruction, nullable. `schema.ts` (`selectedVariation: text('selected_variation')` sur `exerciseLogs`), `migrations.js`, `_journal.json`, diagramme ER.

### Règles

- **Au démarrage de la séance** (`startWorkoutSession`) : on recopie la variante du plan dans `exercise_logs.selected_variation`. Le log porte ainsi la variante réellement faite, et un changement ultérieur du plan ne réécrit pas l'historique.
- **Variante effective** affichée et utilisée partout : un helper `getEffectiveVariation(enriched)` renvoie `log.selectedVariation`. Repli pour les logs créés avant la migration, qui valent `null` : variante du plan **si** `log.exerciseId` est l'exercice prévu, sinon aucune.
- **Changement d'exercice** (`swapExerciseLog`, plus haut) : la variante est remise à `null`. La variante du plan concerne l'exercice d'origine, pas l'alternative. On peut ensuite en choisir une pour l'alternative avec le même sélecteur.
- **Unilatéral (plan 13)** : la détection lit la **variante effective**. Choisir une variante qui contient « unilatéral » pré-règle le toggle pour la série suivante. Choisir une variante sans ce mot ne le décoche pas, la déduction depuis l'historique pouvant le justifier. Pendant une série à moitié faite, le toggle n'est pas touché (il est grisé).
- Le plan (méso/programme) **n'est pas modifié**.

### UI

- Sous le nom de l'exercice (donc visible même bloc Infos replié) : ligne **« Variante : prise neutre ✎ »**, ou « Variante : aucune ✎ ». Tap → Modal avec :
  - les chips des variantes du catalogue (`exercise.variations`) + « Aucune », la variante actuelle présélectionnée (même rendu que les chips de l'éditeur de méso) ;
  - **« + Nouvelle variante »** : champ texte, ajoute la valeur aux variantes du catalogue de l'exercice (`exercises.variations`, comme le fait déjà `ExerciceForm`) et la sélectionne. Ça évite de quitter la séance pour aller modifier la fiche.
- Le bloc Infos affiche la variante effective (au lieu de celle du plan).
- Écran séance (cartes), Détails de séance, et historique de l'écran live : la variante effective s'affiche à côté du nom quand elle existe (« Développé couché · prise neutre »), y compris pour les séances passées. C'est ce qui rend la variante utile après coup.
- Superset (plan 01) : la ligne Variante fait partie de `ExerciseInfoPanel`/de l'en-tête de chaque exercice, donc rien à refaire.

### Marche à suivre (volet variante)

1. Migration `exercise_logs.selected_variation`.
2. `src/db/session.ts` : recopie dans `startWorkoutSession` (branches méso **et** programme), `setExerciseLogVariation(logId, variation | null)`, reset à `null` dans `swapExerciseLog` (y compris pour le nouveau log créé quand des séries existent), `addVariationToExercise(exerciseId, value)` (dédoublonné).
3. `src/utils/exerciseVariation.ts` (ou dans `exerciseProgress.ts`) : `getEffectiveVariation`. `isUnilateralHint` (plan 13) l'utilise.
4. `[logId].tsx` : ligne Variante + Modal sélecteur.
5. Affichage de la variante effective : `app/seance/[sessionId].tsx`, `app/seance/details/[sessionId].tsx`, historique (`getPreviousPerfs` doit renvoyer `selectedVariation` du log, à ajouter au `PerfGroup`).

### Points d'attention

- Préremplissage depuis l'historique : il ne filtre **pas** par variante (la dernière séance en prise large préremplit une séance en prise neutre). C'est le comportement voulu pour l'instant : l'historique affiche maintenant la variante, l'utilisateur voit d'où vient la valeur.
- `exerciseMerge.ts` (fusion/suppression d'exercices) : rien à faire, la variante est du texte libre attaché au log.
- Export/import : les perfs ne sont pas exportées aujourd'hui ; à intégrer avec `set_logs.note` dans l'amélioration 3.

### Vérification (device)

- Séance méso dont la variante prévue est « prise neutre » → ligne « Variante : prise neutre » ; changer pour « unilatéral » → toggle Unilatéral pré-coché pour la série suivante ; le plan affiche toujours « prise neutre ».
- « + Nouvelle variante » → la valeur apparaît aussi dans la fiche catalogue de l'exercice.
- Changer d'exercice → variante remise à « aucune ».
- Détails de séance et historique de la séance suivante → la variante faite s'affiche.

---

## Abandonné — variante des alternatives dans le plan

Évalué le 2026-10-08 : stocker une variante par alternative dans le méso/programme demandait soit une nouvelle table (trop lourd : 12 fichiers à réécrire), soit une colonne JSON parallèle (≈ 15 fichiers, ripple export/import). **Abandonné le 2026-10-18** au profit du changement de variante en live ci-dessus : après avoir basculé sur une alternative, on lui choisit sa variante dans la séance.

---

## Notes d'implémentation

- **Migration 0019** : `exercise_logs.selected_variation`. Convention : `null` = non renseignée (log antérieur à la migration), **`''` = « Aucune » choisie explicitement**. Sans ce sentinel, choisir « Aucune » sur un log dont le plan a une variante la ferait réapparaître par le repli (écart assumé avec le plan, qui disait « remise à `null` » au changement d'exercice : on écrit `''`).
- **Helpers purs** `src/utils/exerciseSwap.ts` (`getEffectiveVariation`, `getChainInfo`/`getChainInfoFor`) + `scripts/testExerciseSwap.ts` (`npm run test:swap`). La chaîne donne `startSetNumber` (plus haute série *complète* de la chaîne + 1) **et** la liste des séries déjà faites avec l'exercice qui les a faites (alternative d'alternative : « fait — Développé couché » puis « fait — Haltères »).
- **DB** (`src/db/session.ts`) : `swapExerciseLog`, `setExerciseLogVariation`, `addVariationToExercise` ; `startWorkoutSession` recopie la variante du plan (méso et programme) ; `getSessionLive` expose `plannedExercise` (exercice prévu si différent de celui fait → mention « remplace … ») ; `PerfGroup.variation`.
- **Store** : `moveActiveExerciseLog` (`activeSessionStore.ts`) déplace l'exercice actif et ses réglages éphémères (repos choisi, ÷ 2, côté de départ) vers le nouveau log, et met à jour `restForExerciseName`.
- **Écran live** (révisé après essai) : la variante suit le nom, en plus petit : « Barbell Squat - pied largeur d'épaules ✎ » (tap → `src/components/live/VariationPickerModal.tsx`, avec « + Nouvelle variante » qui ajoute aussi la valeur à la fiche catalogue) ; « remplace … » en dessous. Un bloc **« Remplacer l'exercice »** (entre « Infos exercice » et « Objectifs ») porte les chips : alternatives du plan, exercice prévu « (prévu) » pour revenir en arrière (l'exercice en cours est exclu) et « Autre… » (Modal `ExercisePicker`). Une chip d'alternative → alerte *Faire cet exercice / Voir la fiche / Annuler*. Le bloc « Infos exercice » ne contient plus ni variante ni alternatives.
- **Objectifs / séries après un remplacement** (révisé après essai) : `ObjectivesList` reçoit `previousSets` ; les séries faites avec l'exercice remplacé gardent leurs objectifs (reps, RIR…) en vert avec ✓, **sans** mention « fait — », le nom de l'exercice fait en petit dessous ; ligne tronquée sur une ligne, un tap la déplie. « Séries de cette séance » liste aussi les séries des exercices remplacés (`ChainInfo.previousLogs`), regroupées sous leur nom, en lecture seule (modification via Détails de la séance).
- **Affichage** : variante effective et « remplace … » sur les cartes de l'écran séance, Détails, Modifier ; variante à côté de la date dans l'historique (écran live, fiche exercice, écran exercice de programme). Écran Modifier : l'ajout de série d'un log qui en remplace un reprend à `startSetNumber`.
- **Pas fait / à surveiller** : le préremplissage « série précédente de la séance » (`getPrefillFromCurrentSession`) ne regarde que le log courant, donc la première série d'une alternative ne reprend pas la série 2 de l'original (retombe sur l'historique puis le plan). Le libellé « n/N séries » de la carte compte les lignes du log courant seulement.
