import { Calendar, DateData } from 'react-native-calendars';
import { StyleSheet, Text, View } from 'react-native';

function pad(n: number) { return String(n).padStart(2, '0'); }

const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

function isoWeekToMonday(isoWeek: string): Date {
  const [yearStr, wStr] = isoWeek.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  const jan4 = new Date(year, 0, 4);
  const dow = (jan4.getDay() + 6) % 7; // Mon=0
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + (week - 1) * 7);
  return monday;
}

function dateToIsoWeek(d: Date): string {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const year = tmp.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const w = 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${year}-W${pad(w)}`;
}

function buildMarkedDates(isoWeek: string): Record<string, object> {
  const monday = isoWeekToMonday(isoWeek);
  const result: Record<string, object> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    result[key] = { color: '#007AFF', textColor: '#fff', startingDay: i === 0, endingDay: i === 6 };
  }
  return result;
}

function weekLabel(isoWeek: string): string {
  const monday = isoWeekToMonday(isoWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const [, wStr] = isoWeek.split('-W');
  const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `Sem. ${parseInt(wStr, 10)} · ${fmt(monday)} – ${fmt(sunday)}`;
}

type Props = {
  value: string; // "2026-W27"
  onChange: (value: string) => void;
};

export function WeekPickerField({ value, onChange }: Props) {
  const handleDayPress = (day: DateData) => {
    const [y, m, d] = day.dateString.split('-').map(Number);
    onChange(dateToIsoWeek(new Date(y, m - 1, d)));
  };

  return (
    <View>
      <Text style={styles.label}>{weekLabel(value)}</Text>
      <Calendar
        markingType="period"
        markedDates={buildMarkedDates(value)}
        onDayPress={handleDayPress}
        firstDay={1}
        theme={{
          todayTextColor: '#007AFF',
          arrowColor: '#007AFF',
          monthTextColor: '#111',
          textMonthFontWeight: '700',
          textDayFontSize: 14,
          textMonthFontSize: 15,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
    marginBottom: 6,
  },
});
