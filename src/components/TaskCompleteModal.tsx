import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Colors } from '../constants/colors';
import { calcCoin } from '../lib/taskActions';
import type { Task, LongTermGoal } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

interface DateOption {
  label: string;
  value: string; // YYYY-MM-DD
}

function buildDateOptions(): DateOption[] {
  const now = dayjs().tz(TZ);
  return [
    { label: '今天', value: now.format('YYYY-MM-DD') },
    { label: '昨天', value: now.subtract(1, 'day').format('YYYY-MM-DD') },
    { label: '前天', value: now.subtract(2, 'day').format('YYYY-MM-DD') },
  ];
}

interface TaskCompleteModalProps {
  visible: boolean;
  task: Task | null;
  isPrerequisiteMet: boolean;
  goal?: LongTermGoal;
  onConfirm: (completedDate: string) => Promise<void>;
  onClose: () => void;
}

export default function TaskCompleteModal({
  visible,
  task,
  isPrerequisiteMet,
  onConfirm,
  onClose,
}: TaskCompleteModalProps) {
  const dateOptions = buildDateOptions();
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [loading, setLoading] = useState(false);

  if (!task) return null;

  const coin = calcCoin(task, isPrerequisiteMet);
  const showDiscount = (task.category === 'C' || task.category === 'D') && !isPrerequisiteMet;
  const timeSaved = task.category === 'B' ? task.time_saving_min : 0;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(selectedDate);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.taskName}>{task.name}</Text>

          <Text style={styles.sectionLabel}>什麼時候完成的？</Text>
          <View style={styles.dateRow}>
            {dateOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.dateChip,
                  selectedDate === opt.value && styles.dateChipSelected,
                ]}
                onPress={() => setSelectedDate(opt.value)}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    selectedDate === opt.value && styles.dateChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.rewardBox}>
            {task.category === 'A' && (
              <Text style={styles.rewardText}>完成打勾，繼續加油！</Text>
            )}
            {task.category === 'B' && (
              <Text style={styles.rewardText}>
                你幫家裡省了 <Text style={styles.rewardHighlight}>{timeSaved} 分鐘</Text>！
              </Text>
            )}
            {(task.category === 'C' || task.category === 'D') && (
              <>
                <Text style={styles.rewardText}>
                  可獲得{' '}
                  <Text style={[styles.rewardHighlight, showDiscount && styles.rewardDiscounted]}>
                    +{coin} 幣
                  </Text>
                </Text>
                {showDiscount && (
                  <Text style={styles.discountNote}>
                    完成所有本分任務後，幣值可恢復全額
                  </Text>
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>我完成了！</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  taskName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  dateChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dateChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  dateChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  dateChipTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  rewardBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  rewardText: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: '500',
  },
  rewardHighlight: {
    color: Colors.coin,
    fontWeight: 'bold',
    fontSize: 22,
  },
  rewardDiscounted: {
    color: Colors.warning,
  },
  discountNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
});
