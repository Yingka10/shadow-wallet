import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface Props {
  completed: boolean;
  /** true = 完成會發幣，用金環；false = 不發幣（本分任務），用中性環 */
  paysCoin?: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}

/**
 * 金幣勾選圈 —— 孩子端任務列的完成控件（位置即狀態，不用狀態文字/chip）。
 * 未完成：空心圓環，發幣任務用金環（coinRing）、本分任務用中性環（bark300）。
 * 完成：填滿葉綠 + 白勾。
 */
export default function CoinCheckbox({
  completed,
  paysCoin = false,
  onPress,
  disabled = false,
  size = 30,
}: Props) {
  const ringColor = paysCoin ? Colors.coinRing : Colors.bark300;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed, disabled }}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
        completed
          ? styles.done
          : { borderColor: ringColor, borderWidth: paysCoin ? 2.5 : 2 },
      ]}
    >
      {completed && (
        <Svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="#FFFFFF"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  done: {
    backgroundColor: Colors.leaf500,
    borderWidth: 0,
  },
});
