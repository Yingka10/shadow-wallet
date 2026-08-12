import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Colors } from '../constants/colors';

const { width: SW } = Dimensions.get('window');

export type FeedbackType =
  | 'task-a'
  | 'task-b'
  | 'task-c'
  | 'milestone'
  /**
   * 完成了一次，但這一次**不是** reward event。
   *
   * per_period 任務在本期達標之前走這一種：留下投入紀錄、講清楚離達標還差幾次，
   * 但一個幣值數字都不出現。用 task-c 代替會憑空發明一次沒有發生的發幣。
   */
  | 'period-progress';

interface FeedbackAnimationProps {
  visible: boolean;
  type: FeedbackType;
  value?: number; // coins for task-c/milestone, minutes for task-b
  /** period-progress 專用：含這一次在內，本期已完成幾次。 */
  periodDone?: number;
  /** period-progress 專用：約定的達標次數。 */
  periodTarget?: number | null;
  onComplete: () => void;
}

function CheckmarkFeedback({ onComplete }: { onComplete: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View style={[styles.checkBox, { transform: [{ scale }], opacity }]}>
        <Text style={styles.checkIcon}>✓</Text>
        <Text style={styles.feedbackLabel}>做到了！</Text>
      </Animated.View>
    </View>
  );
}

function TimeSavingFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View style={[styles.feedbackCard, { transform: [{ translateY }], opacity }]}>
        <Text style={styles.hourglassLarge}>⏳</Text>
        <Text style={styles.timeSavingBig}>你幫家裡省了</Text>
        <Text style={styles.timeSavingValue}>{value} 分鐘</Text>
      </Animated.View>
    </View>
  );
}

function CoinFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 14 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(translateY, {
        toValue: -60,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View
        style={[styles.coinBurst, { transform: [{ scale }, { translateY }], opacity }]}
      >
        <Text style={styles.coinBurstText}>+{value}</Text>
        <Text style={styles.coinBurstUnit}>幣！</Text>
      </Animated.View>
    </View>
  );
}

function MilestoneFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const confettiOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 16 }),
      Animated.timing(confettiOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <Animated.View style={[styles.milestoneOverlay, { opacity }]}>
      <Animated.View style={[styles.milestoneCard, { transform: [{ scale }] }]}>
        <Text style={styles.milestoneEmoji}>🎉</Text>
        <Text style={styles.milestoneTitle}>恭喜達成！</Text>
        <Text style={styles.milestoneReward}>獲得 {value} 幣！</Text>
      </Animated.View>
      <Animated.Text style={[styles.confetti, { opacity: confettiOpacity }]}>
        {'🌟 ⭐ ✨ 🌟 ⭐ ✨'}
      </Animated.Text>
    </Animated.View>
  );
}

/**
 * 「這次記錄下來了，本週還差幾次」。
 *
 * 刻意不做的事：不畫火焰、不講連續幾天、不因為漏一天就說挑戰失敗，
 * 也不顯示任何幣值 —— 這一次真的沒有發幣。
 */
function PeriodProgressFeedback({
  done,
  target,
  onComplete,
}: {
  done: number;
  target: number | null;
  onComplete: () => void;
}) {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.delay(1400),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  const remaining = target != null ? Math.max(0, target - done) : null;

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View
        style={[styles.periodCard, { opacity, transform: [{ translateY }] }]}
      >
        <Text style={styles.periodTitle}>這次記錄下來了</Text>
        {target != null && (
          <Text style={styles.periodCount}>
            本週 {done} / {target} 次
          </Text>
        )}
        {remaining != null && remaining > 0 && (
          <Text style={styles.periodHint}>再完成 {remaining} 次，就完成本週的穩定投入</Text>
        )}
      </Animated.View>
    </View>
  );
}

export default function FeedbackAnimation({
  visible,
  type,
  value = 0,
  periodDone = 0,
  periodTarget = null,
  onComplete,
}: FeedbackAnimationProps) {
  if (!visible) return null;

  if (type === 'milestone') {
    return (
      <Modal transparent visible={visible} animationType="fade">
        <MilestoneFeedback value={value} onComplete={onComplete} />
      </Modal>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none">
      {type === 'task-a' && <CheckmarkFeedback onComplete={onComplete} />}
      {type === 'task-b' && <TimeSavingFeedback value={value} onComplete={onComplete} />}
      {type === 'task-c' && <CoinFeedback value={value} onComplete={onComplete} />}
      {type === 'period-progress' && (
        <PeriodProgressFeedback
          done={periodDone}
          target={periodTarget}
          onComplete={onComplete}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodCard: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 22,
    paddingHorizontal: 28,
    borderRadius: 20,
    alignItems: 'center',
    maxWidth: SW * 0.8,
  },
  periodTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  periodCount: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 10,
  },
  periodHint: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  checkBox: {
    backgroundColor: Colors.success,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 160,
  },
  checkIcon: {
    fontSize: 56,
    color: '#fff',
    fontWeight: 'bold',
  },
  feedbackLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  feedbackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  hourglassLarge: {
    fontSize: 48,
    marginBottom: 8,
  },
  timeSavingBig: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: '500',
  },
  timeSavingValue: {
    fontSize: 36,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 4,
  },
  coinBurst: {
    alignItems: 'center',
  },
  coinBurstText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: Colors.coin,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  coinBurstUnit: {
    fontSize: 28,
    color: Colors.coin,
    fontWeight: '700',
  },
  milestoneOverlay: {
    flex: 1,
    backgroundColor: 'rgba(74, 144, 217, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneCard: {
    backgroundColor: Colors.surface,
    borderRadius: 28,
    padding: 40,
    alignItems: 'center',
    width: SW * 0.8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  milestoneEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  milestoneTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  milestoneReward: {
    fontSize: 22,
    color: Colors.coin,
    fontWeight: '700',
  },
  confetti: {
    fontSize: 24,
    marginTop: 32,
    letterSpacing: 8,
  },
});
