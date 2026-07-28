// Shadow Wallet · Parent Tablet — Step 2 區塊容器
//
// Step 2 用 3–4 個區塊分組，不做成一張超長無分組的表單。
// 區塊本身是輕邊框 surface；欄位不再各自變成大卡片，避免卡片套卡片。

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

/**
 * 五種 editor 共用的頂部摘要：家族標題 + 一行「版本｜形式｜補充」。
 *
 * 抽出來是因為原本四支 editor 各自寫了一份一模一樣的 summary 樣式，
 * 只要有人改其中一支就會不一致；類型標題與副標由抽屜的固定 header 負責，不在這裡重複。
 */
export function EditorHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={s.summary}>
      <Text style={s.summaryTitle}>{title}</Text>
      <Text style={s.summaryMeta}>{meta}</Text>
    </View>
  );
}

/**
 * 區塊的視覺層級。
 *
 * surface = 白色圓角卡，用在「這是一個獨立概念」的內容（家長期待、適齡起點、政策）。
 * plain   = 沒有外框，只靠標題、helper、留白與一條細分隔線區隔。
 *
 * 之所以要兩種：一般表單欄位本身已經是卡片狀的輸入框與選項，外面再包一層白卡
 * 就變成卡片套卡片，垂直長度被撐開、層級反而看不出來。
 */
export type EditorSectionVariant = 'plain' | 'surface';

export function EditorSection({
  title,
  helper,
  variant = 'surface',
  children,
}: {
  title: string;
  helper?: string;
  variant?: EditorSectionVariant;
  children: React.ReactNode;
}) {
  const plain = variant === 'plain';
  return (
    <View style={plain ? s.sectionPlain : s.section}>
      {plain ? <View style={s.rule} /> : null}
      <View style={s.head}>
        <Text style={plain ? s.titlePlain : s.title}>{title}</Text>
        {helper ? <Text style={s.helper}>{helper}</Text> : null}
      </View>
      <View style={s.body}>{children}</View>
    </View>
  );
}

/** 區塊內的單一欄位（label + helper + 控制項 + 錯誤）。 */
export function EditorField({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={s.field}>{children}</View>;
}

const s = StyleSheet.create({
  summary: {
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
    gap: 4,
  },
  summaryTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  summaryMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
    lineHeight: 20,
  },
  section: {
    padding: ParentSpacing[5],
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    gap: ParentSpacing[4],
  },
  sectionPlain: {
    gap: ParentSpacing[4],
    paddingTop: ParentSpacing[2],
  },
  /** plain section 之間唯一的視覺分隔，比整張白卡輕得多。 */
  rule: {
    height: 1,
    backgroundColor: ParentColors.hairline,
    marginBottom: ParentSpacing[1],
  },
  head: {
    gap: 4,
  },
  title: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 26,
  },
  /** plain 的標題略小：它靠位置與留白建立層級，不需要靠字級喊。 */
  titlePlain: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 23,
  },
  helper: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.fgMuted,
  },
  body: {
    gap: ParentSpacing[5],
  },
  field: {
    gap: ParentSpacing[2],
  },
});
