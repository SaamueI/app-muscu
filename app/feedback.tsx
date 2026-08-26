import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { buildDiagnostics, sendFeedback } from '../src/utils/feedback';

type Kind = 'bug' | 'suggestion';

const COPY: Record<Kind, { title: string; placeholder: string }> = {
  bug: {
    title: 'Signaler un bug',
    placeholder: "Qu'est-ce qui ne fonctionne pas ? Que faisais-tu quand c'est arrivé ?",
  },
  suggestion: {
    title: 'Envoyer une suggestion',
    placeholder: "Qu'aimerais-tu voir dans l'app ? Pourquoi ?",
  },
};

export default function FeedbackScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind: string }>();
  const kind: Kind = kindParam === 'suggestion' ? 'suggestion' : 'bug';
  const copy = COPY[kind];
  const router = useRouter();

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const ok = await sendFeedback(kind, message);
    setSending(false);

    if (ok) {
      Alert.alert('Envoyé', 'Merci pour ton retour !');
      router.back();
    } else {
      Alert.alert(
        'Envoi impossible',
        "Vérifie ta connexion internet et réessaie. Ton message n'a pas été perdu.",
        [
          { text: 'Copier le message', onPress: () => Clipboard.setStringAsync(message) },
          { text: 'OK' },
        ]
      );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.section}>
          <Text style={styles.label}>{copy.title}</Text>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder={copy.placeholder}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            autoFocus
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.diagnosticsLabel}>
            Envoyé automatiquement avec ton message — aucune donnée d'entraînement :
          </Text>
          <Text style={styles.diagnostics}>{buildDiagnostics()}</Text>
        </View>

        <Pressable
          style={[styles.sendBtn, (!message.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!message.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Envoyer</Text>}
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  label: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa', minHeight: 140,
  },

  diagnosticsLabel: { fontSize: 12, color: '#aaa', marginBottom: 6 },
  diagnostics: { fontSize: 12, color: '#999', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },

  sendBtn: {
    backgroundColor: '#007AFF', marginHorizontal: 12, marginTop: 16,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
