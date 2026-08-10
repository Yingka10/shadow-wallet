import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Ellipse, G } from 'react-native-svg';
import { Colors } from '../constants/colors';
import { clarifyWish, type WishClarifyHistoryTurn } from '../lib/aiAgent';

type BubbleConfig = {
  size: number;
  top?: ViewStyle['top'];
  bottom?: ViewStyle['bottom'];
  left?: ViewStyle['left'];
  right?: ViewStyle['right'];
  duration: number;
  delay: number;
};

export type WishSubmitPayload = {
  /** 孩子輸入的原句，含贅字語助詞，未經摘要。 */
  wishText: string;
  /** AI 濃縮過的短標題（去掉「我想要」之類贅詞），畫面上顯示這個，不是 wishText。 */
  shortTitle: string;
  wishType: 'item' | 'privilege';
  reason: string;
  summary: string;
  suggestedCoins: number;
  confirmNeeded: string[];
};

interface WishModalComponentProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: WishSubmitPayload) => Promise<void>;
  childNickname?: string;
  /** 用來調整 AI 澄清問答的口吻，未提供時預設 MVP 主打的 6-9 歲。 */
  ageGroup?: string;
}

/**
 * 許願弹窗元件
 * 包含：
 * - 大樹視覺 (SVG)
 * - 漂浮氣泡動畫
 * - 對話框文本
 * - 語音/文字輸入（先用文字）
 * - 確認流程
 */
type Step = 'listening' | 'confirm' | 'clarifying' | 'sending';

export default function WishModalComponent({
  visible,
  onClose,
  onSubmit,
  childNickname = '小寶貝',
  ageGroup = '6-9',
}: WishModalComponentProps) {
  const [step, setStep] = useState<Step>('listening');
  const [wishText, setWishText] = useState('');
  const [loading, setLoading] = useState(false);
  const [useImage, setUseImage] = useState(false);

  // ── 澄清問答 ──────────────────────────────────────────────
  // 選項式追問，最多兩輪（見 aiAgent.clarifyWish）。以選項按鈕為主，
  // 但選項有時候套不上孩子真正想講的話，所以也留一個自己打字的入口。
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<{ question: string; options: string[] } | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const historyRef = useRef<WishClarifyHistoryTurn[]>([]);

  const treeAnimVal = useRef(new Animated.Value(0)).current;
  const bubbleAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  // 嘗試載入圖片
  useEffect(() => {
    try {
      require('../../assets/images/child/pretty_wish_tree_trimmed.png');
      setUseImage(true);
    } catch {
      setUseImage(false);
    }
  }, []);

  // 大樹進場動畫
  useEffect(() => {
    if (visible) {
      setStep('listening');
      setWishText('');
      setClarifyLoading(false);
      setCurrentQuestion(null);
      setCustomAnswer('');
      historyRef.current = [];
      treeAnimVal.setValue(0);
      Animated.timing(treeAnimVal, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, treeAnimVal]);

  // 氣泡漂浮動畫
  useEffect(() => {
    if (!visible) return;

    const bubbleDurations = [6200, 7400, 5300, 8100, 6800];
    const bubbleDelays = [0, 1100, 2100, 600, 1900];

    const startBubble = (index: number) => {
      bubbleAnims[index].setValue(0);
      Animated.timing(bubbleAnims[index], {
        toValue: 1,
        duration: bubbleDurations[index],
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => startBubble(index));
    };

    bubbleDelays.forEach((delay, i) => {
      setTimeout(() => startBubble(i), delay);
    });
  }, [visible, bubbleAnims]);

  const treeScale = treeAnimVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  const treeOpacity = treeAnimVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const treeTranslateY = treeAnimVal.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  const bubbleTransforms = bubbleAnims.map(anim => ({
    translateY: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, -14, 0],
    }),
    scale: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 1.04, 1],
    }),
    opacity: anim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0.5, 0.9, 0.5],
    }),
  }));

  const handleConfirm = async () => {
    if (step === 'listening') {
      if (wishText.trim()) {
        setStep('confirm');
      }
    } else if (step === 'confirm') {
      historyRef.current = [];
      setStep('clarifying');
      setClarifyLoading(true);
      try {
        const result = await clarifyWish(wishText.trim(), ageGroup, []);
        await applyClarifyResult(result);
      } catch (err) {
        console.error('[WishModal] clarify error:', err);
        await finalizeWish({ shortTitle: wishText.trim(), wishType: 'item', reason: wishText.trim(), summary: wishText.trim(), suggestedCoins: 40, confirmNeeded: [] });
      }
    }
  };

  const handleRestart = () => {
    setWishText('');
    setStep('listening');
  };

  /** clarifyWish 的回應要嘛是再問一題，要嘛是整理完成——分派到對應的下一步。 */
  const applyClarifyResult = async (result: Awaited<ReturnType<typeof clarifyWish>>) => {
    if (result.done === false) {
      setCurrentQuestion({ question: result.question, options: result.options });
      setClarifyLoading(false);
      return;
    }
    await finalizeWish(result);
  };

  const handleOptionAnswer = async (option: string) => {
    if (!currentQuestion || !option.trim()) return;
    historyRef.current = [...historyRef.current, { question: currentQuestion.question, answer: option.trim() }];
    setCurrentQuestion(null);
    setCustomAnswer('');
    setClarifyLoading(true);
    try {
      const result = await clarifyWish(wishText.trim(), ageGroup, historyRef.current);
      await applyClarifyResult(result);
    } catch (err) {
      console.error('[WishModal] clarify error:', err);
      await finalizeWish({ shortTitle: wishText.trim(), wishType: 'item', reason: wishText.trim(), summary: wishText.trim(), suggestedCoins: 40, confirmNeeded: [] });
    }
  };

  /** AI 整理完成後，只用友善文字送出——幣值／分類這些大人語言不出現在孩子面前。 */
  const finalizeWish = async (data: {
    shortTitle: string;
    wishType: 'item' | 'privilege';
    reason: string;
    summary: string;
    suggestedCoins: number;
    confirmNeeded: string[];
  }) => {
    setClarifyLoading(false);
    setStep('sending');
    setLoading(true);
    try {
      await onSubmit({ wishText: wishText.trim(), ...data });
      setWishText('');
      onClose();
    } catch (err) {
      console.error('[WishModal] submit error:', err);
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* 關閉按鈕 */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          {/* 標題 */}
          <Text style={styles.topHint}>對許願樹說出你的願望</Text>

          {/* 漂浮氣泡 */}
          {(([
            { size: 90, top: '4%', left: '4%', duration: 6200, delay: 0 },
            { size: 55, top: '9%', right: '7%', duration: 7400, delay: 1100 },
            { size: 38, top: '22%', left: '12%', duration: 5300, delay: 2100 },
            { size: 70, bottom: '22%', right: '4%', duration: 8100, delay: 600 },
            { size: 48, bottom: '34%', left: '6%', duration: 6800, delay: 1900 },
          ]) as BubbleConfig[]).map((bubble, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bubble,
                {
                  width: bubble.size,
                  height: bubble.size,
                  top: bubble.top,
                  bottom: bubble.bottom,
                  left: bubble.left,
                  right: bubble.right,
                },
                {
                  opacity: bubbleTransforms[i].opacity,
                  transform: [
                    { translateY: bubbleTransforms[i].translateY },
                    { scale: bubbleTransforms[i].scale },
                  ],
                },
              ]}
            />
          ))}

          {/* 樹：優先使用圖片，後備 SVG */}
          <Animated.View
            style={[
              styles.treeWrap,
              {
                opacity: treeOpacity,
                transform: [
                  { scale: treeScale },
                  { translateY: treeTranslateY },
                ],
              },
            ]}
          >
            {useImage ? (
              <Image
                source={require('../../assets/images/child/pretty_wish_tree_trimmed.png')}
                style={{ width: 180, height: 180 }}
                resizeMode="contain"
              />
            ) : (
              <Svg width={180} height={180} viewBox="0 0 120 120">
                <G>
                  {/* 樹冠 */}
                  <Circle cx="60" cy="45" r="32" fill="#8FC840" opacity="0.95" />
                  <Circle cx="42" cy="38" r="24" fill="#A0D840" opacity="0.92" />
                  <Circle cx="78" cy="38" r="26" fill="#70B030" opacity="0.93" />
                  <Circle cx="50" cy="28" r="20" fill="#B0E040" opacity="0.88" />
                  <Circle cx="70" cy="26" r="22" fill="#90C840" opacity="0.91" />

                  {/* 樹幹 */}
                  <Path
                    d="M 52 70 Q 50 85 52 100 L 68 100 Q 70 85 68 70 Z"
                    fill="#8B6F47"
                    opacity="0.9"
                  />

                  {/* 樹根 */}
                  <Path d="M 45 100 Q 40 108 35 110" stroke="#6B5A3B" strokeWidth="2" fill="none" />
                  <Path d="M 75 100 Q 80 108 85 110" stroke="#6B5A3B" strokeWidth="2" fill="none" />
                  <Path d="M 60 100 Q 60 108 60 112" stroke="#6B5A3B" strokeWidth="2" fill="none" />

                  {/* 陰影/泥土 */}
                  <Ellipse cx="60" cy="112" rx="28" ry="6" fill="#D4C9A8" opacity="0.5" />
                </G>
              </Svg>
            )}
          </Animated.View>

          {/* 狀態文本 */}
          <Text style={styles.treeStatus}>
            {step === 'listening' && '許願樹正在等待⋯'}
            {step === 'confirm' && '許願樹收到你的願望⋯'}
            {step === 'clarifying' && '許願樹正在想一想⋯'}
            {step === 'sending' && '許願樹幫你種下願望⋯'}
          </Text>

          {/* 對話框區域 */}
          <View style={styles.dialogArea}>
            {step === 'listening' && (
              <Text style={styles.dialogText}>
                {`${childNickname}，\n你想要什麼？\n說給許願樹聽吧！`}
              </Text>
            )}
            {step === 'confirm' && (
              <Text style={styles.dialogText}>
                {`許願樹聽到了，\n${childNickname} 想要：`}
              </Text>
            )}
            {step === 'clarifying' && (
              <Text style={styles.dialogText}>
                {clarifyLoading || !currentQuestion
                  ? '許願樹想再多問一點點⋯'
                  : currentQuestion.question}
              </Text>
            )}
            {step === 'sending' && (
              <Text style={styles.dialogText}>
                {`許願樹收到了！\n幫你把願望種下去⋯`}
              </Text>
            )}
          </View>

          {/* 確認框 */}
          {step === 'confirm' && (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmLabel}>許願樹聽到你說的是⋯</Text>
              <Text style={styles.confirmValue}>{wishText}</Text>
              <View style={styles.confirmBtns}>
                <TouchableOpacity
                  style={[styles.cbtn, styles.cbtnYes]}
                  onPress={handleConfirm}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.success} />
                  ) : (
                    <Text style={styles.cbtnYesText}>對，就是這個！</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cbtn, styles.cbtnNo]}
                  onPress={handleRestart}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cbtnNoText}>重新說一次</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 澄清問答：選項按鈕為主，也留一個自己打字的入口 */}
          {step === 'clarifying' && (
            <View style={styles.clarifyArea}>
              {clarifyLoading || !currentQuestion ? (
                <ActivityIndicator size="small" color={Colors.success} />
              ) : (
                <>
                  <View style={styles.optionList}>
                    {currentQuestion.options.map(option => (
                      <TouchableOpacity
                        key={option}
                        style={styles.optionBtn}
                        onPress={() => handleOptionAnswer(option)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.optionBtnText}>{option}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.customAnswerDivider}>或是自己打</Text>
                  <View style={styles.customAnswerRow}>
                    <TextInput
                      style={styles.customAnswerInput}
                      placeholder="輸入你想說的"
                      placeholderTextColor="#9a9060"
                      value={customAnswer}
                      onChangeText={setCustomAnswer}
                      maxLength={40}
                    />
                    <TouchableOpacity
                      style={[styles.customAnswerBtn, !customAnswer.trim() && styles.customAnswerBtnDisabled]}
                      onPress={() => handleOptionAnswer(customAnswer)}
                      disabled={!customAnswer.trim()}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.customAnswerBtnText}>送出</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          )}

          {/* 送出中 */}
          {step === 'sending' && (
            <View style={styles.clarifyArea}>
              <ActivityIndicator size="small" color={Colors.success} />
            </View>
          )}

          {/* 輸入框區域 */}
          {step === 'listening' && (
            <View style={styles.voiceArea}>
              <TextInput
                style={styles.wishInput}
                placeholder={`${childNickname}想要什麼呢？`}
                placeholderTextColor="#9a9060"
                value={wishText}
                onChangeText={setWishText}
                multiline
                maxLength={200}
              />
              <TouchableOpacity
                style={[styles.submitBtn, !wishText.trim() && styles.submitBtnDisabled]}
                onPress={handleConfirm}
                disabled={!wishText.trim()}
                activeOpacity={0.85}
              >
                <Text style={styles.submitBtnText}>送出</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    height: '85%',
    backgroundColor: '#f7f2e6',
    borderRadius: 20,
    overflow: 'hidden',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(100,140,40,0.10)',
    borderWidth: 0.5,
    borderColor: 'rgba(100,140,40,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  closeBtnText: {
    color: '#6a8040',
    fontSize: 16,
    fontWeight: '500',
  },
  topHint: {
    fontSize: 11,
    color: '#8a9050',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'rgba(140,190,60,0.07)',
    borderWidth: 0.5,
    borderColor: 'rgba(140,190,60,0.10)',
    pointerEvents: 'none',
  },
  treeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 10,
  },
  treeStatus: {
    fontSize: 12,
    color: '#7a8a40',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 20,
  },
  dialogArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  dialogText: {
    fontSize: 15,
    color: '#4a3a20',
    textAlign: 'center',
    lineHeight: 24,
  },
  confirmBox: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: 'rgba(140,180,60,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(140,180,60,0.22)',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  confirmLabel: {
    fontSize: 12,
    color: '#8a9050',
    marginBottom: 8,
  },
  confirmValue: {
    fontSize: 17,
    color: '#3a2f18',
    marginBottom: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  cbtn: {
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cbtnYes: {
    backgroundColor: 'rgba(100,140,40,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(100,140,40,0.4)',
  },
  cbtnYesText: {
    fontSize: 14,
    color: '#4d7620',
    fontWeight: '700',
  },
  cbtnNo: {
    backgroundColor: 'transparent',
    borderWidth: 0.5,
    borderColor: 'rgba(160,140,80,0.22)',
  },
  cbtnNoText: {
    fontSize: 13,
    color: '#9a8060',
  },
  clarifyArea: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  optionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(100,140,40,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(100,140,40,0.32)',
  },
  optionBtnText: {
    fontSize: 13,
    color: '#5a7a20',
    fontWeight: '600',
  },
  customAnswerDivider: {
    fontSize: 11,
    color: '#9a9060',
    marginTop: 14,
    marginBottom: 8,
  },
  customAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  customAnswerInput: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: '#fff8e8',
    borderWidth: 0.5,
    borderColor: 'rgba(180,150,80,0.14)',
    borderRadius: 20,
    fontSize: 13,
    color: '#4a3a20',
  },
  customAnswerBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(100,140,40,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(100,140,40,0.32)',
  },
  customAnswerBtnDisabled: {
    opacity: 0.5,
  },
  customAnswerBtnText: {
    fontSize: 13,
    color: '#5a7a20',
    fontWeight: '600',
  },
  voiceArea: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
    gap: 12,
  },
  wishInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff8e8',
    borderWidth: 0.5,
    borderColor: 'rgba(180,150,80,0.14)',
    borderRadius: 12,
    fontSize: 13,
    color: '#4a3a20',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 26,
    backgroundColor: 'rgba(100,140,40,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(100,140,40,0.32)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontSize: 13,
    color: '#5a7a20',
    fontWeight: '500',
  },
});
