import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

function pad(n: number) { return String(n).padStart(2, '0'); }

type Props = {
  value: Date | null;
  onChange: (date: Date) => void;
};

export function DatePickerField({ value, onChange }: Props) {
  const [show, setShow] = useState(false);

  const formatted = value
    ? `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`
    : 'JJ/MM/AAAA';

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (event.type === 'set' && selected) onChange(selected);
  };

  return (
    <>
      <Pressable style={styles.button} onPress={() => setShow(true)}>
        <Text style={[styles.text, !value && styles.placeholder]}>{formatted}</Text>
      </Pressable>

      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide">
          <Pressable style={styles.overlay} onPress={() => setShow(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setShow(false)}>
                <Text style={styles.doneBtn}>Valider</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={value ?? new Date()}
              mode="date"
              display="spinner"
              onChange={handleChange}
              locale="fr-FR"
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafafa',
  },
  text: { fontSize: 17, fontWeight: '600', color: '#111' },
  placeholder: { color: '#bbb' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  doneBtn: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
});
