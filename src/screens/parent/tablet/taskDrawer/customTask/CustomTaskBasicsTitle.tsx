// Shadow Wallet · Parent Tablet — 自訂基本設定 1／3：想做什麼
//
// 兩件事，都刻意做得很少：
//
//   任務名稱  必填，但「必填」不寫成一個突兀的紅字標籤 ——
//             欄位標籤旁的星號與送出時的驗證訊息已經說完這件事。
//
//   你的期待  選填，而且**任何後續建議都不得覆蓋它**。
//             placeholder 不預填孩子名字：「承恩的閱讀習慣」看起來像
//             系統已經幫忙決定了，而這一欄整個的用途就是保留家長自己的說法。

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { EditorField, EditorSection } from '../editors/EditorSection';
import {
  AutoGrowTextInput,
  DraftTextInput,
  FieldLabel,
  HelperText,
  ValidationMessage,
} from '../editors/EditorControls';
import { STEP1_COPY } from './customTaskCopy';

export function CustomTaskBasicsTitle({
  title,
  expectation,
  titleError,
  showErrors,
  onChangeTitle,
  onChangeExpectation,
}: {
  title: string;
  expectation: string;
  titleError?: string;
  showErrors: boolean;
  onChangeTitle: (value: string) => void;
  onChangeExpectation: (value: string) => void;
}) {
  const error = showErrors ? titleError : undefined;

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <EditorSection title={STEP1_COPY.sectionTitle}>
        <EditorField>
          {/*
            刻意**不加 `required`**（那會在標籤後面接上「　必填」）。

            這一頁只有兩個欄位，其中一個的標籤已經寫著「（選填）」——
            另一個當然就是要填的。在那種情況下再掛一個工程感的「必填」標記，
            是在替一個沒有人會弄錯的地方加噪音。真的漏填時，
            按下一步會直接說「請填寫任務名稱」，那才是家長需要的時機。

            其餘五支 editor 的欄位多、必填與選填交錯，仍然保留 required 標記。
          */}
          <FieldLabel>{STEP1_COPY.titleLabel}</FieldLabel>
          <DraftTextInput
            value={title}
            onChangeText={onChangeTitle}
            placeholder={STEP1_COPY.titlePlaceholder}
            errorText={error}
            accessibilityLabel={STEP1_COPY.titleLabel}
          />
          <ValidationMessage>{error}</ValidationMessage>
          <HelperText>{STEP1_COPY.titleHelper}</HelperText>
        </EditorField>
      </EditorSection>

      <EditorSection variant="plain" title={STEP1_COPY.expectationSectionTitle}>
        <EditorField>
          <FieldLabel>{STEP1_COPY.expectationLabel}</FieldLabel>
          <AutoGrowTextInput
            value={expectation}
            onChangeText={onChangeExpectation}
            minHeight={88}
            accessibilityLabel={STEP1_COPY.expectationLabel}
          />
          <HelperText>{STEP1_COPY.expectationHelper}</HelperText>
        </EditorField>

        <View style={s.hints}>
          {STEP1_COPY.expectationHints.map(hint => (
            <View key={hint} style={s.hintRow}>
              <View style={s.hintDot} />
              <Text style={s.hintText}>{hint}</Text>
            </View>
          ))}
        </View>
      </EditorSection>
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
  hints: { gap: ParentSpacing[2] },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[2],
  },
  hintDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 9,
    backgroundColor: ParentColors.pine400,
    flexShrink: 0,
  },
  hintText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },
});
