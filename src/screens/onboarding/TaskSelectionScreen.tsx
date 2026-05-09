import React, { useEffect, useState } from 'react';
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
import { fetchTemplates, recommendTasks, calcTotalCoin } from '../../lib/taskRecommend';
import type { SystemTaskTemplate, CustomTask } from '../../types/database';
import type { RootStackParamList } from '../../../App';

type Nav = StackNavigationProp<RootStackParamList, 'TaskSelection'>;
type Route = RouteProp<RootStackParamList, 'TaskSelection'>;

const DIFFICULTY_OPTIONS = [1, 1.5, 2, 2.5, 3];

export default function TaskSelectionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { childId, childNickname, familyId, ageGroup, rewardName, goalCoinCost, isOnboarding } =
    route.params;

  const [allTemplates, setAllTemplates] = useState<SystemTaskTemplate[]>([]);
  // 預設推薦的子集
  const [recommendedB, setRecommendedB] = useState<SystemTaskTemplate[]>([]);
  const [recommendedC, setRecommendedC] = useState<SystemTaskTemplate[]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  // 自訂任務 Modal
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customModalCategory, setCustomModalCategory] = useState<'B' | 'C'>('B');
  const [customTaskName, setCustomTaskName] = useState('');
  const [customTaskTime, setCustomTaskTime] = useState('');
  const [customTaskDifficulty, setCustomTaskDifficulty] = useState(1);

  // 查看全部任務 Modal
  const [allTasksModalVisible, setAllTasksModalVisible] = useState(false);
  const [allTasksModalCategory, setAllTasksModalCategory] = useState<'B' | 'C'>('B');

  useEffect(() => {
    void loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const templates = await fetchTemplates(ageGroup);
      setAllTemplates(templates);
      const { taskB, taskC } = recommendTasks(templates, false);
      setRecommendedB(taskB);
      setRecommendedC(taskC);
      
      const initialIds = new Set([...taskB, ...taskC].map(t => t.id));
      setSelectedIds(initialIds);
    } catch {
      Alert.alert('載入失敗', '請重試');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openCustomModal(category: 'B' | 'C') {
    setCustomModalCategory(category);
    setCustomTaskName('');
    setCustomTaskTime('');
    setCustomTaskDifficulty(1);
    setCustomModalVisible(true);
  }

  function handleAddCustomTask() {
    const timeMin = parseInt(customTaskTime, 10);
    if (!customTaskName.trim() || !timeMin || timeMin < 1) {
      Alert.alert('請填寫完整', '需要任務名稱與有效的時間');
      return;
    }
    const newTask: CustomTask = {
      name: customTaskName.trim(),
      category: customModalCategory,
      base_time_min: timeMin,
      difficulty: customTaskDifficulty,
      time_saving_min: customModalCategory === 'B' ? timeMin : 0,
    };
    setCustomTasks(prev => [...prev, newTask]);
    setCustomModalVisible(false);
  }

  function openAllTasksModal(category: 'B' | 'C') {
    setAllTasksModalCategory(category);
    setAllTasksModalVisible(true);
  }

  // 主畫面要顯示的 B 與 C：必須是「預設推薦」或「使用者已手動勾選的」
  const visibleB = allTemplates.filter(t => t.category === 'B' && (recommendedB.some(rb => rb.id === t.id) || selectedIds.has(t.id)));
  const visibleC = allTemplates.filter(t => t.category === 'C' && (recommendedC.some(rc => rc.id === t.id) || selectedIds.has(t.id)));

  const selectedTemplates = allTemplates.filter(t => selectedIds.has(t.id));
  const selectedCList = selectedTemplates.filter(t => t.category === 'C');
  const customCList = customTasks.filter(t => t.category === 'C');
  
  const totalCoin =
    calcTotalCoin(selectedCList) +
    customCList.reduce((s, t) => s + Math.round(t.base_time_min * t.difficulty), 0);

  function handleNext() {
    navigation.navigate('Overview', {
      childId,
      childNickname,
      familyId,
      selectedTemplateIds: [...selectedIds],
      customTasks,
      rewardName,
      goalCoinCost,
      isOnboarding,
    });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.progressRow}>
          <View style={[styles.progressBar, styles.progressDone]} />
          <View style={[styles.progressBar, styles.progressActive]} />
          <View style={[styles.progressBar, styles.progressInactive]} />
        </View>

        <Text style={styles.title}>幫 {childNickname} 選任務</Text>
        <Text style={styles.subtitle}>
          目標：{rewardName}（{goalCoinCost} 幣）
        </Text>

        {/* ================= Task-B section ================= */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>家庭本分</Text>
          <TouchableOpacity onPress={() => setTooltipVisible(v => !v)}>
            <View style={styles.infoIcon}>
              <Text style={styles.infoIconText}>i</Text>
            </View>
          </TouchableOpacity>
        </View>

        {tooltipVisible && (
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>
              完成後，幫家裡省下這些分鐘。累積後，可以跟爸媽討論把它兌換成
              <Text style={{ color: Colors.primary, fontWeight: '600' }}> 家庭共同時間</Text>，
              例如週末一起出去玩 🎉
            </Text>
          </View>
        )}

        {visibleB.map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.taskCard, selectedIds.has(t.id) && styles.taskCardSelected]}
            onPress={() => toggleSelection(t.id)}
            activeOpacity={0.75}
          >
            <View style={[styles.checkbox, selectedIds.has(t.id) && styles.checkboxSelected]}>
              {selectedIds.has(t.id) && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <View style={styles.taskInfo}>
              <Text style={styles.taskName}>{t.name}</Text>
              <Text style={styles.taskMeta}>
                {t.base_time_min} 分鐘・幫家裡省 {t.time_saving_min} 分鐘
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {customTasks.filter(t => t.category === 'B').map((t, i) => (
          <View key={`cb-${i}`} style={[styles.taskCard, styles.taskCardSelected]}>
            <View style={[styles.checkbox, styles.checkboxSelected]}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <View style={styles.taskInfo}>
              <Text style={styles.taskName}>{t.name} <Text style={styles.customBadge}>自訂</Text></Text>
              <Text style={styles.taskMeta}>
                {t.base_time_min} 分鐘・幫家裡省 {t.time_saving_min} 分鐘
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.sectionActions}>
          <TouchableOpacity onPress={() => openCustomModal('B')}>
            <Text style={styles.actionLink}>＋ 新增自訂任務</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openAllTasksModal('B')}>
            <Text style={styles.actionLinkSecondary}>🔍 查看所有推薦任務</Text>
          </TouchableOpacity>
        </View>

        {/* ================= Task-C section ================= */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>超出本分貢獻</Text>
        </View>

        {visibleC.map(t => {
          const coin = Math.round(t.base_time_min * t.difficulty);
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.taskCard, selectedIds.has(t.id) && styles.taskCardSelected]}
              onPress={() => toggleSelection(t.id)}
              activeOpacity={0.75}
            >
              <View style={[styles.checkbox, selectedIds.has(t.id) && styles.checkboxSelected]}>
                {selectedIds.has(t.id) && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskName}>{t.name}</Text>
                <Text style={styles.taskMeta}>
                  {t.base_time_min} 分鐘 × 難度 {t.difficulty}
                </Text>
              </View>
              <Text style={[styles.coinBadge, !selectedIds.has(t.id) && styles.coinBadgeDim]}>
                {coin} 幣
              </Text>
            </TouchableOpacity>
          );
        })}

        {customTasks.filter(t => t.category === 'C').map((t, i) => {
          const coin = Math.round(t.base_time_min * t.difficulty);
          return (
            <View key={`cc-${i}`} style={[styles.taskCard, styles.taskCardSelected]}>
              <View style={[styles.checkbox, styles.checkboxSelected]}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <View style={styles.taskInfo}>
                <Text style={styles.taskName}>{t.name} <Text style={styles.customBadge}>自訂</Text></Text>
                <Text style={styles.taskMeta}>
                  {t.base_time_min} 分鐘 × 難度 {t.difficulty}
                </Text>
              </View>
              <Text style={styles.coinBadge}>{coin} 幣</Text>
            </View>
          );
        })}

        <View style={styles.sectionActions}>
          <TouchableOpacity onPress={() => openCustomModal('C')}>
            <Text style={styles.actionLink}>＋ 新增自訂任務</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openAllTasksModal('C')}>
            <Text style={styles.actionLinkSecondary}>🔍 查看所有推薦任務</Text>
          </TouchableOpacity>
        </View>

        {/* ================= Summary & Action ================= */}
        <View style={styles.coinSummary}>
          <Text style={styles.coinSummaryLabel}>每次全完成可賺</Text>
          <Text style={styles.coinSummaryValue}>{totalCoin} 幣</Text>
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
          <Text style={styles.primaryBtnText}>下一步：確認總覽 →</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ================= All Tasks Modal ================= */}
      <Modal
        visible={allTasksModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAllTasksModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setAllTasksModalVisible(false)}
        >
          <TouchableOpacity style={[styles.sheet, styles.tallSheet]} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              選擇{allTasksModalCategory === 'B' ? '家庭本分' : '超出本分'}任務
            </Text>
            
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {allTemplates.filter(t => t.category === allTasksModalCategory).map(t => {
                const isSelected = selectedIds.has(t.id);
                const coin = Math.round(t.base_time_min * t.difficulty);
                return (
                  <TouchableOpacity
                    key={`modal-task-${t.id}`}
                    style={[styles.taskCard, isSelected && styles.taskCardSelected]}
                    onPress={() => toggleSelection(t.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                    <View style={styles.taskInfo}>
                      <Text style={styles.taskName}>{t.name}</Text>
                      {allTasksModalCategory === 'B' ? (
                        <Text style={styles.taskMeta}>
                          {t.base_time_min} 分鐘・幫家裡省 {t.time_saving_min} 分鐘
                        </Text>
                      ) : (
                        <Text style={styles.taskMeta}>
                          {t.base_time_min} 分鐘 × 難度 {t.difficulty}
                        </Text>
                      )}
                    </View>
                    {allTasksModalCategory === 'C' && (
                      <Text style={[styles.coinBadge, !isSelected && styles.coinBadgeDim]}>
                        {coin} 幣
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setAllTasksModalVisible(false)}>
              <Text style={styles.applyBtnText}>完成選取 ✓</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ================= Custom Task Modal ================= */}
      <Modal
        visible={customModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCustomModalVisible(false)}
        >
          <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              新增{customModalCategory === 'B' ? '家庭本分' : '賺幣'}任務
            </Text>

            <Text style={styles.fieldLabel}>任務名稱</Text>
            <TextInput
              style={styles.input}
              value={customTaskName}
              onChangeText={setCustomTaskName}
              placeholder="例：整理房間"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>預估時間（分鐘）</Text>
            <TextInput
              style={styles.input}
              value={customTaskTime}
              onChangeText={setCustomTaskTime}
              placeholder="例：15"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />

            {customModalCategory === 'C' && (
              <>
                <Text style={styles.fieldLabel}>難度</Text>
                <View style={styles.difficultyRow}>
                  {DIFFICULTY_OPTIONS.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.difficultyBtn,
                        customTaskDifficulty === d && styles.difficultyBtnSelected,
                      ]}
                      onPress={() => setCustomTaskDifficulty(d)}
                    >
                      <Text
                        style={[
                          styles.difficultyBtnText,
                          customTaskDifficulty === d && styles.difficultyBtnTextSelected,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {customTaskTime ? (
                  <Text style={styles.coinPreview}>
                    預估幣值：{Math.round(parseInt(customTaskTime, 10) * customTaskDifficulty || 0)} 幣
                  </Text>
                ) : null}
              </>
            )}

            <TouchableOpacity style={styles.applyBtn} onPress={handleAddCustomTask}>
              <Text style={styles.applyBtnText}>加入任務 ✓</Text>
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
  content: { padding: 24, paddingBottom: 100 }, // 增加 paddingBottom 防止截斷
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  progressBar: { flex: 1, height: 3, borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  progressDone: { backgroundColor: Colors.success },
  progressInactive: { backgroundColor: Colors.border },

  title: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 28 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  infoIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoIconText: { fontSize: 9, fontWeight: '700', color: Colors.textSecondary },

  tooltip: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    marginTop: -4,
  },
  tooltipText: { fontSize: 12, color: '#D1D5DB', lineHeight: 18 },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 13,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  taskCardSelected: { backgroundColor: '#EEF5FF' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxSelected: { backgroundColor: Colors.primary },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  taskMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  customBadge: { fontSize: 10, color: Colors.textSecondary, fontStyle: 'italic' },
  coinBadge: { fontSize: 13, fontWeight: '700', color: Colors.coin },
  coinBadgeDim: { color: Colors.textSecondary },

  sectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  actionLink: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  actionLinkSecondary: { fontSize: 13, color: Colors.textSecondary },

  coinSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  coinSummaryLabel: { fontSize: 14, color: Colors.textSecondary },
  coinSummaryValue: { fontSize: 20, fontWeight: '800', color: Colors.coin },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
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
    maxHeight: '90%',
  },
  tallSheet: {
    height: '75%', // All Tasks Modal 需要多一點高度
  },
  modalScroll: {
    marginTop: 10,
    marginBottom: 20,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: Colors.text, marginBottom: 6 },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 14,
  },
  difficultyRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  difficultyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  difficultyBtnSelected: { backgroundColor: Colors.primary },
  difficultyBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  difficultyBtnTextSelected: { color: '#fff' },
  coinPreview: { fontSize: 13, color: Colors.coin, fontWeight: '600', marginBottom: 14 },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  applyBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
