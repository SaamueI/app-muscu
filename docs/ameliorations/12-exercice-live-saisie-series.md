# 12 — Exercice live : saisie et modification des séries

> **Statut : ✅ implémenté (2026-10-18)** et testé sur device par l'utilisateur (Expo SDK 57). Voir « Notes d'implémentation » en bas.

Quatre demandes regroupées parce qu'elles touchent toutes le modal de saisie (`src/components/SetPerformanceModal.tsx`) et la liste « Séries de cette séance » de `app/seance/exercice/[logId].tsx`. Ce sont surtout des **bugs** : petit plan, à faire tôt.

## 1. Bug : « RIR 0 » s'affiche comme manquant

**Cause trouvée** — `SetPerformanceModal.handleSave` :

```ts
rir: parseInt(rir, 10) || null,
```

`parseInt("0")` vaut `0`, et `0 || null` vaut `null` : en JavaScript, `||` renvoie la partie droite dès que la gauche est *falsy* — et `0` est falsy au même titre que `NaN`, `''`, `null`. Le RIR 0 est donc **enregistré `null` en DB**, pas seulement mal affiché.

> 🎓 Cas d'école : `||` vs `??`. `a ?? b` ne remplace `a` que s'il vaut `null`/`undefined` ; `a || b` le remplace aussi pour `0`, `''`, `false`, `NaN`. Pour un nombre saisi, il faut tester `NaN` explicitement.

**Correctif** : un helper local `parseIntOrNull(s) { const n = parseInt(s, 10); return Number.isNaN(n) ? null : n; }` appliqué à `reps`, `rir` et `partialReps` (même bug latent : 0 rep partielle → `null`, sans conséquence visible mais incohérent).

Les RIR 0 déjà enregistrés sont perdus (stockés `null`) : pas de rattrapage possible.

## 2. Le clavier s'ouvre tout seul sur le champ Poids

Le `TextInput` Poids n'a **pas** d'`autoFocus`. C'est un comportement Android : à l'ouverture d'un `Modal` (qui est une fenêtre `Dialog` native), Android donne le focus au premier élément focusable — le champ Poids — et ouvre le clavier.

**Correctif** (à valider sur device, le comportement exact dépend de la version d'Android) : dans `SetPerformanceModal`, `onShow={() => Keyboard.dismiss()}` sur le `<Modal>`. Si insuffisant : rendre le titre focusable (`<View focusable>` autour du titre) pour qu'il capte le focus initial à la place du champ.

Le clavier s'ouvre toujours normalement quand on **tape** sur un champ.

## 3. Back pendant l'encodage → série impossible à encoder

**Scénario** : *Terminer série* → repos démarre + modal ouvert → retour Android (ou tap sur le fond grisé) → `onClose` ferme le modal **sans rien enregistrer**. La phase reste `rest`, `currentSetNumber` n'a pas bougé, mais plus aucun bouton ne rouvre le modal : la série est perdue.

**Proposition** : bouton **« + Encoder la série N (côté) »** affiché dans le bloc timer quand la phase est `idle` ou `rest`. Il ouvre le modal pour la série/le côté courant (`effSetNumber`/`effCurrentSide`) avec le même préremplissage.

- Si l'exercice est l'exercice actif (cas « back pendant l'encodage ») → `handleSavePerf` tel quel : le repos déjà en cours continue, le compteur avance.
- Sinon (encodage à la main, sans chrono) → enregistrement + avancement du compteur **local** (`localNextSetNumber`/`localCurrentSide`), **sans** démarrer de repos.

`lastExecutionSeconds` : renseigné seulement si la série vient d'être chronométrée (sinon `null`, comme aujourd'hui pour une série jamais lancée).

## 4. Modification d'une série unilatérale : un seul côté

Aujourd'hui, toucher une série unilatérale → *Modifier* édite **uniquement la ligne Gauche** (`handleEditSetLog(sl)` reçoit la ligne L ; la ligne D n'est jamais éditable en live).

**Proposition** — reprendre le pattern déjà en place dans `app/seance/details/[sessionId]/modifier.tsx` (phase 10) :

```
Série #2                         → Modifier
[Modifier]  [Supprimer]  [Annuler]

Modifier la série #2             (si unilatérale seulement)
[Gauche]  [Droite]  [Annuler]
```

Chaque côté s'édite indépendamment ; le modal affiche « Série 2 (Droite) » et est prérempli avec la ligne choisie. *(Voir question 2 pour « les deux côtés ».)*

## 5. Deux bugs voisins trouvés en relisant (à corriger dans la foulée)

- **Le temps d'exécution est effacé à chaque modification** : `handleSaveEdit` passe à `updateSetLog` les données du modal, où `executionSeconds: null` (le modal ne le connaît pas) → la durée chronométrée est écrasée. Correctif : dans `handleSaveEdit`, réinjecter `editingSetLog.executionSeconds` (et `durationSeconds`/`restSeconds`).
- **Le champ « Note » du modal n'est jamais enregistré** : `note` est en state mais absent de `SetLogData` et `set_logs` n'a pas de colonne note (seul `exercise_logs.note` existe, une note par exercice). → § 6.

## 6. Note par série — ✅ acté

Nouvelle colonne, la note du modal est enregistrée **par série** :

```sql
ALTER TABLE `set_logs` ADD COLUMN `note` text;
```

Une seule instruction → pas besoin de `--> statement-breakpoint`. Nullable, sans défaut (même forme que `moved_event_from_date`).

Ripple :
- `src/db/schema.ts` (`note: text('note')` sur `setLogs`), `migrations.js`, `meta/_journal.json` (`when` > `1782700006000`), diagramme ER `docs/schema-diagramme.md`.
- `SetLogData.note: string | null` ; `saveSetLog` / `updateSetLog` l'écrivent (`src/db/session.ts`).
- `SetPerformanceModal` : `note` dans `handleSave` (chaîne vide → `null`), nouvelle prop `prefillNote` — remplie **uniquement en édition** (une nouvelle série ne reprend pas la note de la précédente).
- Affichage : sous-ligne en italique gris sous la série, partout où une série est listée — liste « Séries de cette séance » + Historique (`[logId].tsx`), Détails de séance + mode édition (`seance/details/[sessionId].tsx` et `.../modifier.tsx`, qui utilise aussi le modal → passer `prefillNote`), Performances de la fiche exercice et de l'écran exercice de programme (fix 05).
- Unilatéral : chaque côté a sa propre note (une ligne `set_logs` par côté).
- Export : les perfs ne sont exportées nulle part aujourd'hui. À intégrer quand on traitera l'amélioration 3 (import/export des perfs).

## Questions ouvertes

Toutes tranchées :
1. Libellé précis : « + Encoder la série 3 (Gauche) ».
2. Pas d'option « les deux côtés à l'identique » en live : Gauche / Droite seulement (ordre des boutons selon le côté de départ réglé dans les paramètres, plan 13).
3. Note : implémentée par série (§ 6).

## Marche à suivre

1. `SetPerformanceModal.tsx` : `parseIntOrNull` (point 1), `onShow` + `Keyboard.dismiss` (point 2), champ Note selon question 3.
2. `app/seance/exercice/[logId].tsx` :
   - bouton « Encoder la série » + handler `handleManualEntry` (point 3) ;
   - alerte imbriquée Gauche/Droite dans le menu d'une série unilatérale, `handleEditSetLog` reçoit la ligne du côté choisi (point 4) ;
   - `handleSaveEdit` préserve `executionSeconds` (point 5).
3. Migration `set_logs.note` + ripple du § 6.

## Points d'attention

- Le plan **13** remplace le calcul « série/côté courant » par un moteur dérivé de la DB ; le bouton du point 3 se branchera alors dessus sans changer d'apparence. Faire 12 avant 13 ne crée pas de travail perdu (quelques lignes).
- `key` du modal : il est recréé à chaque changement de `modalKey` (c'est ce qui réinitialise le préremplissage). Pour l'édition d'un côté, la clé `edit-${id}` reste unique par ligne → OK.

## Vérification (device)

- Série avec RIR 0 → affichée « RIR 0 » dans « Séries de cette séance », dans l'historique, et dans Détails de séance.
- Ouverture du modal → pas de clavier ; tap sur Poids → clavier.
- Terminer série → back → bouton « Encoder la série N » → enregistrement OK, repos non interrompu.
- Série unilatérale → Modifier → Droite → seule la ligne D change.
- Modifier une série chronométrée → le temps d'exécution « 0:45 exec. » est toujours là.
- Note saisie dans le modal → visible sous la série en live, dans l'historique de la séance suivante, dans Détails ; modifiable en édition ; une nouvelle série démarre avec une note vide.

## Notes d'implémentation

Migration **0017** (`0017_set_log_note.sql`, `when` = `1782700007000`) : `set_logs.note`. Diagramme ER mis à jour.

- **RIR 0** : `parseIntOrNull` dans `SetPerformanceModal` (reps, RIR, reps partielles).
- **Clavier** : `onShow={() => Keyboard.dismiss()}` sur le `<Modal>` (le repli « titre focusable » n'a pas été implémenté).
- **Encodage manuel** : bouton « + Encoder la série N (côté) » dans le bloc timer (phases `idle` et `rest`). `handleSaveNew` choisit le flux : exercice actif **en repos** → `handleSavePerf` (le repos continue) ; sinon `handleSaveManual` (`executionSeconds: null`, avance le compteur du store si l'exercice est actif, sinon les compteurs locaux, sans démarrer de repos).
- **Modifier un côté** : « Modifier » ouvre Gauche / Droite / Annuler quand les deux côtés existent (`handleEditRow`).
- **Temps conservés à l'édition** : `executionSeconds`/`durationSeconds`/`restSeconds` réinjectés depuis la ligne éditée — dans l'écran live **et** dans `seance/details/[sessionId]/modifier.tsx` (même bug, hors périmètre initial du plan).
- **Note par série** : `SetLogData.note`, `saveSetLog`/`updateSetLog`, prop `prefillNote` (édition seulement), composant `src/components/SetNote.tsx` (sous-ligne italique grise) affiché dans l'écran live (séries + historique), Détails de séance, mode édition, fiche exercice et écran exercice de programme.

**Écarts / ajouts par rapport au plan :**
- Le modal (clé, numéro, côté) utilise désormais `effSetNumber`/`effCurrentSide` au lieu de `s.currentSetNumber`/`s.currentSide` du store global : sinon, sur un exercice non actif, le modal affichait la série d'un *autre* exercice.
- `load()` déduit les compteurs locaux des `set_logs` (plus grand `setNumber`, côté D manquant éventuel) au lieu de « nombre de lignes + 1 », faux en unilatéral (2 lignes par série). Ce n'est qu'une version minimale du moteur d'avancement du plan 13, qui le remplacera.
- Édition « les deux côtés » d'`modifier.tsx` : la note saisie est appliquée aux deux côtés (comportement existant du mode « identique »).
