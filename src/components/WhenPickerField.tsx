import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DatePickerField } from './DatePickerField';
import { WeekPickerField } from './WeekPickerField';

type EventMode = 'dated' | 'undated';

type Props = {
  mode: EventMode;
  onModeChange: (mode: EventMode) => void;
  date: Date | null;
  onDateChange: (d: Date) => void;
  week: string;
  onWeekChange: (w: string) => void;
};

// Bloc "Quand" partagé entre création et modification d'un événement calendrier :
// choix du mode (date précise / sans date fixe) puis le picker correspondant.
export function WhenPickerField({ mode, onModeChange, date, onDateChange, week, onWeekChange }: Props) {
  return (
    <>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeCard, mode === 'dated' && styles.modeCardActive]}
          onPress={() => onModeChange('dated')}
        >
          <Text style={[styles.modeCardTitle, mode === 'dated' && styles.modeCardTitleActive]}>
            Date précise
          </Text>
          <Text style={[styles.modeCardSub, mode === 'dated' && styles.modeCardSubActive]}>
            Événement un jour donné
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeCard, mode === 'undated' && styles.modeCardActive]}
          onPress={() => onModeChange('undated')}
        >
          <Text style={[styles.modeCardTitle, mode === 'undated' && styles.modeCardTitleActive]}>
            Sans date fixe
          </Text>
          <Text style={[styles.modeCardSub, mode === 'undated' && styles.modeCardSubActive]}>
            Planifié à la semaine
          </Text>
        </Pressable>
      </View>

      <View style={styles.pickerRow}>
        {mode === 'dated' ? (
          <DatePickerField value={date} onChange={onDateChange} />
        ) : (
          <WeekPickerField value={week} onChange={onWeekChange} />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: 10 },
  modeCard: {
    flex: 1, borderRadius: 10, padding: 12, alignItems: 'center',
    backgroundColor: '#f5f5f5', borderWidth: 2, borderColor: 'transparent',
  },
  modeCardActive: { borderColor: '#007AFF', backgroundColor: '#EBF3FF' },
  modeCardTitle: { fontSize: 14, fontWeight: '700', color: '#444', marginBottom: 3 },
  modeCardTitleActive: { color: '#007AFF' },
  modeCardSub: { fontSize: 11, color: '#999', textAlign: 'center' },
  modeCardSubActive: { color: '#5b9cf6' },

  pickerRow: { marginTop: 12 },
});
