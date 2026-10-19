import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  // Variantes du catalogue pour cet exercice
  variations: string[];
  // Variante actuelle (null = aucune)
  current: string | null;
  onSelect: (variation: string | null) => void;
  // Ajoute la valeur au catalogue de l'exercice ET la sélectionne
  onCreate: (variation: string) => void;
  onClose: () => void;
};

// Sélecteur de la variante réellement faite pendant la séance (amélioration 14).
// Réutilisable par l'écran superset (plan 01).
export default function VariationPickerModal({
  visible,
  variations,
  current,
  onSelect,
  onCreate,
  onClose,
}: Props) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    onCreate(v);
  };

  // Une variante actuelle hors catalogue (import, ancien plan) reste proposée
  const options = current && !variations.includes(current) ? [...variations, current] : variations;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Variante de la séance</Text>
          <View style={styles.chips}>
            <Pressable
              style={[styles.chip, current == null && styles.chipActive]}
              onPress={() => onSelect(null)}
            >
              <Text style={[styles.chipText, current == null && styles.chipTextActive]}>Aucune</Text>
            </Pressable>
            {options.map((v) => (
              <Pressable
                key={v}
                style={[styles.chip, current === v && styles.chipActive]}
                onPress={() => onSelect(v)}
              >
                <Text style={[styles.chipText, current === v && styles.chipTextActive]}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>+ Nouvelle variante</Text>
          <View style={styles.newRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ex : prise neutre, unilatéral…"
              placeholderTextColor="#C7C7CC"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Pressable
              style={[styles.addBtn, !draft.trim() && styles.addBtnDisabled]}
              disabled={!draft.trim()}
              onPress={submit}
            >
              <Text style={styles.addBtnText}>Ajouter</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>
            Seule cette séance change : le plan reste tel quel. La nouvelle variante est aussi ajoutée à la
            fiche de l'exercice.
          </Text>

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Fermer</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7' },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  chipTextActive: { color: '#FFFFFF' },
  label: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginTop: 4 },
  newRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    color: '#1C1C1E',
  },
  addBtn: { backgroundColor: '#007AFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 12, color: '#8E8E93', lineHeight: 17 },
  closeBtn: { alignItems: 'center', paddingVertical: 6 },
  closeText: { color: '#007AFF', fontSize: 16 },
});
