// Shadow Wallet · Parent Tablet — 自訂流程的大型選擇卡
//
// 起點、任務目的、執行安排三頁都是「四選一／三選一／二選一」，
// 版面完全一樣。共用一個元件而不是各寫一份 —— 三份的話，
// 選取狀態的無障礙屬性遲早只有其中一份是對的。
//
// 選取不只靠顏色：
//   · 左側 radio 的實心圓點（形狀）
//   · 深松綠外框 ＋ 淡綠底（顏色）
//   · accessibilityState.selected（讀螢幕）
// 三者同時存在，任何一種感官都能分辨。

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { PresetGlyph } from '../drawerIcons';
import type { IconKey, PurposeCategory } from '../taskCatalog';

export function CustomChoiceCard({
  label,
  description,
  examples,
  selectedNote,
  selected,
  onPress,
  iconKey,
  iconCategory,
}: {
  label: string;
  description: string;
  /** 生活化例子。沒有就不佔位置。 */
  examples?: string;
  /** 只有選中時才顯示的提醒。 */
  selectedNote?: string;
  selected: boolean;
  onPress: () => void;
  /** 省略 = 不顯示圖示（執行安排那一頁沒有圖示，避免三張卡看起來像三種任務）。 */
  iconKey?: IconKey;
  iconCategory?: PurposeCategory;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        selected && s.cardSelected,
        pressed && !selected && s.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      <View style={s.top}>
        <View style={[s.radio, selected && s.radioOn]}>
          {selected ? <View style={s.radioDot} /> : null}
        </View>

        {iconKey && iconCategory ? (
          <PresetGlyph kind={iconKey} category={iconCategory} size={44} />
        ) : null}

        <View style={s.text}>
          <Text style={[s.label, selected && s.labelSelected]}>{label}</Text>
          <Text style={s.description}>{description}</Text>
          {examples ? <Text style={s.examples}>{examples}</Text> : null}
        </View>
      </View>

      {selected && selectedNote ? (
        <View style={s.note}>
          <Text style={s.noteText}>{selectedNote}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 2,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    gap: ParentSpacing[3],
  },
  /** 選取＝深松綠外框 ＋ 淡綠底。刻意不用亮藍色 —— 家長端沒有那個顏色。 */
  cardSelected: {
    borderWidth: 2,
    borderColor: ParentColors.pine500,
    backgroundColor: ParentColors.tintPine,
    // 邊框變粗會讓卡片外擴 1px，補回內距讓整列不跳動。
    paddingHorizontal: ParentSpacing[5] - 1,
    paddingVertical: ParentSpacing[5] - 3,
  },
  cardPressed: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ParentColors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  radioOn: {
    borderColor: ParentColors.pine500,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ParentColors.pine500,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  label: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 26,
  },
  labelSelected: {
    color: ParentColors.pine500,
  },
  description: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  examples: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
  note: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurface,
  },
  noteText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
});
