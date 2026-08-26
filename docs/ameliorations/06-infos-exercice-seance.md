# 06 — Infos exercice sur les écrans séance planifiée et séance live

## Problème

Deux écrans d'exercice sur trois sont pauvres en informations :

| Écran | Fichier | Contenu actuel |
|---|---|---|
| Exercice de **programme** (référence) | `app/programmes/[id]/sessions/[sessionId]/exercises/[programExerciseId].tsx` | carrousel photos, nom + tags, alternatives, variante, objectifs, performances |
| Exercice de **séance planifiée** (méso) | `app/mesocycles/[id]/sessions/[mesoSessionId]/exercises/[mesoExerciseId].tsx` | nom + objectifs par série, rien d'autre |
| Exercice de **séance live** | `app/seance/exercice/[logId].tsx` | nom, objectifs, timer, séries, historique |

Pendant une séance, impossible de revoir à quoi ressemble le mouvement, quelle variante était prévue, ni quelles alternatives sont acceptables si la machine est prise.

## Décisions actées

- **Photos : jamais éditables ici.** Elles appartiennent à l'exercice du catalogue ; leur édition reste dans `app/exercices/[id]/modifier.tsx`.
- **Variante, alternatives et notes : éditables depuis l'écran séance planifiée (méso)**, calqué sur l'écran programme.
- **Écran live : lecture seule.** On ne modifie pas le plan au milieu d'une séance.
- **« Notes » = nouvelle colonne `meso_exercises.note`** — une note propre à l'exercice tel qu'il est planifié (« attention au dos », « monter la charge cette semaine »). La note du catalogue (`exercises.notes`) est affichée **en plus**, en lecture seule, sur les deux écrans.

## Marche à suivre

### 1. Migration — `meso_exercises.note`

```sql
-- src/db/migrations/00NN_meso_exercise_note.sql
ALTER TABLE `meso_exercises` ADD COLUMN `note` text;
```

- `src/db/schema.ts` → ajouter `note: text('note'),` à `mesoExercises`.
- `src/db/migrations/migrations.js` → import + entrée dans l'objet `migrations`.
- `src/db/migrations/meta/_journal.json` → nouvelle entrée avec un `when` **strictement supérieur** au précédent (dernier connu : `1782700002000`).

`drizzle-kit generate` est cassé sur ce projet : écrire ces trois éléments à la main (cf. `CLAUDE.md`). Après la migration, relancer avec `npx expo start --clear`.

### 2. Composant partagé — `src/components/ExerciseImageCarousel.tsx`

Le carrousel est aujourd'hui **dupliqué** dans `app/exercices/[id].tsx` (~l.161-190) et dans l'écran programme (~l.221-256) ; les deux nouveaux écrans en feraient une 3ᵉ et 4ᵉ copie. Extraire :

```ts
type Props = {
  exerciseId: string;
  customImageUris: string[] | null;
  height?: number;          // défaut 220
};
```

Logique reprise telle quelle : images statiques via `exerciseImages[exerciseId]` (`src/db/exerciseImages`) concaténées aux `customImageUris`, `FlatList` horizontale `pagingEnabled` de largeur `Dimensions.get('window').width`, points de pagination si plus d'une image, `return null` si aucune image.

Remplacer les deux usages existants par le composant — l'écran programme et l'écran exercice doivent rester **visuellement identiques**.

### 3. Écran séance planifiée (méso) — éditable

Fichier : `app/mesocycles/[id]/sessions/[mesoSessionId]/exercises/[mesoExerciseId].tsx`.

**Chargement.** `load` ne retient aujourd'hui que `ex?.name` (l.99). Conserver la ligne `exercises` **complète** dans un état `exercise`, plus `mesoExercises.selectedVariation`, `.note`, et les exercices d'`alternativeExerciseIds` (requête `inArray` comme l'écran programme l.89-96).

**Mode lecture** — ordre des sections :

1. `<ExerciseImageCarousel>`
2. Nom + tags (`level`, `category`, `equipment`)
3. **Exercices alternatifs** — chips tappables vers `/exercices/[id]`, sinon « Aucun exercice alternatif »
4. **Variante** — valeur, ou « Aucune variante sélectionnée »
5. **Notes** — note du planning, puis note du catalogue si présente. Deux blocs visuellement distincts : « Note de la séance planifiée » / « Note de l'exercice », le second grisé pour signaler qu'il n'est pas éditable ici.
6. Sections « Série N » existantes (inchangées)

**Mode édition.** Reprendre à l'identique les blocs de l'écran programme (l.268-379) :

- *Variante* : chips depuis `exercise.variations`, chip « Aucune », chip de la variante personnalisée active hors liste, et saisie inline (`TextInput` + bouton OK) pour ajouter une variante à la volée.
- *Alternatives* : chips supprimables (`×`) + bouton `+` qui navigue vers le picker.
- *Note* : `TextInput` multiline (`textAlignVertical="top"`), style des inputs de `calendrier/event/nouveau.tsx`.

`handleSave` fait un `db.update(mesoExercises).set({ selectedVariation, alternativeExerciseIds, note })` **avant** la réécriture des `mesoSets` déjà en place, puis `saveTargetMemory` et `load()` comme aujourd'hui. `alternativeExerciseIds` vaut `null` (pas `[]`) quand la liste est vide, comme côté programme.

**Route du picker d'alternative.** Créer `app/mesocycles/[id]/sessions/[mesoSessionId]/exercises/[mesoExerciseId]/ajouter-alternative.tsx`, copie de la version programme : `ExercisePicker` avec `cardIndicator="plus"`, `setPendingAlt(ex.id)` puis `router.back()`, et `consumePendingNewExercise()` dans un `useFocusEffect` pour récupérer un exercice tout juste créé. L'enregistrer dans `app/_layout.tsx` (`title: 'Exercice alternatif'`).

Le couple « fichier `[mesoExerciseId].tsx` + dossier `[mesoExerciseId]/` » est déjà pratiqué côté programme, expo-router le gère.

**Récupération de l'alternative choisie.** Ajouter un `useFocusEffect(consumePendingAlt)` **séparé** du `useEffect(load)` existant — c'est exactement le découpage de l'écran programme (l.117-129). Ne surtout pas passer `load` sous `useFocusEffect` : au retour du picker, il rechargerait la DB et écraserait l'état d'édition en cours.

### 4. Écran séance live — lecture seule

Fichier : `app/seance/exercice/[logId].tsx`.

**Données.** `getSessionLive` (`src/db/session.ts` l.407-412) charge déjà les `mesoSets` quand `log.mesoExerciseId` est renseigné, mais pas la ligne `meso_exercises` elle-même :

- ajouter `mesoExercise: typeof mesoExercises.$inferSelect | null` au type `ExerciseLogEnriched` ;
- le peupler dans la même branche (un `select` de plus) ;
- ajouter un helper `getAlternativeExercises(ids: string[] | null): Promise<Exercise[]>` (`inArray`, `[]` si liste vide ou nulle).

Source des infos, par ordre de priorité : `enriched.mesoExercise` → `enriched.programExercise` (les deux tables portent `selectedVariation` et `alternativeExerciseIds`) → aucune (exercice libre ajouté en cours de séance via `addFreeExerciseLog`).

**Placement — bloc replié par défaut.** Insérer, juste sous le nom de l'exercice, une ligne tappable « Infos exercice ▾ » qui déplie une section contenant : carrousel, tags, **instructions** (`exercise.description`, ajouté après coup à la demande de l'utilisateur — mêmes pas numérotés que `exercices/[id].tsx`), variante, alternatives (chips tappables vers `/exercices/[id]`), note du planning, note du catalogue.

Motif : le chrono et les boutons « Commencer / Terminer série » doivent rester atteignables sans scroller pendant la séance. Un carrousel de 220 px et trois sections poussés au-dessus seraient une régression d'usage réelle. Le reste de l'écran (Objectifs, Timer, Séries de cette séance, Historique) est **inchangé**.

Aucune écriture DB depuis cet écran.

### 5. Ripple export/import — obligatoire

Le format pivot porte déjà `selectedVariation` et `alternatives` par exercice, et `note` au niveau **séance**. Ajouter une note au niveau **exercice** rend l'export lossy si on ne la propage pas (l'export méso est documenté comme *lossless*) :

| Fichier | Modification |
|---|---|
| `src/export/core/mesoTypes.ts` | champ `note` (`string` ou `null`) sur `MesoExerciseExport` |
| `src/export/core/mesoXlsx.ts` | colonne « Note » dans les colonnes exercices (build + parse) |
| `src/export/core/mesoCsv.ts` | idem — `{ key: 'note', header: 'Note' }`, build + parse |
| `src/export/db/mesoDb.ts` | lecture et écriture de `mesoExercises.note` |
| `src/export/core/sampleData.ts` | une note d'exemple dans le pivot du template |
| `src/export/formatDoc.ts` | description de la colonne dans le prompt LLM copiable |

`MESO_FORMAT_VERSION` **reste à 1** : l'ajout d'une colonne est rétro-compatible, un fichier ancien parse avec `note` absent → `null`.

Tests Node à relancer : `npm run test:export:meso` et `npm run test:import:csv`.

## Points d'attention

- **Photos non éditables** depuis ces écrans : elles appartiennent à l'exercice du catalogue.
- L'édition de la variante / des alternatives / de la note depuis l'écran planifié modifie le **plan**, jamais les séances déjà réalisées (les `exercise_logs` ne référencent le `meso_exercise` que par FK, sans copie).
- **Exercice libre** ajouté en cours de séance : ni `mesoExercise` ni `programExercise` → n'afficher que carrousel, tags et note du catalogue, sans sections Variante/Alternatives vides.
- `noUnusedLocals` est actif : après l'extraction du carrousel, supprimer les imports `Dimensions` / `Image` / `FlatList` et les styles devenus morts dans les écrans sources.
- Le nouveau composant lit `Dimensions.get('window').width` au niveau module (comme les écrans actuels) : comportement inchangé. Ne pas en profiter pour ajouter une gestion de rotation, l'app est verrouillée en `portrait` (`app.json`).

## Vérification

- `npx tsc --noEmit` → 0 erreur.
- `npm run test:export:meso` et `npm run test:import:csv` → verts.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Méso → séance → exercice : Modifier → choisir une variante, ajouter une alternative, écrire une note → Enregistrer → les trois s'affichent en lecture.
  2. Le bouton `+` des alternatives ouvre le picker ; sélectionner un exercice le ramène en chip ; « créer un nouvel exercice » depuis le picker le ramène aussi.
  3. Ancrer le méso, démarrer la séance, ouvrir l'exercice : le bloc « Infos exercice » est replié ; déplié, il montre photos, variante, alternatives et les deux notes, sans aucun contrôle d'édition. Le chrono reste visible sans scroller quand le bloc est replié.
  4. Même écran depuis une séance issue d'un **programme** (pas d'un méso) : variante et alternatives viennent du `program_exercise`.
  5. Export XLSX du méso → réimport → la note de l'exercice est conservée.
