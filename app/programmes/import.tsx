import { useRouter } from 'expo-router';

import ImportScreen from '../../src/components/ImportScreen';
import {
  downloadProgramTemplateCsv,
  downloadProgramTemplateXlsx,
  pickAndImportProgram,
} from '../../src/export/actions';
import { loadExerciseCatalog } from '../../src/export/index';
import { buildProgramLlmPrompt, PROGRAM_FORMAT_EXPLANATION } from '../../src/export/formatDoc';

export default function ImportProgramScreen() {
  const router = useRouter();

  return (
    <ImportScreen
      explanation={PROGRAM_FORMAT_EXPLANATION}
      // Catalogue chargé à la demande (au clic sur « Copier »), pas au montage :
      // l'écran s'ouvre instantanément et le prompt reste toujours à jour.
      buildPrompt={async () => buildProgramLlmPrompt(await loadExerciseCatalog())}
      onDownloadXlsx={downloadProgramTemplateXlsx}
      onDownloadCsv={downloadProgramTemplateCsv}
      pickAndImport={pickAndImportProgram}
      onImported={(id) => router.replace(`/programmes/${id}`)}
    />
  );
}
