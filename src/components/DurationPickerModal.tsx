import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  confirmLabel?: string;
  // Durée proposée à l'ouverture (secondes)
  initialSeconds?: number;
  onConfirm: (seconds: number) => void;
  onClose: () => void;
};

const MAX_MIN = 99;

// Saisie d'une durée en minutes + secondes : champs numériques modifiables au clavier,
// et boutons − / + (1 min, 5 s) pour ajuster sans écrire. Réutilisé par le repos à la volée
// (écran exercice live) et par l'ajout d'un raccourci (presets-repos).
export default function DurationPickerModal({
  visible,
  title,
  confirmLabel = 'Valider',
  initialSeconds = 90,
  onConfirm,
  onClose,
}: Props) {
  const [min, setMin] = useState(0);
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setMin(Math.min(MAX_MIN, Math.floor(initialSeconds / 60)));
    setSec(initialSeconds % 60);
  }, [visible, initialSeconds]);

  const total = min * 60 + sec;

  const stepMin = (d: number) => setMin((m) => Math.max(0, Math.min(MAX_MIN, m + d)));

  // Les secondes avancent par pas de 5 et reportent sur les minutes (55 + 5 → 1:00).
  const stepSec = (d: number) => {
    const next = Math.max(0, Math.min(MAX_MIN * 60 + 55, total + d * 5));
    setMin(Math.floor(next / 60));
    setSec(next % 60);
  };

  const parse = (text: string, max: number) => {
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : Math.min(max, n);
  };

  const label = `${min}:${String(sec).padStart(2, '0')}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.total}>{label}</Text>

          <View style={styles.fieldsRow}>
            <Field
              caption="minutes"
              value={min}
              onMinus={() => stepMin(-1)}
              onPlus={() => stepMin(1)}
              onChangeText={(t) => setMin(parse(t, MAX_MIN))}
            />
            <Text style={styles.colon}>:</Text>
            <Field
              caption="secondes"
              value={sec}
              pad
              onMinus={() => stepSec(-1)}
              onPlus={() => stepSec(1)}
              onChangeText={(t) => setSec(parse(t, 59))}
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, total <= 0 && styles.btnDisabled]}
              disabled={total <= 0}
              onPress={() => onConfirm(total)}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  caption,
  value,
  pad,
  onMinus,
  onPlus,
  onChangeText,
}: {
  caption: string;
  value: number;
  pad?: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onChangeText: (t: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Pressable style={styles.stepBtn} onPress={onPlus} hitSlop={6}>
        <Text style={styles.stepText}>＋</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        value={pad ? String(value).padStart(2, '0') : String(value)}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={2}
      />
      <Pressable style={styles.stepBtn} onPress={onMinus} hitSlop={6}>
        <Text style={styles.stepText}>－</Text>
      </Pressable>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, gap: 16 },
  title: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', textAlign: 'center' },
  total: { fontSize: 40, fontWeight: '700', color: '#007AFF', textAlign: 'center' },
  fieldsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  colon: { fontSize: 32, fontWeight: '700', color: '#8E8E93', marginBottom: 22 },
  field: { alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 56, height: 44, borderRadius: 10, backgroundColor: '#F2F2F7',
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 22, color: '#007AFF', fontWeight: '600' },
  input: {
    width: 72, textAlign: 'center', fontSize: 28, fontWeight: '600', color: '#1C1C1E',
    borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 10, paddingVertical: 8,
  },
  caption: { fontSize: 12, color: '#8E8E93' },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  cancelBtn: { backgroundColor: '#F2F2F7' },
  cancelText: { color: '#1C1C1E', fontSize: 16, fontWeight: '600' },
  confirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
