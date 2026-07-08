import { useRouter } from 'expo-router';

import ImportScreen from '../../src/components/ImportScreen';
import {
  downloadProgramTemplateCsv,
  downloadProgramTemplateXlsx,
  pickAndImportProgram,
} from '../../src/export/actions';
import { PROGRAM_FORMAT_EXPLANATION, PROGRAM_LLM_PROMPT } from '../../src/export/formatDoc';

export default function ImportProgramScreen() {
  const router = useRouter();

  return (
    <ImportScreen
      explanation={PROGRAM_FORMAT_EXPLANATION}
      prompt={PROGRAM_LLM_PROMPT}
      onDownloadXlsx={downloadProgramTemplateXlsx}
      onDownloadCsv={downloadProgramTemplateCsv}
      pickAndImport={pickAndImportProgram}
      onImported={(id) => router.replace(`/programmes/${id}`)}
    />
  );
}
