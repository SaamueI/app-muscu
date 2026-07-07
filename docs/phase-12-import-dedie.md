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
