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

export type FeedbackType = 'task-a' | 'task-b' | 'task-c' | 'milestone';

interface FeedbackAnimationProps {
  visible: boolean;
  type: FeedbackType;
  value?: number; // coins for task-c/milestone, minutes for task-b
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

export default function FeedbackAnimation({
  visible,
  type,
  value = 0,
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
