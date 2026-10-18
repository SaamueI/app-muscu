# 13 — Exercice live : avancement, unilatéral et temps de repos

> **Statut : ✅ implémenté et validé sur device (typecheck 0 erreur + `npm run test:progress` vert).**

Quatre demandes regroupées parce qu'elles reposent sur **la même mécanique** : savoir, à tout instant, quelle série/quel côté est fait, en cours, à venir — et quel repos appliquer.

- Marquer l'avancement dans les objectifs (vert = fait, bleu = en cours/suivant), unilatéral compris.
- Pré-cocher « Unilatéral » pour les exercices unilatéraux.
- Si unilatéral : toggle « repos ÷ 2 ».
- Temps de repos prédéfini (objectif méso/programme) **impossible à modifier** → le rendre modifiable.
- *(ajouté)* Côté de départ des séries unilatérales réglable (Gauche par défaut), le même partout.

Ce plan prépare aussi le terrain du **superset (plan 01)**, qui réutilise tout ce qui est extrait ici.

## Ce qui existe (et pourquoi c'est fragile)

L'écran `app/seance/exercice/[logId].tsx` (839 lignes) suit la série courante par **compteurs** : `currentSetNumber`/`currentSide` dans le store quand l'exercice est actif, `localNextSetNumber`/`localCurrentSide` sinon. Ces compteurs sont incrémentés/décrémentés à la main, d'où des incohérences :

- **Bug** : supprimer une série en live ne renumérote pas les suivantes (contrairement à l'écran Détails qui appelle `renumberSetsAfterDelete`) mais décrémente le compteur. Séries #1 #2 #3, on supprime #1 → il reste #2 #3, compteur = 3 → la prochaine série est enregistrée **#3 en double**.
- Le compteur local repart de `setLogs.length + 1` au rechargement, ce qui est faux en unilatéral (2 lignes par série).

## Proposition

### A. Moteur d'avancement dérivé de la DB — `src/utils/exerciseProgress.ts` (nouveau, pur)

Au lieu de compter à la main, on **recalcule** l'avancement à partir des `set_logs` déjà enregistrés :

```ts
type SetState = { setNumber: number; status: 'done' | 'current' | 'todo'; sidesDone: ('L' | 'R')[] };

computeProgress({
  setLogs,            // lignes de la séance pour cet exercise_log
  plannedSetCount,    // nb de séries prévues (méso : mesoSets.length ; programme : § B) ; 0 si libre
  isUnilateral,       // état ACTUEL du toggle (sert seulement pour la prochaine série à démarrer)
  firstSide,          // 'L' | 'R' — réglage utilisateur (§ F)
  startSetNumber,     // 1 par défaut ; > 1 quand le log remplace un exercice en cours de route (plan 14)
}): { next: { setNumber: number; side: 'L' | 'R' | null }; sets: SetState[] }
```

**Le mode est porté par chaque série, pas par l'exercice** (✅ acté) : une série est enregistrée unilatérale si le toggle est activé **au moment où on la commence**. Le toggle peut donc changer **entre deux séries** (série 1 bilatérale, série 2 unilatérale…). Règles :

- une série est *faite* si elle a une ligne sans côté, **ou** ses deux lignes G et D ;
- une série à moitié faite (un seul côté) est toujours la prochaine, sur le côté manquant — quel que soit le toggle ;
- sinon la prochaine est la plus petite série manquante (trou après suppression) ou `max + 1`, sur `firstSide` si le toggle est activé, sans côté sinon.

Le toggle est **désactivé seulement pendant une série à moitié faite** (un côté fait, l'autre pas encore) : on ne change pas de mode au milieu d'une série.

> 🎓 Cas d'école : *état dérivé* vs *état dupliqué*. Garder un compteur à côté des données oblige à le maintenir synchrone à chaque ajout/suppression/édition — chaque oubli est un bug. Le recalculer depuis les données (ici quelques lignes en mémoire) supprime toute une classe de bugs. Fonction pure → testable sous Node comme `exerciseMatch.ts` (`npm run test:progress`).

Utilisation : après chaque `load()`, `next` alimente le libellé « Série N (côté) », le bouton « Encoder la série » (plan 12) et, si l'exercice est actif, `currentSetNumber`/`currentSide` du store. Les compteurs locaux disparaissent. La suppression en live appelle désormais `renumberSetsAfterDelete` (comme l'écran Détails).

### B. Avancement dans les objectifs

Composant extrait `src/components/live/ObjectivesList.tsx` (réutilisé par le superset) :

| État | Rendu |
|---|---|
| `done` | fond vert pâle `#E8F8EE`, ✓ vert |
| `current` (prochaine série, ou série en cours d'exécution) | fond bleu pâle `#E8F0FE`, bordure gauche bleue |
| `current` unilatéral à moitié fait | idem bleu + « G ✓ » (ou « D ✓ ») à droite |
| `todo` | inchangé |

Séries **au-delà** du plan (série 5 d'un plan à 4) : une ligne « Série 5 — hors plan » en bleu, pour montrer qu'on continue.

**Exercices de programme** (objectif agrégé, pas de lignes par série) — ✅ acté : on génère des lignes « Série 1 … Série N » (mêmes objectifs sur chaque ligne) **uniquement si `targetSetsMin === targetSetsMax`** (N fixe). Si c'est une fourchette (« 3–4 séries ») ou si le nombre n'est pas renseigné, on garde la ligne agrégée actuelle, sans couleur. *(Cas « un seul des deux renseigné » : traité comme non fixe, lecture littérale de la décision — à revoir si gênant.)* Les séries hors plan restent possibles dans tous les cas.

### C. Pré-toggle « Unilatéral » — ✅ décision actée

Aujourd'hui le toggle part toujours à « non ». **Décision** : pas de nouvelle colonne, deux sources combinées — le toggle est pré-coché si **l'une ou l'autre** est vraie :

1. **La variante prévue contient « unilatéral »** : `mesoExercise.selectedVariation ?? programExercise.selectedVariation`, comparée après normalisation (minuscules + accents retirés) → `variante.includes('unilateral')` couvre « Unilatéral », « unilatérale », « unilateral »…
2. **Déduction depuis la dernière séance** de cet exercice : si elle contient des lignes `side = 'L'/'R'`.

*(Le plan 14 introduit ensuite la variante modifiable en live, `exercise_logs.selected_variation` : `isUnilateralHint` lira alors la variante **effective** du log via `getEffectiveVariation` au lieu de celle du plan. Garder le paramètre `variation` en entrée pour que ce changement se limite à l'appelant.)*

Helper pur `isUnilateralHint({ variation, lastPerf })` dans `src/utils/exerciseProgress.ts` (testé avec le reste).

La détection ne sert qu'à **pré-régler** le toggle à l'ouverture de l'écran. Il reste modifiable entre deux séries (sans rien écrire dans le plan ni le catalogue) ; c'est son état au moment où on **commence** une série qui détermine si elle est enregistrée unilatérale (§ A).

**Conséquences à connaître :**
- Dans l'éditeur de méso/programme, la variante se choisit parmi les chips `exercise.variations` du catalogue. Pour marquer un exercice comme unilatéral à la main, il faut donc d'abord ajouter « unilatéral » aux variantes de l'exercice (fiche exercice → Modifier ; le placeholder du champ le suggère déjà : « Ex : 30°, prise neutre, unilatéral… »). Une variante importée hors liste est conservée telle quelle (chip affichée à part), donc l'import fonctionne sans rien ajouter au catalogue.
- Exercice libre ajouté en live (pas de plan → pas de variante) : seule la déduction historique joue.

**Prompt LLM et template** (ripple obligatoire, sinon un méso généré par LLM ne déclenchera jamais le pré-toggle) :
- `src/export/formatDoc.ts` : ajouter une règle aux deux prompts (méso + programme), à côté des règles Superset/Alternatives : *« Variation : pour un exercice exécuté un côté à la fois (unilatéral), la colonne Variation DOIT contenir le mot « unilatéral » (ex. « unilatéral », « unilatéral, prise neutre ») ; le nom de l'exercice reste le nom du catalogue. »*
- `src/export/core/sampleData.ts` : l'exemple `exerciseName: 'Développé militaire unilatéral', selectedVariation: null` contredit cette règle → `exerciseName: 'Développé militaire haltères'`, `selectedVariation: 'unilatéral'` (templates et prompt sont générés depuis ce pivot, ils suivent automatiquement). Vérifier ensuite `npm run test:import:csv` et les tests d'export, qui peuvent comparer ce nom.

### D. Repos ÷ 2 (unilatéral)

Aujourd'hui en unilatéral, *chaque côté* déclenche le repos complet : G → repos 2:00 → D → repos 2:00. Le toggle **« Repos ÷ 2 »** (affiché seulement si unilatéral, sous le toggle Unilatéral) fait G → 1:00 → D → 1:00 : le repos total par série redevient celui prévu.

État par exercice dans le store : `halveRestByLog: Record<logId, boolean>`, **éphémère** (✅ acté, réinitialisé à chaque séance).

### E. Temps de repos modifiable même s'il est prédéfini

Aujourd'hui `RestPresetPicker` est **masqué** dès qu'un objectif de repos existe (`!hasRestTarget`), et `handleTerminer` prend `targetRest ?? lastPreset` → l'objectif gagne toujours.

Proposition : le picker est **toujours** visible ; l'objectif apparaît comme une chip « Prévu 2:00 » présélectionnée. Taper une autre chip :
- en repos → change le compte à rebours en cours (même `timerStartedAt`, comme aujourd'hui) ;
- et devient le repos de l'exercice pour la suite de la séance (✅ acté).

Calcul unique dans un helper : `getEffectiveRest(logId, setNumber) = (override[logId] ?? target(setNumber) ?? null) / (halve ? 2 : 1)`. Le store a déjà `lastRestPresets: Record<logId, number>` → renommé `restOverrideByLog` pour refléter son nouveau sens (il primait déjà quand il n'y avait pas d'objectif).

### F. Côté de départ — réglage utilisateur — ✅ acté

Aujourd'hui « Gauche d'abord » est codé en dur (`currentSide: 'L'` dans `handleCommencer`, `handleSelectPreset`, `handleSavePerf`, l'ajout de série de l'écran Détails…). Décision : **le même côté en premier partout**, réglable, Gauche par défaut.

```sql
ALTER TABLE `user_settings` ADD COLUMN `first_side` text DEFAULT 'L' NOT NULL;
```

- `schema.ts` : `firstSide: text('first_side').notNull().default('L')` sur `userSettings` ; `migrations.js`, `_journal.json`, diagramme ER.
- `src/db/settings.ts` : `getFirstSide()` / `setFirstSide(side)` — la ligne singleton est créée paresseusement (cf. commentaire existant) : renvoyer `'L'` si la ligne n'existe pas, et faire un *upsert* qui ne touche que cette colonne. Vérifier que les upserts existants (`setUpdatePrefs`, `setUserWeightUnit`) ne listent que leurs propres colonnes dans `onConflictDoUpdate`, sinon ils écraseraient `first_side`.
- `app/parametres.tsx` : nouvelle ligne « Unilatéral : commencer par » avec deux chips **Gauche / Droite**.
- Consommateurs : `computeProgress` (`firstSide`), écran exercice live, écran superset (plan 01), ajout de série de `seance/details/[sessionId]/modifier.tsx`, ordre des boutons Gauche/Droite du menu « Modifier » (plan 12).
- **Affichage** des séries unilatérales (« G : … / D : … ») : le côté de départ en premier, dans les listes live, l'historique et Détails.

## Questions

Toutes tranchées : source de l'unilatéral (§ C), mode porté par chaque série (§ A), repos ÷ 2 éphémère (§ D), lignes de programme seulement si N fixe (§ B), repos modifié pour la suite de l'exercice (§ E), côté de départ réglable (§ F).

## Marche à suivre

1. `src/utils/exerciseProgress.ts` + `scripts/testExerciseProgress.ts` (cas : bilatéral, unilatéral moitié fait, mode changé entre deux séries, `firstSide = 'R'`, trou après suppression, hors plan, exercice libre, `startSetNumber = 3`) + script npm.
2. `isUnilateralHint` (dans `exerciseProgress.ts`) + règle « Variation » dans `formatDoc.ts` + exemple corrigé dans `sampleData.ts`.
3. Migration `user_settings.first_side` + helpers `settings.ts` + ligne dans Paramètres (§ F).
4. Store : `halveRestByLog`, renommage `lastRestPresets` → `restOverrideByLog`.
5. `src/components/live/ObjectivesList.tsx` et `src/components/live/SetLogList.tsx` (liste « Séries de cette séance » + menu Modifier/Supprimer du plan 12) extraits de `[logId].tsx`.
6. `[logId].tsx` : branchement sur `computeProgress`, pré-toggle, toggle ÷2, picker toujours visible, `getEffectiveRest`, suppression → `renumberSetsAfterDelete`.

## Points d'attention

- **Changer de mode entre deux séries** est permis (le mode est porté par chaque série). Le préremplissage depuis l'historique filtre déjà par côté (`getPrefillFromHistory`) : une série unilatérale après une bilatérale ira chercher le bon côté dans l'historique, ou à défaut l'objectif.
- **Ne jamais lire `getActiveSession()` dans les helpers** sans `setNumber`/`side` explicites (piège documenté dans `CLAUDE.md`) — `computeProgress` et `getEffectiveRest` prennent tout en paramètre.
- Export/import : rien à changer au format — la colonne « Variation » existe déjà et fait l'aller-retour (XLSX + CSV).

## Vérification (device)

- Méso 4 séries : la 1ʳᵉ ligne est bleue au départ ; après chaque série validée, elle passe verte et la suivante bleue. Unilatéral : « G ✓ » après le côté gauche, vert après le droit.
- Supprimer la série #1 sur 3 → les autres deviennent #1 #2, la suivante est #3.
- Série 1 bilatérale, toggle activé, série 2 → enregistrée G puis D ; toggle grisé entre G et D.
- Paramètres → « Droite » → toutes les séries unilatérales commencent par D (live, Détails), affichage « D : … » en premier.
- Programme « 3 séries » → 3 lignes colorées ; « 3–4 séries » → ligne agrégée inchangée.
- Méso avec variante « Unilatéral » → toggle pré-coché. Exercice fait en unilatéral la dernière fois (sans variante) → idem. Variante « prise neutre » + historique bilatéral → non coché.
- Prompt LLM copié depuis l'écran d'import → contient la règle « Variation … unilatéral ».
- Repos prévu 2:00 + ÷2 → 1:00 après chaque côté.
- Repos prévu 2:00, tap sur 3:00 pendant le repos → compte à rebours ajusté, et 3:00 au repos suivant.
- `npm run test:progress` vert, `npx tsc --noEmit` à 0.

## Notes d'implémentation

- **Moteur** : `src/utils/exerciseProgress.ts` (`computeProgress`, `isUnilateralHint`, `getEffectiveRest`, `fixedPlannedSets`) + `scripts/testExerciseProgress.ts` (`npm run test:progress`, 43 assertions). L'écran `[logId].tsx` ne tient plus aucun compteur : `progress.next` est recalculé à chaque rendu depuis `enriched.setLogs`. Le store garde `currentSetNumber`/`currentSide` uniquement comme « série dont le repos court » (posés par Terminer/Commencer).
- **Composants extraits** : `src/components/live/ObjectivesList.tsx` et `SetLogList.tsx` (aussi utilisé en lecture seule pour l'historique et l'écran Détails). `SetLogList` utilise le `formatSetLine` partagé (`src/utils/formatSetLine.ts`) : la liste live affiche donc aussi les partielles et le temps d'exécution, comme Détails.
- **Repos** : `RestPresetPicker` reçoit `overrideSeconds` / `plannedSeconds` / `onSelectPlanned`. Le chip « Prévu » remet l'objectif du plan (qui peut varier par série) ; un autre chip devient `restOverrideByLog[logId]`. Le picker reste limité aux phases repos/idle (pas en exécution). **Changement de comportement** : en phase idle, taper un chip règle seulement le repos (avant, ça lançait un chrono de repos).
- **Sauvegarde d'une série en unilatéral** : le repos lancé par « Terminer série » court jusqu'au bout après l'enregistrement. L'ancien code relançait un chrono neuf à l'enregistrement du côté D (avec le repos *non* divisé) : supprimé, incompatible avec le ÷ 2.
- **Pré-toggle** : appliqué une seule fois par ouverture de l'écran (ref), à partir de la variante prévue + des lignes G/D de la séance en cours et de la dernière séance.
- **Côté de départ** : migration 0018, `getFirstSide`/`setFirstSide` (`src/db/settings.ts`), chips Gauche/Droite dans Paramètres, consommé par `computeProgress`, l'écran live, l'écran Détails et `modifier.tsx` (ajout de série + ordre d'affichage).
- **Prompt LLM / template** : règle « Variation … unilatéral » dans `formatDoc.ts`, exemple `Développé militaire haltères` + variante `unilatéral` dans `sampleData.ts` ; tests d'export/import CSV et XLSX toujours verts.
- **Retours après premier essai** : (1) sur l'écran live, quand « Unilatéral » est activé, une ligne « Commencer par : Gauche / Droite » (grisée pendant une série à moitié faite) ; le choix est éphémère, par exercice (`startSideByLog` dans le store) et prime sur le réglage Paramètres. (2) Picker de repos : chips qui passent à la ligne (plus de scroll horizontal caché), chip « ＋ Autre » qui ouvre `src/components/DurationPickerModal.tsx` (minutes + secondes, champs + boutons −/+), chip dédiée pour une durée perso en cours, lien « Modifier les raccourcis ». Le même modal remplace la saisie en secondes de `app/seance/presets-repos.tsx`.

