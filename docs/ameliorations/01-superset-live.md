# 01 — Superset : suivi en séance live

> **Statut : ✅ implémenté (2026-10-19), à valider sur device** — voir § Notes d'implémentation en fin de document. Décisions actées le 2026-10-18.
>
> **Prérequis : plans 12, 13 et 14** (moteur d'avancement `computeProgress`, composants `ObjectivesList`/`SetLogList`, détection unilatérale, réglage du côté de départ). Le superset les réutilise tels quels.

## Problème

Les supersets existent dans le **plan** (`supersetGroupId` partagé sur `meso_exercises`/`program_exercises`, recopié sur `exercise_logs` au démarrage) et l'écran séance les **encadre** en orange (« SUPERSET »). Mais en live, chaque exercice s'ouvre séparément : impossible d'enchaîner A → B → repos → A → B avec un seul chrono, et le repos se déclenche après chaque exercice.

## Ce qui existe

- `app/seance/[sessionId].tsx` : `groupExercises()` regroupe les cartes par `supersetGroupId`.
- `app/seance/exercice/[logId].tsx` : tout l'écran exercice (objectifs, timer, saisie, historique) — un seul exercice, un seul `activeExerciseLogId` dans le store.
- `getPreviousPerfs(exerciseId)` : historique d'**un** exercice.

## Proposition

### 1. Lancer un superset depuis l'écran séance

**Superset prévu** — tap sur une carte d'un groupe superset (les deux exercices non faits) :

```
Superset prévu
Développé couché × Tirage horizontal
[Faire le superset]  [Exercice seul]  [Annuler]
```

**Superset improvisé** — bouton toggle **« ⇄ Superset »** au-dessus de la liste « À faire ». Mode sélection : les cartes affichent une case, on en coche **deux**, puis on enchaîne sur la même question.

**Dans les deux cas** :

```
Par quel exercice commencer ?
[Développé couché]  [Tirage horizontal]  [Annuler]
```

→ navigation vers `app/seance/superset.tsx?a=<logId premier>&b=<logId second>`.

Le superset improvisé est **mémorisé sur la séance** : `UPDATE exercise_logs SET superset_group_id = <nouvel uuid>` sur les deux logs (helper `pairExerciseLogs(logA, logB)` dans `src/db/session.ts`) → les deux cartes s'encadrent en orange, comme un superset prévu. Le plan (méso/programme) n'est pas modifié.

### 2. Écran superset — `app/seance/superset.tsx` (nouveau)

De haut en bas :

1. **Titre** « Superset Développé couché × Tirage horizontal », puis deux volets repliés « Infos Développé couché ▸ » / « Infos Tirage horizontal ▸ » (composant `ExerciseInfoPanel` extrait du bloc Infos actuel de `[logId].tsx`).
2. **Objectifs dans l'ordre d'exécution** : A·S1, B·S1, A·S2, B·S2… — même code couleur que le plan 13 (vert fait, bleu en cours), chaque ligne préfixée du nom court de l'exercice.
3. **Bloc « Réglages du superset »** (§ 4) : repos global + réglages par exercice (Unilatéral, repos entre les côtés, ÷ 2).
4. **Bloc série en cours** identique à l'écran exercice : « Tirage horizontal · Série 2 (Gauche) », Commencer / Terminer, mode Auto/Manuel, picker de repos. Les toggles Unilatéral/÷ 2 n'y sont **pas** : ils vivent dans le bloc Réglages.
5. **Séries de cette séance** des deux exercices, entrelacées dans l'ordre d'exécution (menu Modifier/Supprimer du plan 12).
6. **Historique chronologique** : les dernières séances où A **ou** B a été fait, fusionnées par séance, triées par date décroissante ; dans une même séance, A puis B.
7. Bouton **« Terminer le superset ✓ »** → marque les deux exercices faits.

### 3. Moteur de séquence — `src/utils/supersetSequence.ts` (nouveau, pur, testé sous Node)

Construit la liste ordonnée des **étapes** à partir des deux exercices (nb de séries prévues, unilatéral ou non, ordre choisi), chaque étape portant un drapeau `restAfter` calculé selon le mode de repos (§ 4) ; la prochaine étape = la première dont la série/le côté n'est pas encore enregistré (même principe « dérivé de la DB » que `computeProgress`, plan 13). Conséquence : on peut quitter l'écran en plein superset et y revenir, il reprend exactement où on en était.

**Unilatéral dans un superset** — ✅ acté : au lancement du superset, chaque exercice reçoit la détection du plan 13 (variante contenant « unilatéral » ou dernière séance faite côté par côté) → toggle **Unilatéral** de chaque exercice pré-réglé dans le bloc Réglages (§ 4). Comme sur l'écran simple, le mode est porté par chaque série : une série est enregistrée unilatérale si le toggle de son exercice est activé **quand on la commence**.

Ordre des étapes — ✅ acté : **exercice par exercice, en commençant par le côté de départ réglé dans les Paramètres** (Gauche par défaut, plan 13 § F). Avec A = premier exercice choisi et côté de départ = G :

| Cas (pour la série n) | Une « manche » |
|---|---|
| 2 bilatéraux | A → B |
| 2 unilatéraux | A-G → A-D → B-G → B-D |
| A unilatéral + B bilatéral | A-G → A-D → B |
| A bilatéral + B unilatéral | A → B-G → B-D |

(Côté de départ = D : on inverse G et D partout.) Comme le mode peut changer d'une série à l'autre, la manche est calculée **à chaque étape** à partir de l'état des toggles et des séries déjà enregistrées : une série à moitié faite reprend toujours sur le côté manquant.

Nombre de séries différent (A : 3, B : 4) : la manche 4 ne contient que B. Au-delà du plan des deux : manches supplémentaires « hors plan », comme en plan 13.

### 4. Bloc « Réglages du superset » — repos et unilatéral — ✅ acté

Tous les réglages qui décident **où tombent les repos** sont regroupés dans un bloc dédié de l'écran superset, pour que ce soit clair et réglable à tout moment. Structure (décision de l'utilisateur) :

```
Réglages du superset ▾
  Repos              [ Entre chaque exercice | 1 fois sur 2 ]     ← global
  ─ Développé couché ─────────────────────────────
    Unilatéral                              ○
  ─ Tirage horizontal ────────────────────────────
    Unilatéral                              ●
      Repos entre chaque côté               ●     ← visible si Unilatéral
        Diviser le repos par 2              ○     ← visible si Repos entre chaque côté
```

| Réglage | Portée | Valeur par défaut | Effet |
|---|---|---|---|
| **Repos** : « Entre chaque exercice » / « 1 fois sur 2 » | global | **Entre chaque exercice** | *Entre chaque exercice* : repos après A (après son dernier côté) **et** après B, chacun de la durée prévue de l'exercice qui vient d'être fait. *1 fois sur 2* : repos seulement en fin de manche (après B), de durée **max** des repos prévus des deux exercices pour cette série (un plan typique met 0 s sur A et 1:30 sur B → 1:30 quel que soit l'ordre choisi). |
| **Unilatéral** | par exercice | détection du plan 13 (variante « unilatéral » ou dernière séance côté par côté) | La série de cet exercice est faite côté par côté (côté de départ des Paramètres). |
| **Repos entre chaque côté** | par exercice, si Unilatéral | **activé** *(choix par défaut proposé : même comportement que l'écran exercice simple, où il y a toujours un repos entre les côtés)* | Repos entre les deux côtés de cet exercice, de la durée prévue de l'exercice. Désactivé : les deux côtés s'enchaînent. |
| **Diviser le repos par 2** | par exercice, si Repos entre chaque côté | désactivé | **Tous** les repos de cet exercice durent la moitié du repos prévu, à chaque fois : le repos entre ses côtés **et** le repos qui le suit (réglage global). En « 1 fois sur 2 », le repos de fin de manche = max des repos des deux exercices, chacun déjà divisé par 2 si son ÷ 2 est activé. |

Exemple, 2 exercices unilatéraux (côté de départ G), « Entre chaque exercice », A avec repos entre côtés ÷ 2, B sans repos entre côtés :

```
A-G → repos A/2 → A-D → repos A/2 → B-G → B-D → repos B → (manche suivante)
```

Même chose en « 1 fois sur 2 » : `A-G → repos A/2 → A-D → B-G → B-D → repos max(A/2, B)`.

Règles communes :
- **Sans repos** : après « Valider » dans le modal, en mode Auto l'étape suivante démarre aussitôt ; en mode Manuel, bouton « Commencer Tirage horizontal (Gauche) ».
- **Durée prévue** d'un exercice = repos modifié par le picker pour cet exercice (plan 13, `restOverrideByLog`) sinon objectif de la série en cours, sinon aucun (chrono qui monte, comme l'écran simple sans objectif). Le picker pendant un repos modifie le compte à rebours en cours et devient la durée de l'exercice auquel ce repos appartient.
- **Changements en cours de route** : tout réglage s'applique à partir de la prochaine étape. Seule exception, le toggle Unilatéral d'un exercice est grisé pendant une de ses séries à moitié faite (même règle que le plan 13).
- **Bloc repliable**, replié par défaut avec une ligne de résumé (« Repos entre chaque exercice · Tirage horizontal : unilatéral, repos entre côtés ») : les boutons Commencer/Terminer restent atteignables sans scroller (même logique que le bloc Infos de l'amélioration 06).
- Les réglages sont **éphémères** (le temps de la séance), comme le ÷ 2 de l'écran simple.

### 5. Store et bandeaux

- `activeSessionStore` : `activeExerciseLogId` = log de l'étape courante (les sauvegardes vont au bon exercice sans autre changement) + nouveau `activeSuperset: { a: string; b: string } | null`.
- `GlobalRestBanner` : si `activeSuperset`, le tap ouvre `/seance/superset?a=…&b=…` au lieu de `/seance/exercice/…` ; titre « Repos — Superset ».
- `isUnilateral`/`currentSide` uniques du store → remplacés pour le superset par un état **par log** (`unilateralByLog: Record<logId, boolean>`), que le plan 13 peut déjà introduire pour l'écran simple. Au lancement du superset, chaque entrée est initialisée par la détection du plan 13 si elle n'existe pas encore (si l'utilisateur a déjà réglé le toggle de cet exercice sur l'écran simple, on garde son choix).
- Réglages du bloc § 4 : `supersetRestMode: 'perExercise' | 'perRound'` (défaut `'perExercise'`), `restBetweenSidesByLog: Record<logId, boolean>` (défaut `true`), et `halveRestByLog` **réutilisé** du plan 13 (même sens que sur l'écran simple : tous les repos de l'exercice sont divisés par 2).

### 6. Modal de saisie

`SetPerformanceModal` reçoit un `exerciseName` optionnel → titre « Tirage horizontal — Série 2 (Gauche) ». Unité de poids, préremplissage (historique de **cet** exercice) : par exercice, via un helper `src/utils/setPrefill.ts` extrait des fonctions `getPrefillFromHistory`/`getPrefillFromCurrentSession` de `[logId].tsx` (paramètres explicites, pas de lecture implicite du store — cf. piège `CLAUDE.md`).

## Questions

Toutes tranchées :
- ordre exercice par exercice, côté de départ réglable (§ 3) ;
- repos et unilatéral réglés dans un bloc dédié (§ 4) : global « Entre chaque exercice » (défaut) / « 1 fois sur 2 » ; par exercice Unilatéral → Repos entre chaque côté → ÷ 2 ;
- superset improvisé **mémorisé** sur la séance (cadre orange) ;
- **2 exercices maximum** : si un groupe prévu en contient 3 ou plus, on propose seulement « Exercice seul » (la question « par lequel commencer » ne tiendrait pas en 3 boutons Android) ;
- si un des deux exercices est déjà fait, on ne propose que l'exercice seul ;
- affichage des supersets dans Détails de séance : plus tard, hors de ce plan.

« ÷ 2 » divise **tous** les repos de l'exercice, entre ses côtés et après lui (✅ acté 2026-10-18). Choix par défaut pris sans décision explicite (facile à inverser) : « Repos entre chaque côté » **activé** par défaut.

## Marche à suivre

1. `src/utils/supersetSequence.ts` + `scripts/testSupersetSequence.ts` (les 4 cas de latéralité × 2 modes de repos global × repos entre côtés oui/non × ÷ 2, côté de départ G/D, mode changé entre deux manches, nb de séries différent, reprise après interruption, hors plan) + script npm. Chaque étape renvoyée porte `restAfterSeconds: number | null` (null = pas de repos) calculé à partir des réglages du § 4.
2. Extractions depuis `[logId].tsx` (sans changer son rendu) : hook `useExerciseLiveData(logId)` (chargement enriched/alternatives/historique/unité), `ExerciseInfoPanel`, `src/utils/setPrefill.ts`. *(`ObjectivesList`/`SetLogList` déjà extraits au plan 13.)*
3. `src/db/session.ts` : `pairExerciseLogs`, `getSupersetHistory(exerciseIdA, exerciseIdB, limit)` (fusion de deux `getPreviousPerfs`).
4. Store : `activeSuperset`, `unilateralByLog`, `supersetRestMode`, `restBetweenSidesByLog`.
5. `src/components/live/SupersetSettings.tsx` (bloc § 4, repliable avec résumé) puis `app/seance/superset.tsx` + déclaration dans `app/_layout.tsx` (`title: 'Superset'`).
6. `app/seance/[sessionId].tsx` : alertes de lancement, toggle de sélection, `pairExerciseLogs`.
7. `GlobalRestBanner` : routage superset. `SetPerformanceModal` : prop `exerciseName`.

Pas de migration (`exercise_logs.superset_group_id` existe déjà).

## Points d'attention

- **Taille de l'écran** : `[logId].tsx` fait 839 lignes ; dupliquer sa logique dans `superset.tsx` serait ingérable. L'étape 2 (extractions) est indispensable — à faire en premier et à vérifier sur device **avant** d'écrire l'écran superset (l'écran simple ne doit pas changer).
- **Alertes ≤ 3 boutons** : les deux alertes de lancement sont à 3 boutons pile.
- **Exercice alternatif (plan 14)** dans un superset : le nouveau log garde le `superset_group_id`, la séquence continue avec l'alternative.
- **Repos auto en fin de manche** : en mode Auto, la fin du compte à rebours démarre la 1ʳᵉ étape de la manche suivante (même mécanisme que l'écran simple, `autoFiredRef`).

## Vérification (device)

- Superset prévu (méso) : alerte → « Faire le superset » → « Par lequel commencer » → écran superset, objectifs entrelacés, A·S1 en bleu.
- Défaut « Entre chaque exercice » : A → Valider → repos A → B → Valider → repos B → A·S2… ; « 1 fois sur 2 » : A → B démarre aussitôt (Auto) → repos = max des deux.
- Quitter en plein milieu, revenir via la carte ou le bandeau de repos → reprend à la bonne étape.
- Les 4 cas de latéralité, avec des exercices de nombres de séries différents, en côté de départ G puis D (Paramètres).
- Exercice avec variante « unilatéral » → toggle pré-coché dans le bloc Réglages ; le décocher avant la série suivante → série enregistrée bilatérale ; grisé entre ses deux côtés.
- Unilatéral : « Repos entre chaque côté » activé → repos entre G et D ; + « ÷ 2 » → ce repos **et** le repos après l'exercice durent la moitié ; désactivé → G et D enchaînés. Rejouer l'exemple du § 4 dans les deux modes globaux.
- Résumé du bloc replié à jour après chaque changement de réglage.
- Superset improvisé : toggle, 2 cartes cochées → encadrées en orange après coup.
- Détails de séance après la fin : séries de A et B correctes.

## Notes d'implémentation

> **Implémenté le 2026-10-19 — typecheck 0 erreur, `npm run test:superset` vert, mais NON testé sur device** : la section « Vérification (device) » ci-dessus reste à dérouler à la main (le test du moteur ne couvre ni l'UI, ni le timer, ni les alertes).

- **Moteur** `src/utils/supersetSequence.ts` (pur) + `scripts/testSupersetSequence.ts` (`npm run test:superset`, ~30 cas : 4 cas de latéralité × 2 modes de repos × repos entre côtés / ÷ 2, côté de départ G/D, nombre de séries différent, hors plan, reprise, mode changé entre deux manches, `startSetNumber`). `getNextStep` renvoie l'étape suivante **et** le repos qui la suit ; `restAfterStep` recalcule ce repos pour l'étape figée au « Commencer » (le « Terminer série » ne connaît que le store). `getObjectiveRows` donne les lignes entrelacées.
  - *Manche* : la k-ième série d'un exercice tombe dans la manche k, sauf au-delà de ses séries prévues : elle passe alors après la dernière manche du plan des deux (A : 3 / B : 4 → manche 4 = B seul, manche 5 = A (hors plan) + B (hors plan)). Nombre de séries inconnu (programme à N variable) : alternance simple.
  - *Repos* : une base de **0 s = pas de repos** (plan typique 0 s sur A) ; pas de base = repos en chrono libre ; en « 1 fois sur 2 », max des repos des participants de la manche (chacun déjà ÷ 2). Le ÷ 2 ne s'applique que si la série est unilatérale **et** que « Repos entre chaque côté » est activé (comme dans l'interface, où il n'est proposé qu'à cette condition).
- **Extractions** (l'écran exercice passe de 1032 à ~870 lignes, rendu inchangé) : `src/utils/useExerciseLiveData.ts` (hook de chargement, un seul `setData` → jamais d'état à moitié chargé), `src/utils/setPrefill.ts` (objectifs de repos/exécution + `computePrefill`, paramètres explicites), `src/components/live/ExerciseInfoPanel.tsx`, et `ObjectivesList.tsx` exporte `getSetTargetText` + `ObjectiveRow`.
- **Store** : `activeSuperset`, `unilateralByLog`, `supersetRestMode`, `restBetweenSidesByLog` (défaut activé) ; `halveRestByLog`/`restOverrideByLog`/`startSideByLog` réutilisés ; `moveActiveExerciseLog` déplace aussi les nouveaux champs. Les champs globaux `isUnilateral`/`currentSide`/`currentSetNumber` servent toujours de **photo de l'étape en cours** (figée au « Commencer »). Le toggle de l'écran exercice alimente aussi `unilateralByLog` : un choix déjà fait n'est jamais écrasé par la détection, dans un sens comme dans l'autre.
- **Écrans** : `app/seance/superset.tsx` (route déclarée avec `SessionClock`), `src/components/live/SupersetSettings.tsx`, lancement + mode sélection « ⇄ Superset » dans `app/seance/[sessionId].tsx` (groupe de 3+ ou un exercice déjà fait → ouverture directe de l'exercice seul), `pairExerciseLogs` / `getSupersetHistory` dans `src/db/session.ts`, `GlobalRestBanner` (route superset si le chrono actif appartient au superset ; `excludeLogId` accepte un tableau), `SetPerformanceModal` (`exerciseName`).
- **Sans repos** : le « Terminer série » repasse en `idle` (pas de décompte) et ouvre le modal ; à la validation, en mode Auto l'étape suivante démarre aussitôt, en Manuel le bouton « Commencer … » prend le relais. Le temps chronométré n'est repris que s'il correspond à l'étape (exercice + série + côté), sinon `executionSeconds = null`.
- **Picker de repos** : pendant un repos il règle l'exercice qui vient d'être fait ; le décompte en cours prend la valeur choisie directement (÷ 2 si applicable), pas le max de fin de manche. Chip « Prévu » : retour à la règle normale du moteur.
- **Pas fait / à surveiller** : pas de « Remplacer l'exercice » ni de changement de variante depuis l'écran superset (à faire depuis l'écran exercice seul ; un remplacement change l'id du log et le superset en cours garde l'ancien — le store suit via `moveActiveExerciseLog`, pas l'URL). Le superset improvisé ne vérifie pas qu'un des deux exercices appartient déjà à un autre groupe. L'historique fusionné refait deux requêtes `getPreviousPerfs` en plus de celles du hook (acceptable, 5 séances max).
