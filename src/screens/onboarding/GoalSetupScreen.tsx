import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { suggestCoinWithAI } from '../../lib/taskRecommend';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'GoalSetup'>;
type Route = RouteProp<RootStackParamList, 'GoalSetup'>;

type PresetGoal = { emoji: string; name: string; coinCost: number };

const PRESET_GOALS_6_9: PresetGoal[] = [
  { emoji: '🃏', name: '寶可夢卡牌', coinCost: 80 },
  { emoji: '🎮', name: '多 30 分鐘 Switch', coinCost: 80 },
  { emoji: '🎬', name: '選一部電影', coinCost: 60 },
  { emoji: '📚', name: '買一本漫畫', coinCost: 70 },
  { emoji: '🎡', name: '去遊樂場', coinCost: 100 },
];

export default function GoalSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { childId, childNickname, familyId, ageGroup, isOnboarding } = route.params;

  const [selectedName, setSelectedName] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCoin, setCustomCoin] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ coins: number; weeks: number; reason: string } | null>(null);
  const [adjustedCoin, setAdjustedCoin] = useState(0);

  const isCustomSelected =
    selectedName !== '' && !PRESET_GOALS_6_9.some(g => g.name === selectedName);

  function handleSelectPreset(goal: PresetGoal) {
    setSelectedName(goal.name);
    setSelectedCoin(goal.coinCost);
  }

  function openCustomModal() {
    setCustomName('');
    setCustomCoin('');
    setAiResult(null);
    setAdjustedCoin(0);
    setModalVisible(true);
  }

  async function handleAiSuggest() {
    if (!customName.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await suggestCoinWithAI(customName.trim());
      setAiResult(result);
      setAdjustedCoin(result.coins);
    } catch {
      Alert.alert('AI 建議失敗', '請手動填入幣值');
    } finally {
      setAiLoading(false);
    }
  }

  function handleApplyCustom() {
    const coin = aiResult ? adjustedCoin : parseInt(customCoin, 10);
    if (!customName.trim() || !coin || coin < 1) {
      Alert.alert('請填寫完整', '需要獎品名稱與有效的幣值');
      return;
    }
    setSelectedName(customName.trim());
    setSelectedCoin(coin);
    setModalVisible(false);
  }

  function handleNext() {
    if (!selectedName) {
      Alert.alert('請選擇目標', '請先選一個獎品目標');
      return;
    }
    navigation.navigate('TaskSelection', {
      childId,
      childNickname,
      familyId,
      ageGroup,
      rewardName: selectedName,
      goalCoinCost: selectedCoin,
      isOnboarding,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
        </View>

        <Text style={styles.title}>為 {childNickname} 設定目標</Text>
        <Text style={styles.subtitle}>選一個最想換的獎勵 🎯</Text>

        <View style={styles.grid}>
          {PRESET_GOALS_6_9.map(goal => {
            const isSelected = selectedName === goal.name;
            return (
              <TouchableOpacity
                key={goal.name}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                onPress={() => handleSelectPreset(goal)}
                activeOpacity={0.75}
              >
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkMark}>✓</Text>
                  </View>
                )}
                <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                <Text style={styles.goalName}>{goal.name}</Text>
                <Text style={styles.goalCoin}>{goal.coinCost} 幣</Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.goalCard, isCustomSelected && styles.goalCardSelected]}
            onPress={openCustomModal}
            activeOpacity={0.75}
          >
            {isCustomSelected && (
              <View style={styles.checkBadge}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
            <Text style={styles.goalEmoji}>✏️</Text>
            <Text style={[styles.goalName, !isCustomSelected && { color: Colors.textSecondary }]}>
              {isCustomSelected ? selectedName : '自己填…'}
            </Text>
            <Text style={[styles.goalCoin, !isCustomSelected && { color: Colors.textSecondary }]}>
              {isCustomSelected ? `${selectedCoin} 幣` : '自訂幣值'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.refreshLink}
          onPress={() => Alert.alert('', '你已看到全部建議囉！可以自訂目標 ✏️')}
        >
          <Text style={styles.refreshText}>🔄 換一批建議</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>i</Text>
          </View>
          <Text style={styles.infoText}>
            幣是孩子完成任務賺的虛擬貨幣，每週大約可賺{' '}
            <Text style={styles.infoHighlight}>120–150 幣</Text>。
            建議第一個目標設在 60–100 幣，大約 1 週就能達成。
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !selectedName && styles.primaryBtnDisabled]}
          onPress={handleNext}
          disabled={!selectedName}
        >
          <Text style={styles.primaryBtnText}>下一步：選任務 →</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>自訂獎品目標</Text>
            <Text style={styles.sheetSubtitle}>輸入想換的獎品，讓 AI 幫你定幣值</Text>

            <Text style={styles.fieldLabel}>獎品名稱</Text>
            <TextInput
              style={styles.input}
              value={customName}
              onChangeText={setCustomName}
              placeholder="例：去吃屋馬燒肉"
              placeholderTextColor={Colors.textSecondary}
            />

            {!aiResult ? (
              <View style={styles.coinRow}>
                <TextInput
                  style={[styles.input, styles.coinInput]}
                  value={customCoin}
                  onChangeText={setCustomCoin}
                  placeholder="幣值（可自填）"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={[styles.aiBtn, (!customName.trim() || aiLoading) && styles.aiBtnDisabled]}
                  onPress={handleAiSuggest}
                  disabled={aiLoading || !customName.trim()}
                >
                  {aiLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.aiBtnText}>✨ AI 建議</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.aiResultCard}>
                  <View style={styles.aiResultHeader}>
                    <Text style={styles.aiResultIcon}>✨</Text>
                    <View>
                      <Text style={styles.aiResultTitle}>AI 建議幣值</Text>
                      <Text style={styles.aiResultSub}>根據「{customName}」的相對價值</Text>
                    </View>
                  </View>
                  <Text style={styles.aiResultCoin}>{aiResult.coins} 幣</Text>
                  <Text style={styles.aiResultWeeks}>大約需要努力 {aiResult.weeks} 週 💪</Text>
                </View>

                <Text style={styles.fieldLabel}>微調幣值</Text>
                <View style={styles.adjustRow}>
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => setAdjustedCoin(c => Math.max(10, c - 10))}
                  >
                    <Text style={styles.adjustBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.adjustValue}>{adjustedCoin}</Text>
                  <TouchableOpacity
                    style={styles.adjustBtn}
                    onPress={() => setAdjustedCoin(c => c + 10)}
                  >
                    <Text style={styles.adjustBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCustom}>
              <Text style={styles.applyBtnText}>套用此目標 ✓</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 48 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressInactive: { backgroundColor: Colors.border },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  goalCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    position: 'relative',
  },
  goalCardSelected: { backgroundColor: '#EEF5FF' },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 10, fontWeight: '700' },
  goalEmoji: { fontSize: 28, marginBottom: 6 },
  goalName: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  goalCoin: { fontSize: 12, fontWeight: '700', color: Colors.coin },

  refreshLink: { alignItems: 'center', paddingVertical: 10 },
  refreshText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  infoIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  infoIconText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  infoText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  infoHighlight: { color: Colors.coin, fontWeight: '600' },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12,
  },
  coinRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  coinInput: { flex: 1, marginBottom: 0 },
  aiBtn: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiBtnDisabled: { opacity: 0.4 },
  aiBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  aiResultCard: {
    backgroundColor: '#EEF5FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  aiResultHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  aiResultIcon: { fontSize: 18 },
  aiResultTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  aiResultSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  aiResultCoin: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.coin,
    textAlign: 'center',
    marginVertical: 6,
  },
  aiResultWeeks: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },

  adjustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    justifyContent: 'center',
  },
  adjustBtn: {
    width: 36,
    height: 36,
    backgroundColor: Colors.background,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustBtnText: { fontSize: 20, fontWeight: '700', color: Colors.textSecondary },
  adjustValue: { fontSize: 22, fontWeight: '700', color: Colors.text, minWidth: 60, textAlign: 'center' },

  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
