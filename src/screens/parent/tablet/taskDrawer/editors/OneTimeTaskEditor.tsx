// Shadow Wallet · Parent Tablet — 單次任務編輯器
//
// 用於：這次完成一次就結束的明確事項。
// 它不是每週固定出現的週期任務、不是多階段的成長計畫、
// 不是要穩定後退場的短期支援，也不是一段時間承擔的家庭角色。
//
// 家庭參與的硬規則在這裡與固定任務一致：
//   資料層 —— catalog 的 allowedRewardPolicies 只有 family_contribution；
//   畫面層 —— 固定顯示「家庭貢獻」，不給選擇器；
//   validator —— validateFamilyParticipationReward（catalog 改壞也擋得下來）。
// 學校作業另有一層：只允許留下紀錄或進度與肯定。

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
import { COMPLETION_LABEL, type OptionGroup, type TaskPresetFamily, type TaskPresetVariant } from '../taskCatalog';
import {
  FAMILY_PARTICIPATION_POLICY_BODY,
  FAMILY_PARTICIPATION_POLICY_TITLE,
  LOCAL_ONLY_REMINDER,
  LOCAL_ONLY_SCHEDULED_DATE,
  ONE_TIME_COMPLETION_HINT,
  ONE_TIME_DETAILS_LABEL,
  ONE_TIME_ENDING_NOTE,
  ONE_TIME_EXPECTATION_HINT,
  ONE_TIME_EXPECTATION_LABEL,
  ONE_TIME_MINUTE_CHOICES,
  ONE_TIME_NOTES_HINT,
  ONE_TIME_SUPPORT_OPTIONS,
  RECURRING_TIME_OPTIONS,
  REMINDER_OPTIONS,
  SCHOOL_ASSIGNMENT_POLICY_BODY,
  SCHOOL_ASSIGNMENT_POLICY_TITLE,
  localDateWithOffset,
  oneTimeCopy,
  type OneTimeTaskDraft,
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
  RewardPolicyChips,
  SelectableChip,
  SelectableRow,
  StartDatePicker,
  SupportLevelPicker,
  ValidationMessage,
} from './EditorControls';
import { CUSTOM_TASK_BADGE } from '../customTask/customTaskCopy';
import { completionPolicyForEditor } from '../customTask/customTaskRouting';

const SCHOOL_ASSIGNMENT_FAMILY_ID = 'learn-school-assignment';

export function OneTimeTaskEditor({
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
  /** preset 的家族與版本。**自訂任務兩者都是 undefined。** */
  family?: TaskPresetFamily;
  variant?: TaskPresetVariant;
  draft: OneTimeTaskDraft;
  childName: string;
  /** 決定政策算不算得出幣值；沒有孩子資料時為 undefined。 */
  ageGroup?: string;
  errors: TaskDraftValidationErrors;
  showErrors: boolean;
  minuteCustomText: string;
  onMinuteCustomTextChange: (v: string) => void;
  onChange: (next: OneTimeTaskDraft) => void;
}) {
  const copy = oneTimeCopy(family?.id);
  const isFamily = draft.purposeCategory === 'family_participation';
  const isSchoolAssignment = family?.id === SCHOOL_ASSIGNMENT_FAMILY_ID;

  const err = (key: string) =>
    showErrors ? (errors as Record<string, string | undefined>)[key] : undefined;

  const patch = (partial: Partial<OneTimeTaskDraft>) => onChange({ ...draft, ...partial });

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

  const expectationLabel =
    ONE_TIME_EXPECTATION_LABEL[draft.purposeCategory] ?? '希望孩子這次完成的內容';

  // 已經被政策 panel 說過的 flag 不再重複列一次。
  const policyFlags = (variant?.policyFlags ?? []).filter(
    flag => !(isSchoolAssignment && flag.includes('賺幣來源')),
  );

  return (
    <View style={s.stack}>
      <EditorHeader
        title={family?.title ?? draft.title}
        meta={`${variant?.label ?? CUSTOM_TASK_BADGE}｜單次`}
      />

      {/* ── A. 這次安排的期待 ────────────────────────────────────────── */}
      <EditorSection title="這次安排的期待" helper={ONE_TIME_EXPECTATION_HINT}>
        <EditorField>
          <FieldLabel>{expectationLabel}</FieldLabel>
          <AutoGrowTextInput
            value={draft.originalExpectation}
            onChangeText={v => patch({ originalExpectation: v })}
            placeholder={`例如：希望${childName}能完成這次約定的內容。`}
            accessibilityLabel={expectationLabel}
          />
        </EditorField>
      </EditorSection>

      {/* ── B. 任務內容 ──────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="任務內容" helper="說清楚這次要做什麼、做到哪裡就算結束。">
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

        {(variant?.optionGroups ?? []).map(group => (
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
          />
        ))}

        <EditorField>
          <FieldLabel required>{ONE_TIME_DETAILS_LABEL}</FieldLabel>
          <HelperText>{copy.detailsHint}</HelperText>
          <AutoGrowTextInput
            value={draft.taskDetails}
            onChangeText={v => patch({ taskDetails: v })}
            placeholder="寫下這次的具體範圍"
            errorText={err('taskDetails')}
            minHeight={70}
            accessibilityLabel={ONE_TIME_DETAILS_LABEL}
          />
          <ValidationMessage>{err('taskDetails')}</ValidationMessage>
        </EditorField>
      </EditorSection>

      {/* ── C. 時間與協助 ────────────────────────────────────────────── */}
      <EditorSection variant="plain" title="時間與協助" helper="決定這件事什麼時候做，以及家長怎麼參與。">
        <EditorField>
          <FieldLabel required>安排日期</FieldLabel>
          <StartDatePicker
            value={draft.scheduledDate}
            // 單次任務只有一個日期。base 的 startDate 一併同步，
            // 免得草稿裡留下兩個互相矛盾的日期。
            onChange={v => patch({ scheduledDate: v, startDate: v })}
            todayValue={localDateWithOffset(0)}
            tomorrowValue={localDateWithOffset(1)}
            error={err('scheduledDate')}
          />
          <LocalOnlyNotice>{LOCAL_ONLY_SCHEDULED_DATE}</LocalOnlyNotice>
        </EditorField>

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
                placeholder="例如：放學回家放好書包後"
                errorText={err('preferredTimeCustom')}
                accessibilityLabel="自訂時段"
              />
              <ValidationMessage>{err('preferredTimeCustom')}</ValidationMessage>
            </>
          ) : null}
        </EditorField>

        {copy.showMinutes ? (
          <EditorField>
            <FieldLabel>預估投入時間</FieldLabel>
            <HelperText>
              時間只用於家長安排與後續規則分析，不直接換算成幣值。
            </HelperText>
            <MinutePicker
              value={draft.estimatedMinutes}
              choices={ONE_TIME_MINUTE_CHOICES}
              allowNone
              onChange={m =>
                patch(m === undefined ? { estimatedMinutes: undefined } : { estimatedMinutes: m })
              }
              customText={minuteCustomText}
              onCustomTextChange={onMinuteCustomTextChange}
              error={err('estimatedMinutes')}
            />
          </EditorField>
        ) : null}

        <EditorField>
          <FieldLabel required>家長怎麼協助</FieldLabel>
          <SupportLevelPicker
            value={draft.supportLevel}
            options={ONE_TIME_SUPPORT_OPTIONS}
            onChange={level => patch({ supportLevel: level })}
          />
          <ValidationMessage>{err('supportLevel')}</ValidationMessage>
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

      {/* ── D. 回饋與完成標準 ────────────────────────────────────────── */}
      <EditorSection variant="plain" title="回饋與完成標準" helper="這次怎麼被記錄，以及做到哪裡算完成。">
        <EditorField>
          {/* 自訂任務的區塊標題由 CustomTaskRewardSection 自己畫（「怎麼被看見」），
              這裡再加一行「回饋方式」會變成兩個標題疊在一起。 */}
          {variant ? <FieldLabel>回饋方式</FieldLabel> : null}
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

        {isSchoolAssignment ? (
          <View style={s.policyPanel}>
            <Text style={s.policyPanelTitle}>{SCHOOL_ASSIGNMENT_POLICY_TITLE}</Text>
            <Text style={s.policyPanelBody}>{SCHOOL_ASSIGNMENT_POLICY_BODY}</Text>
          </View>
        ) : null}

        {isFamily ? (
          <View style={s.policyPanel}>
            <Text style={s.policyPanelTitle}>{FAMILY_PARTICIPATION_POLICY_TITLE}</Text>
            <Text style={s.policyPanelBody}>{FAMILY_PARTICIPATION_POLICY_BODY}</Text>
          </View>
        ) : null}

        <EditorField>
          <FieldLabel required>怎樣算完成</FieldLabel>
          <HelperText>{ONE_TIME_COMPLETION_HINT}</HelperText>
          <AutoGrowTextInput
            value={draft.completionDescription}
            onChangeText={v => patch({ completionDescription: v })}
            errorText={err('completionDescription')}
            minHeight={70}
            accessibilityLabel="怎樣算完成"
          />
          <ValidationMessage>{err('completionDescription')}</ValidationMessage>
        </EditorField>

        <EditorField>
          <FieldLabel>補充說明</FieldLabel>
          <HelperText>{ONE_TIME_NOTES_HINT}</HelperText>
          <AutoGrowTextInput
            value={draft.notes}
            onChangeText={v => patch({ notes: v })}
            placeholder="沒有補充可以留空"
            minHeight={70}
            accessibilityLabel="補充說明"
          />
        </EditorField>

        <EditorField>
          <FieldLabel>結束方式</FieldLabel>
          <View style={s.fixedPolicyRow}>
            <Text style={s.fixedPolicyText}>
              {COMPLETION_LABEL[
                variant?.completionPolicy ?? completionPolicyForEditor('one_time')
              ]}
            </Text>
          </View>
          <HelperText>{ONE_TIME_ENDING_NOTE}</HelperText>
          <ValidationMessage>{err('completionPolicy')}</ValidationMessage>
        </EditorField>

        {variant?.safetyNotes?.map(note => (
          <PolicyNotice key={note} tone="warn">{note}</PolicyNotice>
        ))}
        {/*
          學校作業的 policyFlag「不作為賺幣來源」與上方政策 panel 講的是同一件事，
          同一頁講兩次只是佔位置。其餘 flag（例如不可用分數作條件）照常顯示。
        */}
        {policyFlags.map(flag => (
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
