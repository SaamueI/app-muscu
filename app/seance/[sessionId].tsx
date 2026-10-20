import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
  completeSetLog,
  getSessionLive,
  getUserWeightUnit,
  markExerciseDone,
  pairExerciseLogs,
  type ExerciseLogEnriched,
  type SessionLiveData,
  type SetLogData,
} from '../../src/db/session';
import { getEffectiveVariation } from '../../src/utils/exerciseSwap';
import { formatTargets } from '../../src/utils/formatTargets';
import ExercisePicker from '../../src/components/ExercisePicker';
import GlobalRestBanner from '../../src/components/GlobalRestBanner';
import PendingSetsModal, { type PendingItem } from '../../src/components/live/PendingSetsModal';
import { getFirstSide } from '../../src/db/settings';
import TimerDisplay from '../../src/components/TimerDisplay';
import { getActiveSession, setActiveSession } from '../../src/utils/activeSessionStore';
import { finishSessionNow, finishWithPendingCheck, promptCancelSession } from '../../src/utils/sessionExitFlow';
import { computePrefill } from '../../src/utils/setPrefill';

export default function LiveSessionScreen() {
  useKeepAwake();

  // encodePending=1 : venu de la croix du widget (« Terminer la séance » → « Encoder maintenant »)
  const { sessionId, encodePending } = useLocalSearchParams<{ sessionId: string; encodePending?: string }>();
  const router = useRouter();

  const [data, setData] = useState<SessionLiveData | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  // Superset improvisé : mode sélection (on coche deux exercices à faire)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Encodage des séries « à encoder » avant la fin de séance (amélioration 01b) : ids figés
  // à l'ouverture, la séance se termine à la fermeture s'il n'en reste plus.
  const [pending, setPending] = useState<{ ids: string[]; key: number } | null>(null);
  const [userUnit, setUserUnit] = useState<'kg' | 'lb'>('kg');
  const [firstSide, setFirstSide] = useState<'L' | 'R'>('L');
  const encodeParamHandled = useRef(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const d = await getSessionLive(sessionId);
    setData(d);
    const [unit, side] = await Promise.all([getUserWeightUnit(), getFirstSide()]);
    setUserUnit(unit);
    setFirstSide(side);
    if (encodePending === '1' && !encodeParamHandled.current && d) {
      encodeParamHandled.current = true;
      openPendingFrom(d, side);
    }

    // Copie en mémoire de la DB (source de vérité) : le widget et l'écran
    // exercice lisent le store plutôt que de requêter chaque seconde.
    const startedAt = d?.session.startedAt ? Date.parse(d.session.startedAt) : null;
    const s = getActiveSession();
    if (s.sessionId !== sessionId || s.sessionStartedAt !== startedAt) {
      setActiveSession({ sessionId, sessionStartedAt: startedAt });
    }
  }, [sessionId, encodePending]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Lignes à encoder de toute la séance, dans l'ordre des exercices puis des séries
  // (côté de départ d'abord).
  function openPendingFrom(d: SessionLiveData, side: 'L' | 'R') {
    const rank = (sd: string | null) => (sd == null ? 0 : sd === side ? 1 : 2);
    const ids = d.exerciseLogs.flatMap((el) =>
      el.setLogs
        .filter((l) => l.isPending)
        .sort((x, y) => (x.setNumber ?? 0) - (y.setNumber ?? 0) || rank(x.side) - rank(y.side))
        .map((l) => l.id)
    );
    if (ids.length > 0) setPending({ ids, key: Date.now() });
  }

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

  const handleFinish = () => {
    Alert.alert('Terminer la séance', 'Confirmer la fin de la séance ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer',
        style: 'destructive',
        onPress: () => {
          if (!sessionId) return;
          finishWithPendingCheck(sessionId, {
            onEncode: () => openPendingFrom(data, firstSide),
            onDone: () => router.back(),
          });
        },
      },
    ]);
  };

  // ─── Modal à onglets : items reconstruits depuis les ids figés ────────────
  const pendingItems: PendingItem[] = (pending?.ids ?? []).flatMap((id) => {
    const el = exerciseLogs.find((x) => x.setLogs.some((l) => l.id === id));
    if (!el) return [];
    const row = el.setLogs.find((l) => l.id === id)!;
    const n = row.setNumber ?? 1;
    const side = (row.side as 'L' | 'R' | null) ?? null;
    const name = el.exercise.name;
    const sideText = side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '';
    return [{
      row,
      tabLabel: `${name.length > 14 ? `${name.slice(0, 13)}…` : name} · S${n}${side ? ` ${side === 'L' ? 'G' : 'D'}` : ''}`,
      title: `${name} — Série ${n}${sideText}`,
      exerciseId: el.exercise.id,
      weightUnit: (el.exercise.weightUnit as 'kg' | 'lb' | null) ?? userUnit,
      // Pas d'historique chargé ici : séance en cours, puis objectifs du plan
      prefill: computePrefill(el, [], n, side),
    }];
  });

  const handlePendingComplete = async (rowId: string, values: SetLogData) => {
    await completeSetLog(rowId, values);
    await load();
  };

  // On termine la séance seulement si tout a été encodé (sinon l'utilisateur a refermé
  // le modal en cours de route : il reste sur l'écran séance).
  const handlePendingClose = async () => {
    setPending(null);
    if (!sessionId) return;
    const fresh = await getSessionLive(sessionId);
    setData(fresh);
    const left = fresh?.exerciseLogs.some((el) => el.setLogs.some((l) => l.isPending)) ?? false;
    if (!left) finishSessionNow(sessionId, () => router.back());
  };

  const handleCancel = () => {
    if (sessionId) promptCancelSession(sessionId, () => router.back());
  };

  // La flèche interrompt simplement : la séance reste ouverte, le widget
  // réapparaît sur les autres écrans.
  const handleBackPress = () => router.back();

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

  // ─── Superset (amélioration 01) ─────────────────────────────────────────────
  // Les alertes Android sont limitées à 3 boutons : les deux questions (superset ou non,
  // puis par quel exercice commencer) sont donc deux alertes de 3 boutons pile.

  const openExercise = (el: ExerciseLogEnriched) => router.push(`/seance/exercice/${el.log.id}` as any);

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
  };

  // `pair` : superset improvisé → on le mémorise sur la séance (cadre orange)
  const launchSuperset = async (first: ExerciseLogEnriched, second: ExerciseLogEnriched, pair: boolean) => {
    if (pair) await pairExerciseLogs(first.log.id, second.log.id);
    exitSelectMode();
    router.push(`/seance/superset?a=${first.log.id}&b=${second.log.id}` as any);
  };

  const askFirstExercise = (x: ExerciseLogEnriched, y: ExerciseLogEnriched, pair: boolean) => {
    Alert.alert('Par quel exercice commencer ?', undefined, [
      { text: x.exercise.name, onPress: () => launchSuperset(x, y, pair) },
      { text: y.exercise.name, onPress: () => launchSuperset(y, x, pair) },
      { text: 'Annuler', style: 'cancel', onPress: () => setSelected([]) },
    ]);
  };

  const toggleSelect = (el: ExerciseLogEnriched) => {
    if (el.log.isDone) return;
    const id = el.log.id;
    if (selected.includes(id)) {
      setSelected(selected.filter((x) => x !== id));
      return;
    }
    const next = [...selected, id];
    setSelected(next);
    if (next.length === 2) {
      const [x, y] = next.map((i) => todoDone.todo.find((e) => e.log.id === i)!);
      askFirstExercise(x, y, true);
    }
  };

  // Superset en cours (store) dont les deux exercices sont encore à faire : a = celui qui
  // commence chaque manche. Perdu si l'app est tuée (store en mémoire) : on retombe alors
  // sur l'alerte « Superset prévu ».
  const activeSup = getActiveSession().activeSuperset;
  const inProgressPair =
    activeSup &&
    [activeSup.a, activeSup.b].every((id) => todoDone.todo.some((e) => e.log.id === id))
      ? activeSup
      : null;
  const isInProgressGroup = (items: ExerciseLogEnriched[]) =>
    inProgressPair != null &&
    items.length === 2 &&
    items.every((i) => i.log.id === inProgressPair.a || i.log.id === inProgressPair.b);

  const handleCardPress = (el: ExerciseLogEnriched) => {
    if (selectMode) {
      toggleSelect(el);
      return;
    }
    // Exercice d'un superset en cours : retour direct à l'écran superset, sans alerte
    if (inProgressPair && (el.log.id === inProgressPair.a || el.log.id === inProgressPair.b)) {
      router.push(`/seance/superset?a=${inProgressPair.a}&b=${inProgressPair.b}` as any);
      return;
    }
    // Superset prévu : exactement deux exercices à faire dans le groupe. À 3 ou plus,
    // la question « par lequel commencer » ne tiendrait pas en 3 boutons : exercice seul.
    const gid = el.log.supersetGroupId;
    const partners = gid && !el.log.isDone ? todoDone.todo.filter((e) => e.log.supersetGroupId === gid) : [];
    if (partners.length !== 2) {
      openExercise(el);
      return;
    }
    const [x, y] = partners;
    Alert.alert('Superset prévu', `${x.exercise.name} × ${y.exercise.name}`, [
      { text: 'Faire le superset', onPress: () => askFirstExercise(x, y, false) },
      { text: 'Exercice seul', onPress: () => openExercise(el) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const renderCard = (el: ExerciseLogEnriched) => (
    <Pressable
      key={el.log.id}
      style={[
        styles.card,
        el.log.isDone && styles.cardDone,
        selectMode && selected.includes(el.log.id) && styles.cardSelected,
      ]}
      onPress={() => handleCardPress(el)}
    >
      <View style={styles.cardContent}>
        <View style={styles.cardMain}>
          <Text style={[styles.cardName, el.log.isDone && styles.cardNameDone]}>
            {el.exercise.name}
            {getEffectiveVariation(el) ? ` · ${getEffectiveVariation(el)}` : ''}
          </Text>
          {el.plannedExercise && (
            <Text style={styles.cardReplaces}>remplace {el.plannedExercise.name}</Text>
          )}
          {targetLabel(el) !== '' && (
            <Text style={styles.cardTarget}>{targetLabel(el)}</Text>
          )}
          {setsLabel(el) !== '' && (
            <Text style={styles.cardSets}>{setsLabel(el)}</Text>
          )}
        </View>
        {selectMode ? (
          // Mode superset : case à cocher (seuls les exercices à faire sont sélectionnables)
          !el.log.isDone && (
            <View style={styles.doneToggle}>
              <View style={[styles.selectBox, selected.includes(el.log.id) && styles.selectBoxActive]}>
                {selected.includes(el.log.id) && <Text style={styles.doneCheck}>✓</Text>}
              </View>
            </View>
          )
        ) : (
          <Pressable
            onPress={() => handleToggleDone(el.log.id, el.log.isDone)}
            style={styles.doneToggle}
            hitSlop={8}
          >
            <View style={[styles.doneCircle, el.log.isDone && styles.doneCircleActive]}>
              {el.log.isDone && <Text style={styles.doneCheck}>✓</Text>}
            </View>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  const renderGroup = (group: { groupId: string | null; items: ExerciseLogEnriched[] }) => {
    if (group.groupId && group.items.length > 1) {
      const inProgress = isInProgressGroup(group.items);
      return (
        <View key={group.groupId} style={[styles.supersetGroup, inProgress && styles.supersetGroupActive]}>
          <Text style={[styles.supersetLabel, inProgress && styles.supersetLabelActive]}>
            {inProgress ? 'SUPERSET EN COURS' : 'SUPERSET'}
          </Text>
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {session.programSessionId || session.mesoSessionId ? 'Séance en cours' : 'Séance libre'}
          </Text>
          {session.startedAt && (
            <TimerDisplay
              startedAt={Date.parse(session.startedAt)}
              targetSeconds={null}
              isRunning
              style={styles.headerClock}
            />
          )}
        </View>
        <Pressable style={styles.finishButton} onPress={handleFinish}>
          <Text style={styles.finishText}>Terminer</Text>
        </Pressable>
      </View>

      <GlobalRestBanner />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* À faire */}
        {todoDone.todo.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>À faire</Text>
              {todoDone.todo.length >= 2 && (
                <Pressable
                  style={[styles.supersetChip, selectMode && styles.supersetChipActive]}
                  onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                  hitSlop={6}
                >
                  <Text style={[styles.supersetChipText, selectMode && styles.supersetChipTextActive]}>
                    {selectMode ? 'Annuler' : '⇄ Superset'}
                  </Text>
                </Pressable>
              )}
            </View>
            {selectMode && <Text style={styles.selectHint}>Coche les deux exercices du superset.</Text>}
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
      </ScrollView>

      {/* Actions fixes, hors du scroll */}
      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={handleAddExercise}>
          <Text style={styles.addText}>+ Ajouter un exercice</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Annuler la séance</Text>
        </Pressable>
      </View>

      {pending && (
        <PendingSetsModal
          key={pending.key}
          visible
          items={pendingItems}
          onComplete={handlePendingComplete}
          onClose={handlePendingClose}
        />
      )}

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
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  headerClock: {
    fontSize: 13,
    textAlign: 'left',
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
  cardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  supersetChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#FFF4E0',
  },
  supersetChipActive: {
    backgroundColor: '#FF9500',
  },
  supersetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
  },
  supersetChipTextActive: {
    color: '#FFFFFF',
  },
  selectHint: {
    fontSize: 13,
    color: '#8E8E93',
  },
  selectBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBoxActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
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
  cardReplaces: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
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
  supersetGroupActive: { borderColor: '#007AFF' },
  supersetLabelActive: { color: '#007AFF', backgroundColor: '#E8F0FE' },
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
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 2,
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C6C6C8',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#FF3B30',
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
