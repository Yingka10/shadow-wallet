// Shadow Wallet · Parent Tablet — 短期支援編輯器
//
// 四個區塊：目前困難 → 本次焦點 → 最終採用版本 → 政策與回顧。
//
// 硬規則（SPEC §3.1）：rewardPolicy 固定 progress_only、completionPolicy 固定
// stabilize_and_exit，畫面不出現成長幣或時間儲蓄選項。
// 成功判斷刻意避免「完全不再忘記」「一次提醒都不需要」這類不可能達成的標準。

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
import { COMPLETION_LABEL, type TaskPresetFamily, type TaskPresetVariant } from '../taskCatalog';
import {
  DRAFT_FALLBACKS,
  LOCAL_ONLY_REMINDER,
  REMINDER_OPTIONS,
  SHORT_SUPPORT_POLICY_NOTE,
  SUPPORT_TIME_OPTIONS,
  dateStringPlusDays,
  focusChoicesFor,
  localDateWithOffset,
  syncSupportSteps,
  type ShortSupportDraft,
  type TaskDraftValidationErrors,
} from '../taskDraft';
import { EditorField, EditorHeader, EditorSection } from './EditorSection';
import {
  AutoGrowTextInput,
  CompactOptionGrid,
  DraftTextInput,
  DurationPicker,
  FieldLabel,
  HelperText,
  LocalOnlyNotice,
  PolicyNotice,
  SelectableChip,
  SelectableRow,
  StartDatePicker,
  ToggleRow,
  ValidationMessage,
  WeekdayPicker,
  shouldUseCompactGrid,
} from './EditorControls';

export function ShortSupportEditor({
  family,
  variant,
  draft,
  errors,
  showErrors,
  onChange,
}: {
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  draft: ShortSupportDraft;
  errors: TaskDraftValidationErrors;
  showErrors: boolean;
  onChange: (next: ShortSupportDraft) => void;
}) {
  const err = (key: string) =>
    showErrors ? (errors as Record<string, string | undefined>)[key] : undefined;

  const patch = (partial: Partial<ShortSupportDraft>) => onChange({ ...draft, ...partial });

  const choices = focusChoicesFor(family, variant);
  const reviewDate = dateStringPlusDays(draft.startDate, draft.firstReviewAfterDays);
  /*
    焦點的答案同時存在 focusOptionIds 與 selectedOptions（見 toggleFocus），
    所以 required 的選項組錯誤要跟焦點錯誤顯示在同一個地方 ——
    否則 validator 擋下了預覽，畫面上卻找不到任何紅字。
  */
  const focusGroupId = variant.optionGroups[0]?.id;
  const focusError =
    err('focusOptionIds') ?? (focusGroupId ? err(`option:${focusGroupId}`) : undefined);
  const overFocusLimit = draft.focusOptionIds.length > DRAFT_FALLBACKS.focusSoftLimit;

  const toggleFocus = (optionId: string) => {
    const next = draft.focusOptionIds.includes(optionId)
      ? draft.focusOptionIds.filter(id => id !== optionId)
      : [...draft.focusOptionIds, optionId];

    // 焦點一改就同步支援步驟，但保留家長已改過的文字與自訂步驟。
    const nextSteps = syncSupportSteps(draft.supportSteps, next, choices);

    // catalog 有 optionGroups 時，焦點同時就是選項答案，一併寫回 selectedOptions。
    const group = variant.optionGroups[0];
    patch({
      focusOptionIds: next,
      supportSteps: nextSteps,
      ...(group ? { selectedOptions: { ...draft.selectedOptions, [group.id]: next } } : null),
    });
  };

  const customStepCount = draft.supportSteps.filter(step => step.id.startsWith('custom-')).length;
  /*
    有預設焦點時只開放補一個自訂步驟（其餘由焦點帶出來）；
    完全沒有預設焦點的家族則整份清單都要靠家長自己寫，一項是不夠的。
  */
  const customStepLimit = choices.length > 0 ? 1 : DRAFT_FALLBACKS.maxSupportSteps;
  const canAddCustomStep =
    customStepCount < customStepLimit
    && draft.supportSteps.length < DRAFT_FALLBACKS.maxSupportSteps;

  return (
    <View style={s.stack}>
      <EditorHeader
        title={family.title}
        meta={`${variant.label}｜短期小計畫｜建議 ${
          variant.defaultDraft.durationDays ?? draft.durationDays
        } 天`}
      />

      {/* ── A. 目前想改善的情況 ──────────────────────────────────────── */}
      <EditorSection
        title="目前想改善的情況"
        helper="請描述具體情境，不使用「拖拖拉拉」「不自律」等模糊評價。"
      >
        <EditorField>
          <AutoGrowTextInput
            value={draft.originalExpectation}
            onChangeText={v => patch({ originalExpectation: v })}
            placeholder="例如：出門前常常找不到要帶的東西。"
            accessibilityLabel="目前想改善的情況"
          />
        </EditorField>
      </EditorSection>

      {/* ── B. 選擇本次焦點 ──────────────────────────────────────────── */}
      <EditorSection variant="plain" title="選擇本次焦點" helper="一次先處理一個具體卡點，建議選 2–4 項。">
        <EditorField>
          {/*
            焦點標籤短時走兩欄（功課管理的五個焦點）；像書包準備那種較長的
            項目仍維持整列，硬塞半寬只會每格換三行。
          */}
          {choices.length === 0 ? (
            <HelperText>這個主題沒有預設焦點，直接在下方寫下支援步驟即可。</HelperText>
          ) : shouldUseCompactGrid(choices) ? (
            <CompactOptionGrid
              options={choices}
              selectedIds={draft.focusOptionIds}
              selection="multiple"
              onToggle={toggleFocus}
              hasError={!!focusError}
              groupLabel="本次焦點"
            />
          ) : (
            <View style={s.optionList}>
              {choices.map(choice => (
                <SelectableRow
                  key={choice.id}
                  label={choice.label}
                  selected={draft.focusOptionIds.includes(choice.id)}
                  onPress={() => toggleFocus(choice.id)}
                  multi
                />
              ))}
            </View>
          )}
          <ValidationMessage>{focusError}</ValidationMessage>
          {overFocusLimit ? (
            <PolicyNotice tone="warn">
              一次選超過四項，範圍可能太大。可以先留下最想改善的幾項，其餘之後再開。
            </PolicyNotice>
          ) : null}
        </EditorField>

        {/*
          沒有預設焦點的家族（例如上學前流程）也要看得到這一區，
          否則畫面上完全沒有地方可以寫下要做什麼。
        */}
        {draft.supportSteps.length > 0 || choices.length === 0 ? (
          <EditorField>
            <FieldLabel required={choices.length > 0}>支援步驟</FieldLabel>
            <HelperText>
              {choices.length > 0
                ? '可以改文字或關掉，至少保留一個。'
                : '這個主題沒有預設步驟，請寫下你們家實際要做的幾件事。'}
            </HelperText>
            <View style={s.stepList}>
              {draft.supportSteps.map((step, index) => (
                <View key={step.id} style={s.stepRow}>
                  <View style={s.stepIndex}>
                    <Text style={s.stepIndexText}>{index + 1}</Text>
                  </View>
                  <View style={s.stepMain}>
                    <DraftTextInput
                      value={step.text}
                      onChangeText={v => {
                        const next = [...draft.supportSteps];
                        next[index] = { ...step, text: v };
                        patch({ supportSteps: next });
                      }}
                      accessibilityLabel={`第 ${index + 1} 個支援步驟`}
                    />
                  </View>
                  <SelectableChip
                    label={step.enabled ? '使用中' : '已關閉'}
                    selected={step.enabled}
                    onPress={() => {
                      const next = [...draft.supportSteps];
                      next[index] = { ...step, enabled: !step.enabled };
                      patch({ supportSteps: next });
                    }}
                  />
                </View>
              ))}
            </View>
            <ValidationMessage>{err('supportSteps')}</ValidationMessage>

            {canAddCustomStep ? (
              <SelectableChip
                label="新增一個自訂步驟"
                selected={false}
                onPress={() =>
                  patch({
                    supportSteps: [
                      ...draft.supportSteps,
                      { id: `custom-${Date.now()}`, text: '', enabled: true },
                    ],
                  })
                }
              />
            ) : null}
          </EditorField>
        ) : null}
      </EditorSection>

      {/* ── C. 最終採用版本 ──────────────────────────────────────────── */}
      <EditorSection variant="plain" title="最終採用版本" helper="這是實際會建立的內容，隨時可以再調整。">
        <EditorField>
          <FieldLabel required>小計畫名稱</FieldLabel>
          <DraftTextInput
            value={draft.title}
            onChangeText={v => patch({ title: v })}
            errorText={err('title')}
            accessibilityLabel="小計畫名稱"
          />
          <ValidationMessage>{err('title')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>執行日</FieldLabel>
          <HelperText>至少選一天。</HelperText>
          <WeekdayPicker
            value={draft.recurrenceDays}
            onChange={days => patch({ recurrenceDays: days })}
          />
          <ValidationMessage>{err('recurrenceDays')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel>執行時段</FieldLabel>
          <View style={s.chipRow}>
            {SUPPORT_TIME_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                label={option.label}
                selected={draft.supportTime === option.id}
                onPress={() => patch({ supportTime: option.id })}
              />
            ))}
          </View>
          {draft.supportTime === 'custom' ? (
            <>
              <DraftTextInput
                value={draft.supportTimeCustom ?? ''}
                onChangeText={v => patch({ supportTimeCustom: v })}
                placeholder="例如：洗完澡之後"
                errorText={err('supportTimeCustom')}
                accessibilityLabel="自訂執行時段"
              />
              <ValidationMessage>{err('supportTimeCustom')}</ValidationMessage>
            </>
          ) : null}
        </EditorField>

        <EditorField>
          <FieldLabel required>計畫期間</FieldLabel>
          <DurationPicker
            value={draft.durationDays}
            choices={variant.defaultDraft.durationDayChoices ?? []}
            onChange={days => patch({ durationDays: days })}
          />
          <ValidationMessage>{err('durationDays')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel required>開始日期</FieldLabel>
          <StartDatePicker
            value={draft.startDate}
            onChange={v => patch({ startDate: v })}
            todayValue={localDateWithOffset(0)}
            tomorrowValue={localDateWithOffset(1)}
            error={err('startDate')}
          />
        </EditorField>

        <EditorField>
          <FieldLabel>提醒方式</FieldLabel>
          <View style={s.chipRow}>
            {REMINDER_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                label={option.label}
                selected={draft.reminderMode === option.id}
                onPress={() => patch({ reminderMode: option.id })}
              />
            ))}
          </View>
          <LocalOnlyNotice>{LOCAL_ONLY_REMINDER}</LocalOnlyNotice>
        </EditorField>
      </EditorSection>

      {/* ── D. 回顧與政策 ────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="回顧與結束方式" helper="短期支援的重點是穩定後就結束，不是一直做下去。">
        <EditorField>
          <ToggleRow
            label="第一次回顧"
            description={
              reviewDate
                ? `第一次回顧日：${reviewDate}（第 ${draft.firstReviewAfterDays} 天）`
                : `第 ${draft.firstReviewAfterDays} 天`
            }
            value={draft.firstReviewAfterDays > 0}
            onChange={on =>
              patch({ firstReviewAfterDays: on ? DRAFT_FALLBACKS.firstReviewDays : 0 })
            }
          />
          <ToggleRow
            label="週末一起回顧"
            description="週末確認這幾個步驟是不是還需要協助"
            value={draft.weekendReviewEnabled}
            onChange={on => patch({ weekendReviewEnabled: on })}
          />
        </EditorField>

        <EditorField>
          <FieldLabel required>怎樣算逐漸穩定</FieldLabel>
          <HelperText>
            以「比較順利」「較少協助」描述，不要用「完全不再忘記」「一次提醒都不需要」。
          </HelperText>
          <AutoGrowTextInput
            value={draft.successDescription}
            onChangeText={v => patch({ successDescription: v })}
            errorText={err('successDescription')}
            minHeight={70}
            accessibilityLabel="怎樣算逐漸穩定"
          />
          <ValidationMessage>{err('successDescription')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel>回饋方式</FieldLabel>
          <View style={s.fixedPolicyRow}>
            <Text style={s.fixedPolicyText}>進度與肯定</Text>
            <Text style={s.fixedPolicyNote}>短期支援固定不發成長幣</Text>
          </View>
          <Text style={s.completionText}>
            結束方式　{COMPLETION_LABEL[variant.completionPolicy]}
          </Text>
        </EditorField>

        <PolicyNotice>{SHORT_SUPPORT_POLICY_NOTE}</PolicyNotice>

        {variant.safetyNotes?.map(note => (
          <PolicyNotice key={note}>{note}</PolicyNotice>
        ))}
      </EditorSection>
    </View>
  );
}

const s = StyleSheet.create({
  stack: {
    gap: ParentSpacing[4],
  },
  optionList: {
    gap: ParentSpacing[2],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  stepList: {
    gap: ParentSpacing[2],
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.tintClay,
    flexShrink: 0,
  },
  stepIndexText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.clay500,
  },
  stepMain: {
    flex: 1,
    minWidth: 0,
  },
  fixedPolicyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
    minHeight: 44,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintClay,
  },
  fixedPolicyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.clay500,
  },
  fixedPolicyNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
  },
  completionText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
});
