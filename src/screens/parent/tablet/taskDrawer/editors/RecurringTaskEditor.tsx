// Shadow Wallet · Parent Tablet — 固定任務編輯器
//
// 用於：每週或固定日期重複進行相似內容的任務。
// 它不是長期里程碑計畫（沒有 milestones），也不是家庭角色（沒有試行期與責任範圍）。
//
// 家庭參與的硬規則在這裡有兩層：
//   資料層 —— catalog 的 allowedRewardPolicies 不含 coin_eligible；
//   畫面層 —— purposeCategory 為 family_participation 時固定顯示「家庭貢獻」，不給選擇器。
// 第三層在 validators.validateFamilyParticipationReward（catalog 寫錯也擋得下來）。

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
import type { OptionGroup, TaskPresetFamily, TaskPresetVariant } from '../taskCatalog';
import {
  DRAFT_FALLBACKS,
  FAMILY_PARTICIPATION_POLICY_BODY,
  FAMILY_PARTICIPATION_POLICY_TITLE,
  MINUTE_CHOICES,
  RECURRING_FAMILY_SCOPE_HINT,
  RECURRING_REVIEW_HINT,
  RECURRING_TIME_OPTIONS,
  LOCAL_ONLY_REMINDER,
  LOCAL_ONLY_WEEKLY_FREQUENCY,
  REMINDER_OPTIONS,
  localDateWithOffset,
  recurringCopy,
  type RecurringTaskDraft,
  type TaskDraftValidationErrors,
} from '../taskDraft';
import { EditorField, EditorHeader, EditorSection } from './EditorSection';
import {
  AutoGrowTextInput,
  DraftTextInput,
  FieldLabel,
  HelperText,
  OptionGroupField,
  LocalOnlyNotice,
  MinutePicker,
  PolicyNotice,
  ScheduleModePicker,
  RewardPolicyChips,
  SelectableChip,
  SelectableRow,
  StartDatePicker,
  ToggleRow,
  ValidationMessage,
  WeekdayPicker,
  WeeklyFrequencyPicker,
} from './EditorControls';

export function RecurringTaskEditor({
  family,
  variant,
  draft,
  childName,
  ageGroup,
  errors,
  showErrors,
  minuteCustomText,
  onMinuteCustomTextChange,
  onChange,
}: {
  family: TaskPresetFamily;
  variant: TaskPresetVariant;
  draft: RecurringTaskDraft;
  childName: string;
  /** 決定政策算不算得出幣值；沒有孩子資料時為 undefined。 */
  ageGroup?: string;
  errors: TaskDraftValidationErrors;
  showErrors: boolean;
  minuteCustomText: string;
  onMinuteCustomTextChange: (v: string) => void;
  onChange: (next: RecurringTaskDraft) => void;
}) {
  const isFamily = draft.purposeCategory === 'family_participation';
  const copy = recurringCopy(family.id, isFamily);
  const err = (key: string) =>
    showErrors ? (errors as Record<string, string | undefined>)[key] : undefined;

  const patch = (partial: Partial<RecurringTaskDraft>) => onChange({ ...draft, ...partial });

  const toggleOption = (group: OptionGroup, optionId: string) => {
    const current = draft.selectedOptions[group.id] ?? [];
    const next =
      group.selection === 'single'
        ? current.includes(optionId) ? [] : [optionId]
        : current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId];
    patch({ selectedOptions: { ...draft.selectedOptions, [group.id]: next } });
  };

  const expectationLabel = isFamily ? '希望孩子參與的家庭分工' : '希望孩子累積的練習';

  return (
    <View style={s.stack}>
      <EditorHeader title={family.title} meta={`${variant.label}｜固定重複`} />

      {/* ── A. 這項安排的期待 ────────────────────────────────────────── */}
      <EditorSection
        title="這項安排的期待"
        helper="描述想建立的安排，不使用「要乖」「不要偷懶」等模糊評價。"
      >
        <EditorField>
          <FieldLabel>{expectationLabel}</FieldLabel>
          <AutoGrowTextInput
            value={draft.originalExpectation}
            onChangeText={v => patch({ originalExpectation: v })}
            placeholder={`例如：希望${childName}能固定參與其中一小部分。`}
            accessibilityLabel={expectationLabel}
          />
        </EditorField>
      </EditorSection>

      {/* ── B. 任務內容 ──────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="任務內容" helper="先說清楚要做什麼，範圍越具體越好執行。">
        <EditorField>
          <FieldLabel required>任務名稱</FieldLabel>
          <DraftTextInput
            value={draft.title}
            onChangeText={v => patch({ title: v })}
            errorText={err('title')}
            accessibilityLabel="任務名稱"
          />
          <ValidationMessage>{err('title')}</ValidationMessage>
        </EditorField>

        {variant.optionGroups.map(group => (
          <OptionGroupField
            key={group.id}
            group={group}
            selectedIds={draft.selectedOptions[group.id] ?? []}
            customValue={draft.customOptionValues[group.id] ?? ''}
            onToggle={optionId => toggleOption(group, optionId)}
            onCustomChange={v =>
              patch({ customOptionValues: { ...draft.customOptionValues, [group.id]: v } })
            }
            optionError={err(`option:${group.id}`)}
            customError={err(`customOption:${group.id}`)}
            softLimit={DRAFT_FALLBACKS.recurringOptionSoftLimit}
            softLimitNotice="一次選比較多項時，孩子不容易記得完整範圍。可以先留下最重要的幾項。"
          />
        ))}

        {isFamily ? <PolicyNotice>{RECURRING_FAMILY_SCOPE_HINT}</PolicyNotice> : null}

        <EditorField>
          <FieldLabel required>怎樣算完成</FieldLabel>
          <AutoGrowTextInput
            value={draft.completionDescription}
            onChangeText={v => patch({ completionDescription: v })}
            errorText={err('completionDescription')}
            minHeight={70}
            accessibilityLabel="怎樣算完成"
          />
          <ValidationMessage>{err('completionDescription')}</ValidationMessage>
        </EditorField>
      </EditorSection>

      {/* ── C. 執行安排 ──────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="執行安排" helper="決定這件事什麼時候出現在孩子的清單上。">
        <EditorField>
          <FieldLabel required>固定安排方式</FieldLabel>
          <ScheduleModePicker
            value={draft.scheduleMode}
            onChange={mode => patch({ scheduleMode: mode })}
          />
        </EditorField>

        {draft.scheduleMode === 'fixed_days' ? (
          <EditorField>
            <FieldLabel required>每週執行日</FieldLabel>
            <HelperText>至少選一天。</HelperText>
            <WeekdayPicker
              value={draft.recurrenceDays}
              onChange={days => patch({ recurrenceDays: days })}
            />
            <ValidationMessage>{err('recurrenceDays')}</ValidationMessage>
          </EditorField>
        ) : (
          <EditorField>
            <FieldLabel required>每週幾次</FieldLabel>
            <HelperText>不指定星期，由孩子在一週內自己安排。</HelperText>
            <WeeklyFrequencyPicker
              value={draft.weeklyFrequency}
              choices={DRAFT_FALLBACKS.weeklyFrequencyChoices}
              onChange={n => patch({ weeklyFrequency: n, recurrenceDays: [] })}
            />
            <ValidationMessage>{err('weeklyFrequency')}</ValidationMessage>
            <LocalOnlyNotice>{LOCAL_ONLY_WEEKLY_FREQUENCY}</LocalOnlyNotice>
          </EditorField>
        )}

        {copy.showMinutes ? (
          <EditorField>
            <FieldLabel>每次時間</FieldLabel>
            <MinutePicker
              value={draft.minutesPerSession}
              choices={MINUTE_CHOICES}
              allowNone
              onChange={m =>
                patch(m === undefined ? { minutesPerSession: undefined } : { minutesPerSession: m })
              }
              customText={minuteCustomText}
              onCustomTextChange={onMinuteCustomTextChange}
              error={err('minutesPerSession')}
            />
          </EditorField>
        ) : null}

        <EditorField>
          <FieldLabel>適合時段</FieldLabel>
          <View style={s.chipRow}>
            {RECURRING_TIME_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                label={option.label}
                selected={draft.preferredTime === option.id}
                onPress={() => patch({ preferredTime: option.id })}
              />
            ))}
          </View>
          {draft.preferredTime === 'custom' ? (
            <>
              <DraftTextInput
                value={draft.preferredTimeCustom ?? ''}
                onChangeText={v => patch({ preferredTimeCustom: v })}
                placeholder="例如：用餐前"
                errorText={err('preferredTimeCustom')}
                accessibilityLabel="自訂時段"
              />
              <ValidationMessage>{err('preferredTimeCustom')}</ValidationMessage>
            </>
          ) : null}
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

      {/* ── D. 回饋與定期回顧 ────────────────────────────────────────── */}
      <EditorSection variant="plain" title="回饋與定期回顧" helper="決定這件事怎麼被看見，以及多久檢視一次。">
        <EditorField>
          <FieldLabel>回饋方式</FieldLabel>
          {isFamily ? (
            <>
              <View style={s.fixedPolicyRow}>
                <Text style={s.fixedPolicyText}>家庭貢獻</Text>
                <Text style={s.fixedPolicyNote}>家庭參與固定不發成長幣</Text>
              </View>
              <ValidationMessage>{err('rewardPolicy')}</ValidationMessage>
            </>
          ) : (
            <RewardPolicyChips
              variant={variant}
              draft={draft}
              ageGroup={ageGroup}
              error={err('rewardPolicy')}
              onChange={policy => patch({ rewardPolicy: policy })}
            />
          )}
        </EditorField>

        <EditorField>
          <ToggleRow
            label="執行一段時間後一起看看"
            description={RECURRING_REVIEW_HINT}
            value={draft.reviewEnabled}
            onChange={on => patch({ reviewEnabled: on })}
          />
          {draft.reviewEnabled ? (
            <>
              <View style={s.chipRow}>
                {DRAFT_FALLBACKS.recurringReviewChoices.map(days => (
                  <SelectableChip
                    key={days}
                    label={`${days} 天後`}
                    selected={draft.reviewAfterDays === days}
                    onPress={() => patch({ reviewAfterDays: days })}
                  />
                ))}
              </View>
              <ValidationMessage>{err('reviewAfterDays')}</ValidationMessage>
            </>
          ) : null}
        </EditorField>

        {isFamily ? (
          <View style={s.policyPanel}>
            <Text style={s.policyPanelTitle}>{FAMILY_PARTICIPATION_POLICY_TITLE}</Text>
            <Text style={s.policyPanelBody}>{FAMILY_PARTICIPATION_POLICY_BODY}</Text>
          </View>
        ) : null}

        {variant.safetyNotes?.map(note => (
          <PolicyNotice key={note} tone="warn">{note}</PolicyNotice>
        ))}
        {variant.policyFlags?.map(flag => (
          <PolicyNotice key={flag} tone="warn">{flag}</PolicyNotice>
        ))}
      </EditorSection>
    </View>
  );
}

const s = StyleSheet.create({
  stack: { gap: ParentSpacing[4] },
  optionList: { gap: ParentSpacing[2] },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
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
    backgroundColor: ParentColors.tintPine,
  },
  fixedPolicyText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  fixedPolicyNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgSecondary,
  },
  policyPanel: {
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintPine,
    gap: ParentSpacing[2],
  },
  policyPanelTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
    lineHeight: 22,
  },
  policyPanelBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
});
