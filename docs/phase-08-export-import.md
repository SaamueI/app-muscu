# Phase 08 — Export / import XLSX

> Notes d'architecture (état final). Contenu déplacé de `CLAUDE.md` pour garder ce dernier concis — voir `CLAUDE.md` (section « Export / import XLSX ») pour le résumé et le pointeur ici.

Export et import de **mésocycles** et **programmes** en `.xlsx` stylisé (`xlsx-js-style`). Deux formats **distincts et non mélangeables** : l'onglet *Méta* porte `type` = `mesocycle` | `programme`, lu à l'import pour router / refuser un mauvais fichier.

**Couches** (`src/export/`) :
- `core/` — **pur**, testable sous Node (`npm run test:export:meso` / `test:export:program`). Round-trip sans perte vérifié.
- `db/` — `loadXForExport` (DB → pivot) et `importX` (pivot → DB : **régénère tous les IDs**, crée un exo custom minimal si le nom est absent, reconstruit les `supersetGroupId` depuis des étiquettes A/B).
- `fileIO.ts` / `actions.ts` — **nouvelle** API `expo-file-system` (SDK 54 : `import { File, Paths } from 'expo-file-system'`), `expo-sharing`, et `StorageAccessFramework` (`expo-file-system/legacy`) pour « Enregistrer dans un dossier » sur Android.

**Format de fichier** : onglet *Méta* (clé/valeur + légende) + onglet de données. Mésocycle = 1 ligne / série ; programme = 1 ligne / exercice (objectifs agrégés). En-têtes colorés **obligatoire (ambre) / optionnel (ardoise)**, lignes teintées par couleur de séance. **Import lu par nom d'en-tête** (robuste au style) ; colonnes techniques `_ordreSeance` / `_ordreExo` / `_couleur` masquées. Clé de regroupement méso = `(semaine, ordre)` car `order` est réinitialisé par semaine.

**UI** : bouton « Exporter (Excel) » sur les écrans détail méso/programme ; import déplacé vers des écrans dédiés en phase 12 (voir [phase-12-import-dedie.md](phase-12-import-dedie.md)).

**Limite connue** : import non transactionnel (validation faite au parse, avant tout écrit).

**Deps ajoutées** : `xlsx-js-style`, `expo-file-system`, `expo-document-picker`, `expo-sharing` ; dev : `tsx`.
