// Écran d'import générique (méso/programme) : explication du format, prompt
// LLM copiable, téléchargement de modèles, sélection de fichier.
// Les deux écrans concrets (mesocycles/import.tsx, programmes/import.tsx) ne
// font que fournir les textes/actions spécifiques à leur domaine.

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  explanation: string;
  prompt: string;
  onDownloadXlsx: () => void;
  onDownloadCsv: () => void;
  pickAndImport: () => Promise<string | null>;
  onImported: (id: string) => void;
};

export default function ImportScreen({
  explanation,
  prompt,
  onDownloadXlsx,
  onDownloadCsv,
  pickAndImport,
  onImported,
}: Props) {
  const [importing, setImporting] = useState(false);

  const handleCopyPrompt = async () => {
    await Clipboard.setStringAsync(prompt);
    Alert.alert('Copié', 'Le prompt a été copié dans le presse-papiers — colle-le dans ton LLM préféré avec ta demande.');
  };

  const handlePick = async () => {
    if (importing) return;
    setImporting(true);
    const id = await pickAndImport();
    setImporting(false);
    if (id) onImported(id);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Format attendu</Text>
        <Text style={styles.explanation}>{explanation}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Générer un fichier avec un LLM</Text>
        <Text style={styles.hint}>
          Copie ce prompt, colle-le dans un assistant (ChatGPT, Claude…) avec ta demande, puis
          importe le fichier .csv qu'il te renvoie.
        </Text>
        <Text style={styles.tip}>
          Conseil : joins aussi le modèle CSV téléchargé ci-dessous à ta conversation avec le LLM,
          en plus de ce prompt — ça l'aide à respecter le format exact. Privilégie toujours le CSV,
          un LLM sait rarement produire un vrai fichier Excel.
        </Text>
        <Pressable style={[styles.button, styles.buttonPrimary]} onPress={handleCopyPrompt}>
          <Text style={styles.buttonPrimaryText}>Copier le prompt pour un LLM</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ou partir d'un modèle</Text>
        <View style={styles.row}>
          <Pressable style={[styles.button, styles.buttonSecondary, styles.rowButton]} onPress={onDownloadXlsx}>
            <Text style={styles.buttonSecondaryText}>Modèle Excel</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.buttonSecondary, styles.rowButton]} onPress={onDownloadCsv}>
            <Text style={styles.buttonSecondaryText}>Modèle CSV</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.button, styles.buttonPrimary, importing && styles.buttonDisabled]}
        onPress={handlePick}
        disabled={importing}
      >
        <Text style={styles.buttonPrimaryText}>
          {importing ? 'Import…' : 'Choisir un fichier (.xlsx ou .csv)'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 12, paddingBottom: 40, gap: 12 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase' },
  explanation: { fontSize: 13, color: '#333', lineHeight: 19 },
  hint: { fontSize: 13, color: '#888', lineHeight: 18 },
  tip: { fontSize: 12, color: '#B45309', lineHeight: 17, fontStyle: 'italic' },

  row: { flexDirection: 'row', gap: 8 },
  rowButton: { flex: 1 },

  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonPrimary: { backgroundColor: '#007AFF' },
  buttonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonSecondary: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  buttonSecondaryText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
});
