import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  addFreeExerciseLog,
  cancelWorkoutSession,
  finishSession,
  getSessionLive,
  markExerciseDone,
  type ExerciseLogEnriched,
  type SessionLiveData,
} from '../../src/db/session';
import { formatTargets } from '../../src/utils/formatTargets';
import ExercisePicker from '../../src/components/ExercisePicker';
import GlobalRestBanner from '../../src/components/GlobalRestBanner';
import { getActiveSession, setActiveSession } from '../../src/utils/activeSessionStore';

export default function LiveSessionScreen() {
  useKeepAwake();

  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();

  const [data, setData] = useState<SessionLiveData | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const d = await getSessionLive(sessionId);
    setData(d);

    const s = getActiveSession();
    if (s.sessionId !== sessionId) {
      setActiveSession({ sessionId, bannerDismissed: false });
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const { session, exerciseLogs } = data;
  const todoDone = exerciseLogs.reduce<{ todo: ExerciseLogEnriched[]; done: ExerciseLogEnriched[] }>(
    (acc, el) => {
      if (el.log.isDone) acc.done.push(el);
      else acc.todo.push(el);
      return acc;
    },
    { todo: [], done: [] }
  );

  // Regrouper par supersetGroupId
  function groupExercises(list: ExerciseLogEnriched[]) {
    const groups: Array<{ groupId: string | null; items: ExerciseLogEnriched[] }> = [];
    const seen = new Map<string, number>();
    for (const el of list) {
      const gid = el.log.supersetGroupId ?? null;
      if (gid && seen.has(gid)) {
        groups[seen.get(gid)!].items.push(el);
      } else {
        const idx = groups.length;
        groups.push({ groupId: gid, items: [el] });
        if (gid) seen.set(gid, idx);
      }
    }
    return groups;
  }

  const doFinish = async () => {
    if (!sessionId) return;
    await finishSession(sessionId);
    router.back();
  };

  const handleFinish = () => {
    Alert.alert('Terminer la séance', 'Confirmer la fin de la séance ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Terminer', style: 'destructive', onPress: doFinish },
    ]);
  };

  const doCancel = async () => {
    if (!sessionId) return;
    await cancelWorkoutSession(sessionId);
    router.back();
  };

  const confirmCancel = () => {
    const setCount = exerciseLogs.reduce((n, el) => n + el.setLogs.length, 0);
    if (setCount === 0) {
      doCancel();
      return;
    }
    const eventMsg = session.createdEvent
      ? "L'événement du calendrier sera supprimé."
      : 'La séance redeviendra planifiée dans le calendrier.';
    Alert.alert(
      'Annuler la séance',
      `Les ${setCount} série${setCount > 1 ? 's' : ''} enregistrée${setCount > 1 ? 's' : ''} seront supprimées. ${eventMsg}`,
      [
        { text: 'Retour', style: 'cancel' },
        { text: 'Annuler la séance', style: 'destructive', onPress: doCancel },
      ]
    );
  };

  const handleBackPress = () => {
    Alert.alert('Quitter la séance', undefined, [
      { text: 'Retour', style: 'cancel' },
      { text: 'Interrompre', onPress: () => router.back() },
      { text: 'Annuler la séance…', style: 'destructive', onPress: confirmCancel },
    ]);
  };

  const handleToggleDone = async (logId: string, isDone: boolean) => {
    await markExerciseDone(logId, !isDone);
    load();
  };

  const handleAddExercise = () => setShowPicker(true);

  const setsLabel = (el: ExerciseLogEnriched): string => {
    const done = el.setLogs.length;
    const target = el.mesoSets.length || el.programExercise?.targetSetsMax || null;
    if (target) return `${done}/${target} séries`;
    return done > 0 ? `${done} série${done > 1 ? 's' : ''}` : '';
  };

  const targetLabel = (el: ExerciseLogEnriched): string => {
    if (el.programExercise) return formatTargets(el.programExercise);
    if (el.mesoSets.length > 0) {
      const first = el.mesoSets[0];
      return formatTargets({
        targetRepsMin: first.targetRepsMin,
        targetRepsMax: first.targetRepsMax,
        targetWeightMin: first.targetWeightMin,
        targetWeightMax: first.targetWeightMax,
        targetRirMin: first.targetRirMin,
        targetRirMax: first.targetRirMax,
        targetRestSeconds: first.targetRestSeconds,
        targetDurationSeconds: first.targetDurationSeconds,
      });
    }
    return '';
  };

  const renderCard = (el: ExerciseLogEnriched) => (
    <Pressable
      key={el.log.id}
      style={[styles.card, el.log.isDone && styles.cardDone]}
      onPress={() => router.push(`/seance/exercice/${el.log.id}` as any)}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardMain}>
          <Text style={[styles.cardName, el.log.isDone && styles.cardNameDone]}>
            {el.exercise.name}
          </Text>
          {targetLabel(el) !== '' && (
            <Text style={styles.cardTarget}>{targetLabel(el)}</Text>
          )}
          {setsLabel(el) !== '' && (
            <Text style={styles.cardSets}>{setsLabel(el)}</Text>
          )}
        </View>
        <Pressable
          onPress={() => handleToggleDone(el.log.id, el.log.isDone)}
          style={styles.doneToggle}
          hitSlop={8}
        >
          <View style={[styles.doneCircle, el.log.isDone && styles.doneCircleActive]}>
            {el.log.isDone && <Text style={styles.doneCheck}>✓</Text>}
          </View>
        </Pressable>
      </View>
    </Pressable>
  );

  const renderGroup = (group: { groupId: string | null; items: ExerciseLogEnriched[] }) => {
    if (group.groupId && group.items.length > 1) {
      return (
        <View key={group.groupId} style={styles.supersetGroup}>
          <Text style={styles.supersetLabel}>SUPERSET</Text>
          {group.items.map(renderCard)}
        </View>
      );
    }
    return group.items.map(renderCard);
  };

  const todoGroups = groupExercises(todoDone.todo);
  const doneGroups = groupExercises(todoDone.done);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={handleBackPress} hitSlop={8}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session.programSessionId || session.mesoSessionId ? 'Séance en cours' : 'Séance libre'}
        </Text>
        <Pressable style={styles.finishButton} onPress={handleFinish}>
          <Text style={styles.finishText}>Terminer</Text>
        </Pressable>
      </View>

      <GlobalRestBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* À faire */}
        {todoDone.todo.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>À faire</Text>
            {todoGroups.map(renderGroup)}
          </View>
        )}

        {/* Faits */}
        {todoDone.done.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Faits</Text>
            {doneGroups.map(renderGroup)}
          </View>
        )}

        {exerciseLogs.length === 0 && (
          <Text style={styles.empty}>Aucun exercice. Ajoute-en un ci-dessous.</Text>
        )}

        {/* Ajouter un exercice */}
        <Pressable style={styles.addButton} onPress={handleAddExercise}>
          <Text style={styles.addText}>+ Ajouter un exercice</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Ajouter un exercice</Text>
            <Pressable onPress={() => setShowPicker(false)}>
              <Text style={styles.pickerClose}>Annuler</Text>
            </Pressable>
          </View>
          <ExercisePicker
            cardIndicator="plus"
            onSelect={async (exercise) => {
              if (!sessionId || !data) return;
              const order = data.exerciseLogs.length;
              await addFreeExerciseLog(sessionId, exercise.id, order);
              setShowPicker(false);
              load();
            }}
            onCreateNew={() => {
              setShowPicker(false);
              router.push('/exercices/nouveau' as any);
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loading: {
    textAlign: 'center',
    marginTop: 40,
    color: '#8E8E93',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  backButton: {
    paddingRight: 12,
    paddingVertical: 2,
  },
  backIcon: {
    fontSize: 30,
    fontWeight: '400',
    color: '#007AFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
  },
  finishButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    marginLeft: 12,
  },
  finishText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  scroll: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDone: {
    opacity: 0.55,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMain: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  cardNameDone: {
    textDecorationLine: 'line-through',
  },
  cardTarget: {
    fontSize: 13,
    color: '#8E8E93',
  },
  cardSets: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  doneToggle: {
    marginLeft: 12,
  },
  doneCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCircleActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  doneCheck: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  supersetGroup: {
    gap: 2,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF9500',
  },
  supersetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF9500',
    letterSpacing: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#FFF8EE',
  },
  empty: {
    textAlign: 'center',
    color: '#8E8E93',
    marginTop: 20,
  },
  addButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
  },
  addText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '500',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  pickerTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  pickerClose: { fontSize: 16, color: '#007AFF' },
});
