import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { setLogs } from '../../db/schema';
import { formatSetLine } from '../../utils/formatSetLine';
import SetNote from '../SetNote';

type SetLogRow = typeof setLogs.$inferSelect;

type Props = {
  setLogs: SetLogRow[];
  weightUnit: 'kg' | 'lb';
  // Côté de départ des séries unilatérales : affiché en premier (réglage Paramètres)
  firstSide: 'L' | 'R';
  // Sans callbacks, la liste est en lecture seule (historique)
  onEdit?: (setLog: SetLogRow) => void;
  onDelete?: (setLogsOfSet: SetLogRow[], setNumber: number) => void;
  // Série « à encoder » (amélioration 01b) : un tap ouvre sa saisie, le ⋮ garde le menu
  onEncode?: (setLog: SetLogRow) => void;
};

// Regroupe les lignes par numéro de série ; dans chaque groupe, le côté de départ
// passe en premier (G+D en unilatéral, une seule ligne en bilatéral).
function groupBySet(rows: SetLogRow[], firstSide: 'L' | 'R') {
  const byNumber = new Map<number, SetLogRow[]>();
  rows.forEach((r, i) => {
    const n = r.setNumber ?? i + 1;
    byNumber.set(n, [...(byNumber.get(n) ?? []), r]);
  });
  const rank = (r: SetLogRow) => (r.side == null ? 0 : r.side === firstSide ? 1 : 2);
  return [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([setNumber, group]) => ({ setNumber, rows: [...group].sort((a, b) => rank(a) - rank(b)) }));
}

const sideLetter = (side: string | null) => (side === 'L' ? 'G : ' : side === 'R' ? 'D : ' : '');

export default function SetLogList({ setLogs: rows, weightUnit, firstSide, onEdit, onDelete, onEncode }: Props) {
  const editable = onEdit != null && onDelete != null;

  const openMenu = (setNumber: number, group: SetLogRow[]) => {
    const edit = () => {
      if (group.length === 1) {
        onEdit!(group[0]);
        return;
      }
      // Unilatéral (G et D enregistrés) : on choisit le côté, le côté de départ d'abord
      Alert.alert(`Modifier la série #${setNumber}`, undefined, [
        ...group.map((r) => ({
          text: r.side === 'L' ? 'Gauche' : 'Droite',
          onPress: () => onEdit!(r),
        })),
        { text: 'Annuler', style: 'cancel' as const },
      ]);
    };
    Alert.alert(`Série #${setNumber}`, undefined, [
      { text: 'Modifier', onPress: edit },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete!(group, setNumber) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  return (
    <>
      {groupBySet(rows, firstSide).map(({ setNumber, rows: group }) => {
        const pending = group.find((r) => r.isPending) ?? null;
        const encodeOnTap = editable && pending != null && onEncode != null;
        const content = (
          <>
            <Text style={styles.setNum}>#{setNumber}</Text>
            <View style={styles.setDetails}>
              {group.map((r, idx) => (
                <View key={r.id}>
                  <Text style={[styles.setLine, idx > 0 && styles.setLineSub, r.isPending && styles.setLinePending]}>
                    {sideLetter(r.side)}
                    {formatSetLine(r, weightUnit)}
                  </Text>
                  <SetNote note={r.note} />
                </View>
              ))}
            </View>
            {editable &&
              (encodeOnTap ? (
                // Le tap sur la ligne encode ; le ⋮ ouvre le menu (Modifier / Supprimer)
                <Pressable hitSlop={10} onPress={() => openMenu(setNumber, group)}>
                  <Text style={styles.editHint}>⋮</Text>
                </Pressable>
              ) : (
                <Text style={styles.editHint}>⋮</Text>
              ))}
          </>
        );
        return editable ? (
          <Pressable
            key={setNumber}
            style={styles.setRow}
            onPress={() => (encodeOnTap ? onEncode!(pending!) : openMenu(setNumber, group))}
          >
            {content}
          </Pressable>
        ) : (
          <View key={setNumber} style={styles.setRow}>
            {content}
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93', minWidth: 28 },
  setDetails: { flex: 1, gap: 2 },
  setLine: { fontSize: 15, color: '#1C1C1E' },
  setLineSub: { fontSize: 13, color: '#8E8E93' },
  setLinePending: { color: '#C77700' },
  editHint: { fontSize: 16, color: '#C7C7CC', paddingHorizontal: 4 },
});
