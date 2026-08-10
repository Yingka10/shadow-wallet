// Shadow Wallet · Parent Tablet — 自訂基本設定 3／3：預計怎麼進行
//
// ─────────────────────────────────────────────────────────────────────────
// 這一頁只問一件事：這件事要進行多久。
//
// 它**不問**執行日、每次幾分鐘、時段、完成標準或回饋方式 ——
// 那些是 editor 的欄位，而每一支 editor 需要的又不一樣。
// 全部塞進「基本設定 3／3」的話，這一頁會變成一份五種形式的聯集表單，
// 而其中一半的欄位對家長剛選的那一種根本沒有意義。
//
// 三個選項對應的 editor 由 resolveCustomTaskEditor 決定，**不在這裡重寫一張表**。
// 畫面上也不出現 one_time／recurring／growth_plan／short_support／family_role。
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { CustomChoiceCard } from './CustomChoiceCard';
import { CustomTaskSummaryCard } from './CustomTaskSummaryCard';
import { SelectableChip } from '../editors/EditorControls';
import {
  DURATION_OPTIONS,
  PURPOSE_DISPLAY_LABEL,
  ROUTINE_CONFIRMATION_COPY,
  STEP3_COPY,
} from './customTaskCopy';
import { purposeCategoryOf, type CustomTaskDurationChoice, type CustomTaskPurposeChoice } from './customTaskContract';
import { resolveCustomTaskEditor } from './customTaskRouting';

export function CustomTaskBasicsDuration({
  title,
  purposeChoice,
  durationChoice,
  confirmationAnswered,
  onSelectDuration,
  onAcceptSuggestion,
  onKeepChoice,
}: {
  title: string;
  purposeChoice: CustomTaskPurposeChoice;
  durationChoice: CustomTaskDurationChoice | null;
  /** 家長是否已經回答過確認（只有 needs_confirmation 的組合會用到）。 */
  confirmationAnswered: boolean;
  onSelectDuration: (choice: CustomTaskDurationChoice) => void;
  onAcceptSuggestion: () => void;
  onKeepChoice: () => void;
}) {
  const purposeCategory = purposeCategoryOf(purposeChoice);

  const resolution = durationChoice
    ? resolveCustomTaskEditor({ purposeCategory, durationChoice })
    : null;
  const needsConfirmation = resolution?.status === 'needs_confirmation';

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <CustomTaskSummaryCard
        title={title}
        purposeCategory={purposeCategory}
        purposeLabel={PURPOSE_DISPLAY_LABEL[purposeCategory]}
      />

      <View style={s.question}>
        <Text style={s.questionTitle}>{STEP3_COPY.question}</Text>
      </View>

      <View
        style={s.list}
        accessibilityRole="radiogroup"
        accessibilityLabel={STEP3_COPY.question}
      >
        {DURATION_OPTIONS.map(option => (
          <CustomChoiceCard
            key={option.choice}
            label={option.label}
            description={option.description}
            examples={option.examples}
            selected={durationChoice === option.choice}
            onPress={() => onSelectDuration(option.choice)}
          />
        ))}
      </View>

      {/*
        路由有意見時，家長要看得到那個意見，而且要能不同意。
        直接照建議改掉是「靜默套用」——家長會在下一頁發現自己選的
        「固定重複」變成了一個有結束日的小計畫，而沒有人告訴他為什麼。
      */}
      {needsConfirmation ? (
        <View style={s.confirm} accessibilityRole="alert">
          <Text style={s.confirmTitle}>{ROUTINE_CONFIRMATION_COPY.title}</Text>
          <Text style={s.confirmBody}>{ROUTINE_CONFIRMATION_COPY.body}</Text>
          <View style={s.confirmActions}>
            <SelectableChip
              label={ROUTINE_CONFIRMATION_COPY.accept}
              selected={false}
              onPress={onAcceptSuggestion}
            />
            <SelectableChip
              label={ROUTINE_CONFIRMATION_COPY.keep}
              selected={confirmationAnswered}
              onPress={onKeepChoice}
            />
          </View>
        </View>
      ) : null}
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
  list: { gap: ParentSpacing[3] },
  /**
   * 淡綠底而不是琥珀色警示。
   * 這不是錯誤，是一個有理由的建議 —— 用警示色會讓家長以為自己選錯了。
   */
  confirm: {
    paddingHorizontal: ParentSpacing[5],
    paddingVertical: ParentSpacing[5] - 4,
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
    gap: ParentSpacing[2],
  },
  confirmTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
    lineHeight: 24,
  },
  confirmBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ParentSpacing[2],
    marginTop: ParentSpacing[1],
  },
});
