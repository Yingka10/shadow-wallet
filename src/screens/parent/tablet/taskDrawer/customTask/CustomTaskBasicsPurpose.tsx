// Shadow Wallet · Parent Tablet — 自訂基本設定 2／3：這件事主要是為了什麼
//
// ─────────────────────────────────────────────────────────────────────────
// **首次進入四項都不可預選。**
//
// 這不是保守，是這一頁唯一真正重要的規則。任務名稱寫「每天閱讀」時，
// 猜「學習或練習技能」幾乎一定猜得對 —— 而那正是問題所在：預選會讓
// 這一步從「你希望孩子學到什麼」變成「確認一下系統猜得對不對」，
// 家長按下一步時根本沒有想過那個問題。
//
// 這一頁因此**不呼叫 classifyTask、不呼叫 Gemini、不看關鍵字**。
// 已由測試釘住。
//
// 畫面上也沒有 A／B／C／D —— 那四個代號只活在 purposeCategoryOf() 之後。
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { CustomChoiceCard } from './CustomChoiceCard';
import { CustomTaskSummaryCard } from './CustomTaskSummaryCard';
import { PURPOSE_OPTIONS, STEP2_COPY, CUSTOM_TASK_ICON_KEY } from './customTaskCopy';
import { purposeCategoryOf, type CustomTaskPurposeChoice } from './customTaskContract';

export function CustomTaskBasicsPurpose({
  title,
  expectation,
  selected,
  onSelect,
}: {
  title: string;
  expectation: string;
  /** null = 首次進入。**不得由呼叫端塞一個猜出來的預設值。** */
  selected: CustomTaskPurposeChoice | null;
  onSelect: (choice: CustomTaskPurposeChoice) => void;
}) {
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <CustomTaskSummaryCard
        blockTitle={STEP2_COPY.summaryTitle}
        title={title}
        expectation={expectation}
      />

      <View style={s.question}>
        <Text style={s.questionTitle}>{STEP2_COPY.question}</Text>
        <Text style={s.questionHelper}>{STEP2_COPY.helper}</Text>
      </View>

      <View
        style={s.list}
        accessibilityRole="radiogroup"
        accessibilityLabel={STEP2_COPY.question}
      >
        {PURPOSE_OPTIONS.map(option => {
          const category = purposeCategoryOf(option.choice);
          return (
            <CustomChoiceCard
              key={option.choice}
              label={option.label}
              description={option.description}
              examples={option.examples}
              {...(option.selectedNote ? { selectedNote: option.selectedNote } : null)}
              selected={selected === option.choice}
              onPress={() => onSelect(option.choice)}
              iconKey={CUSTOM_TASK_ICON_KEY[category]}
              iconCategory={category}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[4],
    paddingBottom: ParentSpacing[8],
    gap: ParentSpacing[4],
  },
  question: { gap: 4 },
  questionTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 24,
  },
  questionHelper: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgMuted,
  },
  list: { gap: ParentSpacing[3] },
});
