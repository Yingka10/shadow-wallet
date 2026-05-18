import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { confirmSetup, fetchTemplates } from '../../lib/taskRecommend';
import type { SystemTaskTemplate } from '../../types/database';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'Overview'>;
type Route = RouteProp<RootStackParamList, 'Overview'>;

export default function OverviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const {
    childId,
    childNickname,
    familyId,
    selectedTemplateIds,
    customTasks,
    rewardName,
    goalCoinCost,
    isOnboarding,
  } = route.params;

  const [confirming, setConfirming] = useState(false);
  const [templateDetails, setTemplateDetails] = useState<SystemTaskTemplate[]>([]);

  React.useEffect(() => {
    void (async () => {
      try {
        const all = await fetchTemplates('6-9');
        setTemplateDetails(all.filter(t => selectedTemplateIds.includes(t.id)));
      } catch {
        // Non-critical — names will just be empty
      }
    })();
  }, []);

  const selectedB = templateDetails.filter(t => t.category === 'B');
  const selectedC = templateDetails.filter(t => t.category === 'C');
  const customB = customTasks.filter(t => t.category === 'B');
  const customC = customTasks.filter(t => t.category === 'C');

  const totalCoin = useMemo(() => {
    const fromTemplates = selectedC.reduce(
      (s, t) => s + Math.round(t.base_time_min * t.difficulty),
      0
    );
    const fromCustom = customC.reduce(
      (s, t) => s + Math.round(t.base_time_min * t.difficulty),
      0
    );
    return fromTemplates + fromCustom;
  }, [selectedC, customC]);

  const estimatedRounds = totalCoin > 0 ? Math.ceil(goalCoinCost / totalCoin) : '?';

  const allTaskBNames = [...selectedB.map(t => t.name), ...customB.map(t => t.name)];
  const allTaskCNames = [...selectedC.map(t => t.name), ...customC.map(t => t.name)];

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmSetup({
        familyId,
        childId,
        templateIds: selectedTemplateIds,
        customTasks,
        rewardName,
        coinCost: goalCoinCost,
      });
      if (isOnboarding) {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'ParentTab' }] })
        );
      } else {
        navigation.pop(3);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '發生未知錯誤';
      Alert.alert('設定失敗', msg);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressActive]} />
        </View>

        <Text style={styles.title}>確認 {childNickname} 的計畫</Text>
        <Text style={styles.subtitle}>看起來 OK 就出發 🚀</Text>

        {/* Goal card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>目標</Text>
            <TouchableOpacity onPress={() => navigation.pop(2)}>
              <Text style={styles.editLink}>✏️ 修改目標</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.goalRow}>
            <Text style={styles.goalName}>{rewardName}</Text>
            <Text style={styles.goalCoin}>{goalCoinCost} 幣</Text>
          </View>
        </View>

        {/* Task package card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>任務包</Text>
            <TouchableOpacity onPress={() => navigation.pop(1)}>
              <Text style={styles.editLink}>✏️ 修改任務</Text>
            </TouchableOpacity>
          </View>

          {allTaskBNames.length > 0 && (
            <>
              <Text style={styles.taskGroupLabel}>家庭本分</Text>
              <Text style={styles.taskList}>{allTaskBNames.join('・')}</Text>
            </>
          )}

          {allTaskBNames.length > 0 && allTaskCNames.length > 0 && (
            <View style={styles.divider} />
          )}

          {allTaskCNames.length > 0 && (
            <>
              <Text style={styles.taskGroupLabel}>賺幣任務</Text>
              <Text style={styles.taskList}>{allTaskCNames.join('・')}</Text>
            </>
          )}

          {allTaskBNames.length === 0 && allTaskCNames.length === 0 && (
            <Text style={styles.emptyNote}>尚未選取任何任務</Text>
          )}
        </View>

        {/* Estimate card */}
        <View style={styles.estimateCard}>
          <Text style={styles.estimateLabel}>全部完成時，大概…</Text>
          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>{totalCoin} 幣</Text>
              <Text style={styles.estimateUnit}>每次最多可賺</Text>
            </View>
            <View style={styles.estimateDivider} />
            <View style={styles.estimateItem}>
              <Text style={styles.estimateValue}>~{estimatedRounds} 次</Text>
              <Text style={styles.estimateUnit}>就能換到目標</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
        >
          {confirming
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.confirmBtnText}>✓ 確認並開始！</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressDone: { backgroundColor: Colors.success },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  editLink: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  goalCoin: { fontSize: 22, fontWeight: '800', color: Colors.coin },

  taskGroupLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  taskList: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  emptyNote: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },

  estimateCard: {
    backgroundColor: Colors.text,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  estimateLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 12 },
  estimateRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  estimateItem: { alignItems: 'center' },
  estimateValue: { fontSize: 22, fontWeight: '800', color: Colors.coin },
  estimateUnit: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  estimateDivider: { width: 1, height: 36, backgroundColor: '#374151' },

  confirmBtn: {
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
