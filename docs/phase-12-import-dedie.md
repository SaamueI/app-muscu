# Phase 12 — Écrans d'import dédiés + prompt LLM + import CSV

> Document d'implémentation destiné à l'agent qui réalisera la phase.
> Lire `CLAUDE.md` (section « Export / import XLSX (phase 8) ») et parcourir `src/export/` avant de commencer — toute la logique d'import existe déjà, cette phase est surtout de l'UI + un format d'entrée supplémentaire.

## Objectif

1. **Déplacer** les boutons « Importer » des headers des onglets (`app/(tabs)/programmes.tsx`, `app/(tabs)/mesocycle.tsx`) vers les écrans de création (`app/programmes/nouveau.tsx`, `app/mesocycles/nouveau.tsx`).
2. Créer deux **écrans d'import dédiés** : `app/programmes/import.tsx` et `app/mesocycles/import.tsx`.
3. Y intégrer une **explication précise du format attendu**, avec un bouton **« Copier »** qui met dans le presse-papiers un prompt complet destiné à un LLM (pour qu'il génère un fichier importable).
4. Ajouter l'**import `.csv`** en plus du `.xlsx`.
5. Proposer des **templates à télécharger** (XLSX et CSV, méso et programme) depuis les écrans d'import.

Aucune migration DB.

## Étape 1 — Déplacement des boutons

- Supprimer le bouton « Importer » du `headerLeft` des deux onglets (chercher `pickAndImport` dans `app/(tabs)/`).
- Dans `programmes/nouveau.tsx` et `mesocycles/nouveau.tsx`, ajouter une entrée « Importer depuis un fichier » qui route vers l'écran d'import correspondant.

## Étape 2 — Écrans d'import

Structure de chaque écran (`import.tsx`) :

- Explication du format (voir étape 3).
- Bouton « Copier le prompt pour un LLM » → `expo-clipboard` (`npx expo install expo-clipboard` — vérifier compat SDK 54).
- Bouton « Choisir un fichier » → appelle `pickAndImportMesocycle()` / `pickAndImportProgram()` de `src/export/actions.ts` puis, si un id est retourné, `router.replace` vers l'écran détail de l'objet créé (comportement identique à l'actuel dans les onglets).
- Enregistrer les routes dans le layout adéquat (suivre le pattern des routes existantes du dossier ; pas besoin de modal).

## Étape 3 — Explication du format + prompt LLM

- La source de vérité du format est `src/export/core/` : `mesoTypes.ts` / `programTypes.ts` (pivot), `mesoXlsx.ts` / `programXlsx.ts` (noms d'en-têtes, onglet Méta). **Dériver l'explication de ces fichiers, ne rien inventer.**
- Points que l'explication (et le prompt) doivent couvrir :
  - deux formats distincts (mésocycle : 1 ligne/série ; programme : 1 ligne/exercice), non mélangeables ;
  - onglet *Méta* avec `type = mesocycle | programme` (pour XLSX) ;
  - la liste exacte des en-têtes de colonnes, obligatoires vs optionnels ;
  - conventions : tempo `"3-1-1-0"`, repos/durée en `mm:ss` ou secondes, étiquettes superset `A`/`B`…, exercices matchés par **nom** (un exo custom minimal est créé si le nom est inconnu — le dire dans le prompt pour que le LLM soigne les noms) ;
  - clé de regroupement méso `(semaine, ordre)`.
- Le prompt copié doit être **autonome** : instructions + format + exemple minimal de fichier valide, pour que l'utilisateur le colle dans un LLM avec sa demande (« génère-moi un méso de 4 semaines… »). Cibler la sortie **CSV** (un LLM ne peut pas produire un vrai .xlsx en chat) — d'où l'étape 4.
- Stocker ces textes dans `src/export/formatDoc.ts` (constantes), pas en dur dans les écrans, pour les partager entre méso et programme.

## Étape 4 — Import CSV

- `xlsx-js-style` (SheetJS) lit nativement le CSV : `XLSX.read(str, { type: 'string' })` produit un workbook à une feuille. La couche `core/` parse **par nom d'en-tête**, donc elle fonctionnera telle quelle une fois le workbook obtenu.
- À faire :
  1. `src/export/fileIO.ts` : étendre le picker (`pickXlsxBase64`) pour accepter aussi `text/csv` / `text/comma-separated-values` / extension `.csv`, et retourner de quoi distinguer le type (renommer en `pickImportFile` retournant `{ kind: 'xlsx' | 'csv', data }`). Lire le CSV en **texte UTF-8**, pas en base64.
  2. Problème de l'onglet *Méta* : un CSV n'a qu'une feuille. Décision tranchée : le CSV ne contient **que les données** (ligne d'en-têtes + lignes). Le `type` (méso vs programme) est imposé par l'écran d'où vient l'import (écran import méso → parse méso), et le **nom** de l'objet créé = nom du fichier sans extension (fallback « Import CSV »). Adapter `parse*` ou ajouter un wrapper `parse*Csv` dans `core/` qui construit le pivot avec ces métadonnées par défaut.
  3. Vérifier que l'import refuse proprement (message `Alert` clair) : mauvais en-têtes obligatoires, CSV vide, fichier XLSX passé à l'écran opposé (le contrôle `type` de l'onglet Méta existe déjà pour XLSX — le conserver).
- **Encodage/séparateur** : Excel français exporte en `;` et parfois latin-1. SheetJS auto-détecte le séparateur `;`/`,`/tab en mode string. Pour l'encodage, documenter la limite (UTF-8 requis) dans l'explication du format plutôt que d'essayer de détecter le latin-1.
- Ajouter un script de test Node `scripts/testCsvImport.ts` (pattern des tests existants, `tsx`) : round-trip pivot → CSV → parse → pivot au minimum pour le méso.

## Étape 5 — Templates téléchargeables

Sur chaque écran d'import, deux boutons « Télécharger le modèle (Excel) » et « Télécharger le modèle (CSV) ».

- **Ne pas embarquer de fichiers statiques** : générer les templates à la volée à partir d'un **pivot d'exemple** défini en code, pour qu'ils restent automatiquement synchrones avec le format.
  - Définir dans `src/export/core/` (p.ex. `sampleData.ts`) un mini-méso d'exemple (1 semaine, 2 séances, dont un superset A/B et un exercice unilatéral, tempo et repos remplis) et un mini-programme équivalent. Fichier **pur** (pas d'imports RN).
  - Template XLSX : passer ce pivot aux `build*` existants de `core/` (mêmes styles/légende que l'export normal), puis partager/enregistrer via le flux d'export existant (`shareExportFile` / `saveExportFile` de `fileIO.ts`).
  - Template CSV : sérialiser le même pivot en CSV (en-têtes + lignes d'exemple) — réutiliser la logique d'en-têtes de l'étape 4 pour garantir que le template repasse tel quel à l'import. `fileIO.ts` devra savoir écrire/partager un fichier **texte** en plus du base64 XLSX (petite extension de `saveExportFile`/`shareExportFile`).
- **Test d'auto-cohérence** (dans le script de test Node) : chaque template généré doit se réimporter sans erreur (template XLSX → `parse*`, template CSV → `parse*Csv`). C'est le garde-fou contre la dérive format/doc/template.
- L'explication de l'étape 3 doit mentionner les templates (« téléchargez le modèle, remplissez-le ou donnez-le au LLM avec le prompt »).

## Pièges connus

- L'import est **non transactionnel** (limite connue de la phase 8) : ne pas régresser, la validation doit rester entièrement au parse, avant toute écriture DB.
- `core/` doit rester **pur** (testable sous Node, aucun import react-native / expo).
- `importX` régénère tous les IDs et reconstruit les `supersetGroupId` depuis les étiquettes — ne pas dupliquer cette logique pour le CSV, réutiliser le même chemin pivot → DB.
- Ne pas casser l'import XLSX existant (les deux formats passent par les mêmes écrans).

## Critères d'acceptation

- [ ] Plus de bouton « Importer » dans les headers d'onglets ; accessible depuis `nouveau.tsx` des deux domaines.
- [ ] Écrans d'import avec explication lisible + bouton copier fonctionnel (prompt complet dans le presse-papiers).
- [ ] Un CSV généré en suivant le prompt s'importe et produit un méso/programme correct (supersets, tempo, mm:ss compris).
- [ ] Un XLSX existant s'importe toujours depuis les nouveaux écrans.
- [ ] Les 4 templates (méso/programme × XLSX/CSV) se téléchargent et se réimportent tels quels sans erreur.
- [ ] Mauvais fichier → message d'erreur clair, aucune écriture partielle en DB.
- [ ] Tests Node verts (CSV + auto-cohérence des templates), scripts ajoutés au package.json.

## Notes d'implémentation (état final)

> Contenu déplacé de `CLAUDE.md` pour garder ce dernier concis.

Le bouton « Importer » a quitté les headers d'onglets : il vit désormais dans les écrans de création (`programmes/nouveau.tsx`, `mesocycles/nouveau.tsx`, lien « Importer depuis un fichier ») et pointe vers deux écrans dédiés `app/programmes/import.tsx` / `app/mesocycles/import.tsx`, tous deux de simples wrappers autour du composant partagé `src/components/ImportScreen.tsx`.

**Format CSV ajouté en plus du XLSX** (`src/export/core/mesoCsv.ts` / `programCsv.ts`, `mesoToCsv`/`parseMesoCsv`, `programToCsv`/`parseProgramCsv`) :
- Contrairement au XLSX, le CSV n'a qu'une seule feuille : pas d'onglet *Méta*, pas de colonnes techniques `_ordreSeance`/`_ordreExo`/`_couleur`. Le `type` (méso vs programme) est imposé par l'écran d'où vient l'import, pas par le fichier ; le **nom** de l'objet créé = nom du fichier sans extension (passé en paramètre `importName` aux `parse*Csv`).
- L'ordre des séances/exercices est déduit de **blocs contigus de lignes** partageant la même clé (semaine+séance+jour pour le méso, séance+jour pour le programme) — donc toutes les lignes d'une même séance doivent se suivre dans le fichier. La couleur de séance (absente du CSV) est auto-assignée depuis `SESSION_COLORS` (`core/style.ts`), stable par nom de séance.
- Réutilise les validations existantes du XLSX plutôt que de les dupliquer : `rowToSet`/`validateSet` (exportés de `mesoXlsx.ts`) et `rowToTargets`/`validateTargets` (exportés de `programXlsx.ts`).
- Lecture via `core/csv.ts` (`readCsvSheet` = `XLSX.read(text, {type:'string'})`, auto-détection du séparateur `,`/`;`/tab ; UTF-8 requis, non détecté/converti si le fichier est en latin-1).

**Templates téléchargeables** (méso/programme × XLSX/CSV) générés à la volée depuis un pivot d'exemple pur (`core/sampleData.ts`, `SAMPLE_MESOCYCLE`/`SAMPLE_PROGRAM`) — jamais de fichier statique embarqué, donc toujours synchrones avec le format. `index.ts` : `buildMesoTemplateFile`/`buildMesoTemplateCsv`/`buildProgramTemplateFile`/`buildProgramTemplateCsv`.

**Prompt LLM copiable** (`src/export/formatDoc.ts`) : `MESO_FORMAT_EXPLANATION`/`PROGRAM_FORMAT_EXPLANATION` et `buildMesoLlmPrompt(catalogNames)`/`buildProgramLlmPrompt(catalogNames)` sont générés dynamiquement à partir des colonnes réelles (`MESO_CSV_COLS`/`PROGRAM_CSV_COLS`) et de l'exemple CSV du pivot d'exemple (`mesoToCsv(SAMPLE_MESOCYCLE)`) — jamais de texte inventé à la main, donc jamais désynchronisé du parseur. Le prompt cible une sortie **CSV** (un LLM ne peut pas produire un vrai `.xlsx` en chat). Le catalogue d'exercices injecté (solution 1 ci-dessous) est chargé **à la demande** au clic sur « Copier » (`ImportScreen` prop `buildPrompt: () => Promise<string>`, état de chargement sur le bouton) — pas au montage, pour ne pas ralentir l'ouverture de l'écran et garder le catalogue à jour.

**fileIO.ts** : `pickImportFile()` (remplace `pickXlsxBase64`) détecte `.xlsx` vs `.csv` par extension du nom de fichier et renvoie `{kind, base64|text, baseName}`. Ajout de `shareTextFile`/`saveTextFile`, symétriques de `shareExportFile`/`saveExportFile` pour du texte brut (CSV, encodage UTF-8 par défaut de `File.write`/`writeAsStringAsync`, pas de base64).

**actions.ts** : `pickAndImportMesocycle`/`pickAndImportProgram` branchent sur `kind` (`csv` → `importMesocycleCsv`/`importProgramCsv`, `xlsx` → chemin existant). Logique Partager/Enregistrer factorisée dans `shareOrSaveFlow`, réutilisée par l'export existant et les 4 actions `download*Template*`.

**Limite connue inchangée** : import toujours non transactionnel (validation au parse, avant tout écrit en DB) — le CSV réutilise le même chemin pivot → DB (`importMesocycle`/`importProgram`) que le XLSX.

**Tests** : `npm run test:import:csv` (`scripts/testCsvImport.ts`) — round-trip pivot→CSV→parse (méso+programme), auto-cohérence des 4 templates (round-trip exact pour XLSX, ré-import sans erreur pour CSV), rejets (CSV vide, en-têtes obligatoires manquantes).

### Anti-doublons d'exercices personnalisés (solutions 1 & 2)

Problème : un nom d'exercice absent du catalogue crée un exercice personnalisé (`resolveExercise` dans `db/mesoDb.ts`/`programDb.ts`) → prolifération de doublons, aggravée par le fait que le catalogue de base (dataset free-exercise-db, 873 exos) est en **anglais** alors que l'utilisateur saisit souvent en **français**.

**Solution 1 — prévention (prompt LLM enrichi)** : le prompt copiable inclut le catalogue réel des exercices existants. `formatDoc.ts` expose `buildMesoLlmPrompt(catalogNames)`/`buildProgramLlmPrompt(catalogNames)`. `db/catalog.ts` → `loadExerciseCatalog()` (noms dédupliqués/triés, custom + dataset), réexporté par `export/index.ts`. Les écrans `mesocycles/import.tsx`/`programmes/import.tsx` passent `buildPrompt={async () => buildXLlmPrompt(await loadExerciseCatalog())}` à `ImportScreen`, qui charge le catalogue **au clic sur « Copier »** (pas au montage — l'écran s'ouvre instantanément, spinner sur le bouton pendant la préparation). Section injectée uniquement dans le prompt, pas dans l'explication à l'écran.

**Solution 2 — filet de sécurité (réconciliation post-import)** : après un import, l'écran de détail affiche une bannière (`src/components/ImportReconcileBanner.tsx`) « N nouveaux exercices — vérifier les doublons ? » → écran `app/exercices/reconcilier.tsx` (générique méso/programme, route modale).
- **Capture** : `importMesocycle`/`importProgram` retournent désormais `{ id, createdExercises: {id,name}[] }` (type `core/importResult.ts`) — pas de `createdAt` sur `exercises`, donc capture obligatoire pendant l'import. Répercuté dans `export/index.ts` (4 fns import) et `export/actions.ts`, qui remplit `src/utils/importReconcileStore.ts` (store module-level, patron `altPickerStore`).
- **Matching** : `src/export/core/exerciseMatch.ts` (PUR, `npm run test:match`) — `suggestMatches(name, catalog)` combine un lexique FR→EN par mots (`FR_EN_LEXICON` + `FR_EN_PHRASES` pour les idiomes où le mot-à-mot échoue, ex. `tirage visage → face pull`, `soulevé de terre → deadlift`) traduit en tokens, un score Jaccard, et un ratio Levenshtein (fautes de frappe même langue). Enrichir ces deux tables quand une saisie FR courante ne matche pas. Jamais de fusion auto : suggestions confirmées par l'utilisateur, avec repli recherche manuelle via `ExercisePicker` (dans un `<Modal>`).
- **Application différée** : les choix (remplacer / garder / variante) restent en état LOCAL (`Decision` par item) jusqu'au bouton « Terminer » — rien n'est écrit en DB avant. C'est ce qui rend « Annuler » sûr (sinon `remapExercise` aurait déjà supprimé le custom). Chaque carte a un bouton Annuler qui revient à l'état « en attente ».
- **Variante** : après un remplacement, bouton « Variante » → modal listant les `variations` de la cible + saisie libre ; stocké dans `Decision.variation`, écrit via `remapExercise(..., variation)` sur `selectedVariation` des lignes template.
- **Voir le détail** : appui long sur une puce de suggestion → menu `Alert` « Afficher l'exercice » → `push('/exercices/[id]')` (bouton « Afficher » aussi sur une carte déjà remplacée).
- **Remap** : `src/db/exerciseMerge.ts` → `remapExercise(fromId, toId, variation?)` réassigne `meso_exercises`/`program_exercises`/`exercise_logs` (colonne `exercise_id` **et** tableaux JSON `alternativeExerciseIds`) — et `selectedVariation` sur les lignes template si `variation` fourni — puis supprime le custom. Garde-fou : refuse si `fromId` n'est pas `isCustom`. FK `exercise_id` sans `onDelete` → réassignation obligatoire avant `DELETE` (sinon contrainte FK).
