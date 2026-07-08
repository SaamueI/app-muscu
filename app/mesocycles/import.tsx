import { useRouter } from 'expo-router';

import ImportScreen from '../../src/components/ImportScreen';
import {
  downloadMesoTemplateCsv,
  downloadMesoTemplateXlsx,
  pickAndImportMesocycle,
} from '../../src/export/actions';
import { loadExerciseCatalog } from '../../src/export/index';
import { buildMesoLlmPrompt, MESO_FORMAT_EXPLANATION } from '../../src/export/formatDoc';

export default function ImportMesocycleScreen() {
  const router = useRouter();

  return (
    <ImportScreen
      explanation={MESO_FORMAT_EXPLANATION}
      // Catalogue chargé à la demande (au clic sur « Copier »), pas au montage :
      // l'écran s'ouvre instantanément et le prompt reste toujours à jour.
      buildPrompt={async () => buildMesoLlmPrompt(await loadExerciseCatalog())}
      onDownloadXlsx={downloadMesoTemplateXlsx}
      onDownloadCsv={downloadMesoTemplateCsv}
      pickAndImport={pickAndImportMesocycle}
      onImported={(id) => router.replace(`/mesocycles/${id}`)}
    />
  );
}
