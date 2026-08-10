// Shadow Wallet · Parent Tablet — 自訂流程的「目前為止填了什麼」摘要
//
// Step 2、Step 3 與 editor 上方都用同一張。
//
// 上面**只出現家長自己輸入或選過的東西**：
//   任務名稱、他寫的期待、他選的方向、他選的安排。
//
// 不出現：假的 preset 家族、A／B／C／D、purposeCategory、editorKind、
// durationChoice、任何 internal code。家長從沒看過那些字，
// 在一張「你剛剛填了這些」的卡片上看到它們只會覺得填錯了東西。

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import type { PurposeCategory } from '../taskCatalog';
import { PresetGlyph } from '../drawerIcons';
import {
  CUSTOM_TASK_BADGE,
  CUSTOM_TASK_ICON_KEY,
  SUMMARY_COPY,
} from './customTaskCopy';

function Row({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export function CustomTaskSummaryCard({
  title,
  expectation,
  purposeCategory,
  purposeLabel,
  arrangementLabel,
  blockTitle = SUMMARY_COPY.title,
}: {
  title: string;
  /** 家長寫的期待。空的就整列不顯示，不寫「未填寫」。 */
  expectation?: string;
  /** 有選目的才給；決定圖示色調。沒選之前用中性色。 */
  purposeCategory?: PurposeCategory;
  /** 目的的生活化名稱。還沒選就不傳。 */
  purposeLabel?: string;
  /** 執行安排的生活化名稱（「固定重複」等）。還沒選就不傳。 */
  arrangementLabel?: string;
  blockTitle?: string;
}) {
  const category: PurposeCategory = purposeCategory ?? 'learning_skill';

  return (
    <View style={s.card}>
      <Text style={s.blockTitle}>{blockTitle}</Text>
      <View style={s.head}>
        <PresetGlyph kind={CUSTOM_TASK_ICON_KEY[category]} category={category} size={44} />
        <View style={s.headText}>
          <Text style={s.badge}>{CUSTOM_TASK_BADGE}</Text>
          <Text style={s.title}>{title}</Text>
        </View>
      </View>
      <View style={s.rows}>
        <Row label={SUMMARY_COPY.purposeLabel} value={purposeLabel} />
        <Row label={SUMMARY_COPY.arrangementLabel} value={arrangementLabel} />
        <Row label={SUMMARY_COPY.expectationLabel} value={expectation} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 4,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurfaceWarm,
    gap: ParentSpacing[3],
  },
  blockTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgMuted,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[4],
  },
  headText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  badge: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine400,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 26,
  },
  rows: { gap: ParentSpacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
  },
  rowLabel: {
    width: 72,
    minWidth: 72,
    flexShrink: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    lineHeight: 22,
  },
  rowValue: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
});
