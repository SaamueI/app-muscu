import { StyleSheet, Text } from 'react-native';

// Note d'une série (set_logs.note) : sous-ligne italique grise affichée sous la ligne
// de la série, partout où une série est listée. Ne rend rien si la note est vide.
export default function SetNote({ note }: { note: string | null | undefined }) {
  if (!note) return null;
  return <Text style={styles.note}>{note}</Text>;
}

const styles = StyleSheet.create({
  note: { fontSize: 13, color: '#8E8E93', fontStyle: 'italic' },
});
