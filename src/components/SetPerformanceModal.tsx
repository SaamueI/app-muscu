import type { ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import type { SetLogData } from '../db/session';
import SetPerformanceForm from './SetPerformanceForm';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (data: SetLogData) => void;
  weightUnit: 'kg' | 'lb';
  exerciseId: string;
  // Superset : « Tirage horizontal — Série 2 (Gauche) » (sinon « Série 2 (Gauche) »)
  exerciseName?: string;
  setNumber: number;
  side?: 'L' | 'R' | null;
  prefillWeightKg?: number | null;
  prefillReps?: number | null;
  prefillRir?: number | null;
  prefillPartialReps?: number | null;
  prefillPdc?: boolean;
  // Remplie uniquement en édition : une nouvelle série ne reprend pas la note de la précédente
  prefillNote?: string | null;
};

// Coquille commune des modals de saisie (feuille du bas + fond grisé), partagée avec le
// modal à onglets des séries « à encoder » (PendingSetsModal, amélioration 01b).
export function PerformanceSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      // Android donne le focus au 1er champ à l'ouverture d'un Modal et ouvre le clavier :
      // on le referme, il se rouvrira normalement au tap sur un champ.
      onShow={() => Keyboard.dismiss()}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
      >
        <View style={styles.handle} />
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function SetPerformanceModal({
  visible,
  onClose,
  exerciseName,
  setNumber,
  side,
  ...formProps
}: Props) {
  const sideLabel = side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '';
  const title = `${exerciseName ? `${exerciseName} — ` : ''}Série ${setNumber}${sideLabel}`;

  return (
    <PerformanceSheet visible={visible} onClose={onClose}>
      <SetPerformanceForm {...formProps} title={title} />
    </PerformanceSheet>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 16,
  },
});
