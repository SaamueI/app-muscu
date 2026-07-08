// Écran d'import générique (méso/programme) : explication du format, prompt
// LLM copiable, téléchargement de modèles, sélection de fichier.
// Les deux écrans concrets (mesocycles/import.tsx, programmes/import.tsx) ne
// font que fournir les textes/actions spécifiques à leur domaine.

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  explanation: string;
  // Construit le prompt à la demande (au clic sur « Copier ») : le catalogue
  // d'exercices injecté dans le prompt est chargé depuis la DB à ce moment-là,
  // pour ne pas ralentir l'ouverture de l'écran et rester toujours à jour.
  buildPrompt: () => Promise<string>;
  onDownloadXlsx: () => void;
  onDownloadCsv: () => void;
  pickAndImport: () => Promise<string | null>;
  onImported: (id: string) => void;
};

export default function ImportScreen({
  explanation,
  buildPrompt,
  onDownloadXlsx,
  onDownloadCsv,
  pickAndImport,
  onImported,
}: Props) {
  const [importing, setImporting] = useState(false);
  const [copying, setCopying] = useState(false);

  const handleCopyPrompt = async () => {
    if (copying) return;
    setCopying(true);
    try {
      // Laisse React peindre le spinner AVANT le travail lourd : la requête SQLite
      // de buildPrompt peut bloquer le thread JS, ce qui empêcherait sinon l'affichage
      // de l'indicateur. Deux frames suffisent à monter/peindre l'ActivityIndicator
      // (qui, une fois affiché, continue de tourner côté natif même si JS est bloqué).
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const prompt = await buildPrompt();
      await Clipboard.setStringAsync(prompt);
      Alert.alert('Copié', 'Le prompt a été copié dans le presse-papiers — colle-le dans ton LLM préféré avec ta demande.');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
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
        <Pressable
          style={[styles.button, styles.buttonPrimary, copying && styles.buttonDisabled]}
          onPress={handleCopyPrompt}
          disabled={copying}
        >
          {copying ? (
            <View style={styles.buttonRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.buttonPrimaryText}>Préparation du prompt…</Text>
            </View>
          ) : (
            <Text style={styles.buttonPrimaryText}>Copier le prompt pour un LLM</Text>
          )}
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
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonPrimary: { backgroundColor: '#007AFF' },
  buttonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  buttonSecondary: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  buttonSecondaryText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
});
