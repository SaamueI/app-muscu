import { useRouter } from 'expo-router';

import ImportScreen from '../../src/components/ImportScreen';
import {
  downloadMesoTemplateCsv,
  downloadMesoTemplateXlsx,
  pickAndImportMesocycle,
} from '../../src/export/actions';
import { MESO_FORMAT_EXPLANATION, MESO_LLM_PROMPT } from '../../src/export/formatDoc';

export default function ImportMesocycleScreen() {
  const router = useRouter();

  return (
    <ImportScreen
      explanation={MESO_FORMAT_EXPLANATION}
      prompt={MESO_LLM_PROMPT}
      onDownloadXlsx={downloadMesoTemplateXlsx}
      onDownloadCsv={downloadMesoTemplateCsv}
      pickAndImport={pickAndImportMesocycle}
      onImported={(id) => router.replace(`/mesocycles/${id}`)}
    />
  );
}
