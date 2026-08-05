// Shadow Wallet — 環境標示
//
// 存在的理由很具體：staging 與正式專案的畫面**長得一模一樣**。
// 同樣的版面、同樣的任務卡、同樣能登入。驗收時在哪一邊操作，
// 只能靠自己記得，而人不會一直記得。
//
// 所以這裡只做一件事：把「你現在在測試環境」寫在畫面上。
//
// 刻意不是紅色警告：staging 不是錯誤狀態，把它畫成警示會讓人學會忽略它。
// 也刻意不可點擊 —— 它不是切換器，看起來能按卻沒有反應更糟。

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ENVIRONMENT_BADGE_A11Y_LABEL,
  ENVIRONMENT_BADGE_LABEL,
  supabaseEnvironment,
  type AppEnvironment,
} from '../lib/environment';
import {
  ParentColors,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../constants/parentTheme';

export type EnvironmentBadgeProps = {
  /** 測試用的注入點；正常情況由環境決定。 */
  appEnvironment?: AppEnvironment;
  visible?: boolean;
};

export function EnvironmentBadge({ appEnvironment, visible }: EnvironmentBadgeProps) {
  const resolvedEnvironment =
    appEnvironment ?? (supabaseEnvironment.ok ? supabaseEnvironment.info.appEnvironment : undefined);
  const resolvedVisible =
    visible ?? (supabaseEnvironment.ok ? supabaseEnvironment.info.showBadge : false);

  if (!resolvedVisible || !resolvedEnvironment) return null;

  const label = ENVIRONMENT_BADGE_LABEL[resolvedEnvironment];
  if (!label) return null;

  return (
    <View
      style={s.badge}
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={ENVIRONMENT_BADGE_A11Y_LABEL}
    >
      {/* 意思由文字承擔，不是由顏色 —— 色盲與灰階截圖都讀得到。 */}
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: ParentSpacing[2],
    right: ParentSpacing[2],
    // 疊在最上層但不吃事件（pointerEvents="none"），
    // 所以不會擋住抽屜、側欄或右上角的任何操作。
    zIndex: 1000,
    paddingHorizontal: ParentSpacing[2],
    paddingVertical: ParentSpacing[1] / 2,
    borderRadius: ParentRadii.pill,
    backgroundColor: ParentColors.tintPine,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ParentColors.fgMuted,
  },
  label: {
    fontSize: ParentFontSizes.eyebrow,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgSecondary,
    letterSpacing: 1,
  },
});

export default EnvironmentBadge;
