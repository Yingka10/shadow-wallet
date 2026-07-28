// Shadow Wallet · Parent Tablet — 任務家族卡（抽屜 Step 1）
//
// 一個家族只顯示一張卡。形式標籤是「摘要」不是列舉 ——
// 多版本時顯示「可選固定／計畫」，不把每個 variant 的標籤都塞上去。
// 執行方式在 Step 2 才選。
//
// 整張卡可點，卡上不放第二顆按鈕（選取即是唯一動作）。

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../constants/parentTheme';
import { PresetGlyph, CheckMarkIcon } from './drawerIcons';
import {
  PURPOSE_LABEL,
  defaultVariantOf,
  familyFormSummary,
  type TaskPresetFamily,
} from './taskCatalog';

export function TaskPresetCard({
  family,
  selected,
  onPress,
  density = 'full',
}: {
  family: TaskPresetFamily;
  selected: boolean;
  onPress: (family: TaskPresetFamily) => void;
  /**
   * compact = 說明只留一行。用在推薦清單後段：家長多半掃過標題與標籤就決定了，
   * 前幾張留完整說明就夠，後面沒必要每張都佔滿三行。
   */
  density?: 'full' | 'compact';
}) {
  const compact = density === 'compact';
  // 卡片上的分類與配色以預設版本為準（家族可跨分類，例如運動同時是學習與自主挑戰）。
  const primary = defaultVariantOf(family);
  const purposeLabel = PURPOSE_LABEL[primary.purposeCategory];
  const formSummary = familyFormSummary(family);

  // 一張卡最多顯示一行輔助說明：安全提醒優先於回饋提示。
  const note = primary.safetyNotes?.[0] ?? primary.feedbackHint ?? null;

  // 只有單一版本且是長期時才在卡上露出天數；多版本時天數屬 Step 2 的資訊。
  const durationDays =
    family.variants.length === 1 ? primary.defaultDraft.durationDays : undefined;

  return (
    <TouchableOpacity
      style={[s.card, compact && s.cardCompact, selected && s.cardSelected]}
      onPress={() => onPress(family)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${family.title}，${purposeLabel}，${formSummary}`}
    >
      <PresetGlyph kind={family.iconKey} category={primary.purposeCategory} />

      <View style={s.main}>
        <Text style={s.title}>{family.title}</Text>
        {/* 說明最多兩行（compact 一行）：卡片是掃讀用的，完整內容在 Step 2。 */}
        <Text style={s.desc} numberOfLines={compact ? 1 : 2}>
          {family.description}
        </Text>

        <View style={s.metaRow}>
          <View style={s.tag}>
            <Text style={s.tagText}>{purposeLabel}</Text>
          </View>
          <View style={[s.tag, s.tagQuiet]}>
            <Text style={[s.tagText, s.tagTextQuiet]}>{formSummary}</Text>
          </View>
          {durationDays ? <Text style={s.durationText}>建議 {durationDays} 天</Text> : null}
        </View>

        {/* 回饋提示是 GrowBook 規則辨識度的來源，不刪；壓成一行、色階再淡一階。 */}
        {note ? <Text style={s.note} numberOfLines={1}>{note}</Text> : null}
      </View>

      <View style={[s.check, selected && s.checkOn]}>
        {selected ? <CheckMarkIcon size={13} color={ParentColors.onSidebar} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
    paddingHorizontal: ParentSpacing[4],
    // 上下各收 5px：一頁多放進一張卡，觸控高度仍遠高於下限。
    paddingVertical: ParentSpacing[4] - 5,
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    borderRadius: ParentRadii.md,
  },
  cardSelected: {
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
  },
  cardCompact: {
    paddingVertical: ParentSpacing[3],
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  desc: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 20,
    color: ParentColors.fgSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
    marginTop: 1,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ParentRadii.sm,
    backgroundColor: ParentColors.tintLeaf,
  },
  tagQuiet: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  tagText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.leaf700,
  },
  tagTextQuiet: {
    color: ParentColors.fgSecondary,
    fontWeight: ParentFontWeights.medium,
  },
  durationText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  note: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 17,
    color: ParentColors.fgMuted,
    marginTop: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: ParentColors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  checkOn: {
    backgroundColor: ParentColors.pine500,
    borderColor: ParentColors.pine500,
  },
});
