// Shadow Wallet · Parent Tablet — Step 2 表單控制元件
//
// 專案沒有 UI library，這裡只做「這兩支 editor 需要的最小集合」，
// 不預先建立全站 design system。但同一個 editor 內不重複寫十種 Pressable style。
//
// 規則：0 emoji、0 硬編碼 hex、一律走 ParentTheme token；
// 中文不因固定高度被截斷（multiline 隨內容增高、所有列用 minHeight 不用 height）。

import React, { useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentSpacing,
} from '../../../../../constants/parentTheme';
import { CheckMarkIcon, InfoIcon } from '../drawerIcons';
import { useDisplayMode, useShowsImplementationNotes } from '../displayMode';
import {
  REWARD_POLICY_NOTE,
  REWARD_POLICY_SHORT_LABEL,
  WEEKDAYS,
  draftEstimatedMinutes,
  type TaskDraft,
} from '../taskDraft';
import type { RewardPolicy, TaskPresetVariant } from '../taskCatalog';
import {
  resolveTaskRewardCapabilities,
  selectAvailableRewardPolicies,
} from '../taskReward';
import { evaluateCustomTaskRewardOptions } from '../customTask/customTaskRewardOptions';
import { CustomTaskRewardSection } from '../customTask/CustomTaskRewardSection';

// ---------------------------------------------------------------------------
// 文字
// ---------------------------------------------------------------------------

export function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text style={s.fieldLabel}>
      {children}
      {required ? <Text style={s.requiredMark}>　必填</Text> : null}
    </Text>
  );
}

export function HelperText({ children }: { children: string }) {
  return <Text style={s.helperText}>{children}</Text>;
}

export function ValidationMessage({ children }: { children?: string }) {
  if (!children) return null;
  return <Text style={s.errorText}>{children}</Text>;
}

/**
 * 政策提示。
 *
 * 傳 details 時會變成可展開：摘要一行、細節收在後面。
 * 家庭角色的安全規則有八項禁止事項，整段攤開是一大片琥珀色，
 * 視覺重量比它在流程中的份量高太多 —— 但內容一個字都不能刪，所以改成預設收合。
 */
export function PolicyNotice({
  children,
  tone = 'calm',
  title,
  details,
  defaultExpanded = false,
  expandLabel = '查看完整內容',
  collapseLabel = '收合',
}: {
  children: string;
  tone?: 'calm' | 'warn';
  title?: string;
  details?: string;
  defaultExpanded?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const expandable = !!details;

  return (
    <View style={[s.policyNotice, tone === 'warn' && s.policyNoticeWarn]}>
      <InfoIcon color={tone === 'warn' ? ParentColors.amber700 : ParentColors.pine400} />
      <View style={s.policyBody}>
        {title ? <Text style={s.policyTitle}>{title}</Text> : null}
        <Text style={s.policyNoticeText}>{children}</Text>

        {expandable && expanded ? (
          <Text style={s.policyDetails}>{details}</Text>
        ) : null}

        {expandable ? (
          <Pressable
            onPress={() => setExpanded(v => !v)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={
              expanded
                ? `收合${title ?? '完整內容'}`
                : `展開${title ?? '完整內容'}`
            }
          >
            <Text style={s.policyToggle}>{expanded ? collapseLabel : expandLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * 「這個設定只存在本地草稿」的統一提示。
 *
 * demo 模式一律不顯示：這些訊息是給開發看的實作狀態，不是家長需要的資訊。
 * 注意隱藏的只有文字 —— 功能本身在兩種模式下完全相同，不會假裝已經接上後端。
 */
export function LocalOnlyNotice({ children }: { children: string }) {
  const show = useShowsImplementationNotes();
  if (!show) return null;
  return <PolicyNotice tone="warn">{children}</PolicyNotice>;
}

/**
 * 唯讀的「之後可以怎麼做」清單。
 *
 * 為什麼不是 chip：家庭角色的「期間結束後」四個選項原本用 disabled 的 SelectableChip
 * 呈現，看起來就是四顆現在該按、但按不動的按鈕 —— 家長會以為自己漏了一個必填。
 * 那四項不是現在要做的選擇，是期滿回顧時才會一起談的可能性，所以它應該讀起來像說明。
 *
 * 無障礙上刻意是 list 而不是 button：螢幕閱讀器會唸成「清單，四個項目」，
 * 不會唸成四個停用的按鈕。
 */
export function ReadOnlyOutcomeList({
  intro,
  items,
}: {
  intro: string;
  items: readonly string[];
}) {
  return (
    <View style={s.outcomeBox}>
      <Text style={s.outcomeIntro}>{intro}</Text>
      <View style={s.outcomeList} accessibilityRole="list">
        {items.map(item => (
          <View key={item} style={s.outcomeRow}>
            <View style={s.outcomeDot} />
            <Text style={s.outcomeText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 輸入
// ---------------------------------------------------------------------------

/**
 * 單行輸入。錯誤時邊框改色，不用紅底避免整片刺眼。
 *
 * 傳 errorText 時，錯誤訊息同時成為 accessibilityHint ——
 * 螢幕閱讀器停在這個欄位就知道要修什麼，不必自己去找下面那行紅字。
 */
export function DraftTextInput({
  value,
  onChangeText,
  placeholder,
  hasError,
  errorText,
  keyboardNumeric,
  /** 給短數字（例如「約第幾天」）用的窄版樣式，不是給一般文字欄位的。 */
  compact,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
  errorText?: string;
  keyboardNumeric?: boolean;
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const invalid = hasError || !!errorText;
  return (
    <TextInput
      style={[s.input, compact && s.inputCompact, invalid && s.inputError]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={ParentColors.fgMuted}
      keyboardType={keyboardNumeric ? 'number-pad' : 'default'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={errorText}
    />
  );
}

/** 多行輸入，隨內容增高（不設固定高度，中文不會被截掉）。 */
export function AutoGrowTextInput({
  value,
  onChangeText,
  placeholder,
  hasError,
  errorText,
  minHeight = 84,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hasError?: boolean;
  errorText?: string;
  minHeight?: number;
  accessibilityLabel?: string;
}) {
  const [height, setHeight] = useState(minHeight);
  // 上一次量到的內容高度。用 ref 而不是比對 height，避免 setState 之後又被同一個值喚醒。
  const measured = useRef(minHeight);
  const invalid = hasError || !!errorText;

  /**
   * 自動增高。
   *
   * 兩條規則都是為了讓它會停下來：
   *
   * 1. 不在量到的高度上再加 padding。react-native-web 的 contentSize.height 取自
   *    scrollHeight，而 scrollHeight 不會小於我們剛套上去的 height ——
   *    每次多加一次 padding，下一輪就會量到更高的值，於是 84 → 100 → 116…
   *    一路長到 React 的「Maximum update depth exceeded」，整棵樹被卸載變成白畫面。
   *    高度本來就是 padding box，直接用量到的值即可。
   * 2. 值沒有實際變化就不 setState，省掉一輪多餘的 render。
   */
  const handleContentSize = (
    event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>,
  ) => {
    const next = Math.max(minHeight, Math.ceil(event.nativeEvent.contentSize.height));
    if (Math.abs(next - measured.current) < 1) return;
    measured.current = next;
    setHeight(next);
  };

  return (
    <TextInput
      style={[s.input, s.multiline, { height }, invalid && s.inputError]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={ParentColors.fgMuted}
      multiline
      textAlignVertical="top"
      onContentSizeChange={handleContentSize}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={errorText}
    />
  );
}

// ---------------------------------------------------------------------------
// 選取
// ---------------------------------------------------------------------------

/** 小型 chip，用於 single-select 與短選項（時段、期間、分鐘）。 */
export function SelectableChip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        s.chip,
        selected && s.chipSelected,
        disabled && s.chipDisabled,
        pressed && !disabled && s.chipPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      <Text style={[s.chipText, selected && s.chipTextSelected, disabled && s.chipTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * 回饋方式選單。
 *
 * 三支 editor（成長計畫／固定任務／單次任務）共用這一個 —— 刻意不讓它們各自
 * 展開 variant.allowedRewardPolicies：那樣「哪些方式現在真的能用」就會有三份判斷，
 * 而漏掉的那一份就是家長選了、送出、才被資料庫拒絕的地方。
 *
 * 能不能用由 selectAvailableRewardPolicies 決定：
 *   demo        —— 用不了的直接不列
 *   development —— 列出來但標示原因，開發時看得見是被能力擋掉而不是漏寫
 */
export function RewardPolicyChips({
  variant,
  draft,
  ageGroup,
  error,
  onChange,
}: {
  /**
   * preset 的版本。**自訂任務沒有版本，這裡是 undefined** ——
   * 那時候可選的回饋方式由 evaluateCustomTaskRewardOptions 決定，見下。
   */
  variant?: TaskPresetVariant;
  draft: TaskDraft;
  /** 與 lib/onboarding 的 AgeGroup 對齊；沒有孩子資料時為 undefined。 */
  ageGroup?: string;
  error?: string;
  onChange: (policy: RewardPolicy) => void;
}) {
  const displayMode = useDisplayMode();

  /*
    自訂任務走另一支選單。

    差別不只是「沒有 allowedRewardPolicies 可以篩」：修訂後的家庭參與政策
    （建議家庭貢獻、可選紀錄與進度、成長幣需要明確意圖）只存在於
    evaluateCustomTaskRewardOptions。在這裡用 chip 再擺一次的話，
    那份政策就有兩個實作，而 UI 這一份會先過期。

    ⚠️ 這一段刻意放在所有 hook 之後 —— 提早 return 會讓 hook 數量隨 variant
    改變，那是 React 最難查的一種錯誤。
  */
  if (variant === undefined) {
    return (
      <CustomTaskRewardSection
        options={evaluateCustomTaskRewardOptions({
          ageGroup: ageGroup ?? '',
          purposeCategory: draft.purposeCategory,
          editorKind: draft.editorKind,
          ...(draftEstimatedMinutes(draft) !== undefined
            ? { estimatedMinutes: draftEstimatedMinutes(draft) }
            : null),
        })}
        selected={draft.rewardPolicy}
        {...(error !== undefined ? { error } : null)}
        onChange={onChange}
      />
    );
  }

  const capabilities = resolveTaskRewardCapabilities({
    // 年齡段不明時一律當作算不出幣值：寧可少給一個選項，也不要給一個發不出來的。
    ageGroup: ageGroup ?? '',
    purposeCategory: draft.purposeCategory,
    ...(draftEstimatedMinutes(draft) !== undefined
      ? { estimatedMinutes: draftEstimatedMinutes(draft) }
      : null),
  });

  const options = selectAvailableRewardPolicies({
    allowedRewardPolicies: variant.allowedRewardPolicies,
    displayMode,
    capabilities,
  });

  const selectedIsAvailable = options.some(
    option => option.policy === draft.rewardPolicy && option.available,
  );

  return (
    <>
      <View style={s.rewardChipRow}>
        {options.map(option => (
          <SelectableChip
            key={option.policy}
            label={
              option.available
                ? (REWARD_POLICY_SHORT_LABEL[option.policy] ?? option.policy)
                : `${REWARD_POLICY_SHORT_LABEL[option.policy] ?? option.policy}（${option.unavailableNote}）`
            }
            selected={draft.rewardPolicy === option.policy && option.available}
            disabled={!option.available}
            onPress={() => onChange(option.policy)}
          />
        ))}
      </View>
      <HelperText>{REWARD_POLICY_NOTE}</HelperText>
      {!selectedIsAvailable ? (
        <PolicyNotice tone="warn">{REWARD_POLICY_UNAVAILABLE_HINT}</PolicyNotice>
      ) : null}
      <ValidationMessage>{error}</ValidationMessage>
    </>
  );
}

/** 選中的回饋方式現在用不了時的說明。 */
export const REWARD_POLICY_UNAVAILABLE_HINT =
  '目前的設定算不出成長幣，請改選其他回饋方式，或補上每次大約做多久。';

/** 整列可點的選項，用於 multi-select 與需要副標的項目。 */
export function SelectableRow({
  label,
  description,
  selected,
  onPress,
  multi,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** true = 方形勾選（可複選）、false = 圓形單選。 */
  multi?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, selected && s.rowSelected, pressed && s.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View
        style={[
          multi ? s.checkbox : s.radio,
          selected && (multi ? s.checkboxOn : s.radioOn),
        ]}
      >
        {selected
          ? multi
            ? <CheckMarkIcon size={12} color={ParentColors.onSidebar} />
            : <View style={s.radioDot} />
          : null}
      </View>
      <View style={s.rowMain}>
        <Text style={[s.rowLabel, selected && s.rowLabelSelected]}>{label}</Text>
        {description ? <Text style={s.rowDesc}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

/**
 * 短選項的兩欄格狀選擇。
 *
 * 為什麼不沿用 SelectableRow：像「自己閱讀」「輪流朗讀」這種四個字的選項
 * 各自佔滿一整列，四個選項就吃掉近 220px，家長要捲很久才看得完一題。
 * 兩欄可以把同樣的內容壓到一半高度，而且選項彼此並排更好比較。
 *
 * 只給短選項用 —— 長句子、需要副說明的（協助方式、回饋方式）仍走 SelectableRow，
 * 硬塞進半寬格子只會變成每格四行字。
 */
export function CompactOptionGrid({
  options,
  selectedIds,
  selection,
  onToggle,
  columns = 2,
  hasError,
  groupLabel,
}: {
  options: Array<{ id: string; label: string; disabled?: boolean }>;
  selectedIds: string[];
  selection: 'single' | 'multiple';
  onToggle: (optionId: string) => void;
  /** 1 = 單欄（窄容器時由呼叫端降級）。 */
  columns?: 1 | 2;
  hasError?: boolean;
  /** 給螢幕閱讀器的題目，會併進每一格的 label。 */
  groupLabel?: string;
}) {
  const multi = selection === 'multiple';

  return (
    <View style={[s.grid, hasError && s.gridError]}>
      {options.map(option => {
        const selected = selectedIds.includes(option.id);
        const disabled = !!option.disabled;
        return (
          <Pressable
            key={option.id}
            style={({ pressed }) => [
              s.gridCell,
              columns === 2 ? s.gridCellHalf : s.gridCellFull,
              selected && s.gridCellOn,
              disabled && s.gridCellDisabled,
              pressed && !disabled && s.chipPressed,
            ]}
            onPress={() => onToggle(option.id)}
            disabled={disabled}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: selected, disabled }}
            accessibilityLabel={groupLabel ? `${groupLabel}：${option.label}` : option.label}
          >
            {/* 選取狀態同時用形狀（勾／點）與顏色表示，不只靠顏色。 */}
            <View
              style={[
                multi ? s.checkbox : s.radio,
                selected && (multi ? s.checkboxOn : s.radioOn),
              ]}
            >
              {selected
                ? multi
                  ? <CheckMarkIcon size={12} color={ParentColors.onSidebar} />
                  : <View style={s.radioDot} />
                : null}
            </View>
            <Text style={[s.gridLabel, selected && s.gridLabelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 選項標籤超過這個字數就不適合塞進半寬格子（會變成每格三四行）。 */
const COMPACT_LABEL_MAX = 8;
/** 超過這個數量時，兩欄反而看不出結構。 */
const COMPACT_OPTION_MAX = 6;

/**
 * 這一組選項適不適合用兩欄格狀呈現。
 *
 * 純函式、可單測：規則是「短標籤 + 選項不多」。像「再試一次容易錯的內容」這種
 * 十個字的句子，或超過六項的科目清單，仍走整列 SelectableRow。
 */
export function shouldUseCompactGrid(
  options: Array<{ label: string }>,
): boolean {
  if (options.length === 0 || options.length > COMPACT_OPTION_MAX) return false;
  return options.every(option => option.label.length <= COMPACT_LABEL_MAX);
}

/**
 * 一整組選項欄位（標題 + 選項 + 其他自填 + 錯誤）。
 *
 * 五支 editor 原本各寫一份幾乎相同的 map，抽出來之後「哪些選項用兩欄」
 * 只需要在這裡決定一次，不會有某支 editor 忘了跟上。
 */
export function OptionGroupField({
  group,
  selectedIds,
  customValue,
  onToggle,
  onCustomChange,
  optionError,
  customError,
  softLimit,
  softLimitNotice,
}: {
  group: {
    id: string;
    label: string;
    selection: 'single' | 'multiple';
    options: Array<{ id: string; label: string }>;
    allowCustom?: boolean;
    required?: boolean;
  };
  selectedIds: string[];
  customValue: string;
  onToggle: (optionId: string) => void;
  onCustomChange: (value: string) => void;
  optionError?: string;
  customError?: string;
  /** 複選超過這個數量就出現柔和提示（不禁止）。 */
  softLimit?: number;
  softLimitNotice?: string;
}) {
  const compact = shouldUseCompactGrid(group.options);
  const showCustom = group.allowCustom && selectedIds.includes('other');
  const overLimit =
    group.selection === 'multiple'
    && softLimit !== undefined
    && selectedIds.length > softLimit;

  return (
    <View style={s.field}>
      <FieldLabel required={group.required}>{group.label}</FieldLabel>
      {group.selection === 'multiple' ? <HelperText>可以選多項</HelperText> : null}

      {compact ? (
        <CompactOptionGrid
          options={group.options}
          selectedIds={selectedIds}
          selection={group.selection}
          onToggle={onToggle}
          hasError={!!optionError}
          groupLabel={group.label}
        />
      ) : (
        <View style={s.optionList}>
          {group.options.map(option => (
            <SelectableRow
              key={option.id}
              label={option.label}
              selected={selectedIds.includes(option.id)}
              onPress={() => onToggle(option.id)}
              multi={group.selection === 'multiple'}
            />
          ))}
        </View>
      )}

      <ValidationMessage>{optionError}</ValidationMessage>

      {showCustom ? (
        <>
          <DraftTextInput
            value={customValue}
            onChangeText={onCustomChange}
            placeholder="請補充說明"
            errorText={customError}
            accessibilityLabel="其他內容"
          />
          <ValidationMessage>{customError}</ValidationMessage>
        </>
      ) : null}

      {overLimit && softLimitNotice ? (
        <PolicyNotice tone="warn">{softLimitNotice}</PolicyNotice>
      ) : null}
    </View>
  );
}

/** 開關列（第一週回顧、週末回顧、里程碑／步驟啟用）。 */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, value && s.rowSelected, pressed && s.rowPressed]}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={s.rowMain}>
        <Text style={[s.rowLabel, value && s.rowLabelSelected]}>{label}</Text>
        {description ? <Text style={s.rowDesc}>{description}</Text> : null}
      </View>
      <View style={[s.track, value && s.trackOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// 複合控制
// ---------------------------------------------------------------------------

/**
 * 每週執行日。UI 從週一排到週日，但存進 recurrenceDays 的值沿用專案定義（0 = 週日）。
 */
export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const toggle = (day: number) => {
    onChange(value.includes(day) ? value.filter(d => d !== day) : [...value, day].sort((a, b) => a - b));
  };

  return (
    <View style={s.weekdayRow}>
      {WEEKDAYS.map(day => {
        const active = value.includes(day.value);
        return (
          <Pressable
            key={day.value}
            style={({ pressed }) => [
              s.weekday,
              active && s.weekdayOn,
              pressed && s.chipPressed,
            ]}
            onPress={() => toggle(day.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            // 讀出「星期一」而不是單一個「一」。
            accessibilityLabel={`星期${day.label}`}
          >
            <Text style={[s.weekdayText, active && s.weekdayTextOn]}>{day.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 期間選擇。choices 來自 catalog 的 durationDayChoices，沒有時至少列出目前值。 */
export function DurationPicker({
  value,
  choices,
  onChange,
}: {
  value: number;
  choices: number[];
  onChange: (next: number) => void;
}) {
  const list = choices.length > 0 ? choices : [value];
  return (
    <View style={s.chipRow}>
      {list.map(days => (
        <SelectableChip
          key={days}
          label={`${days} 天`}
          selected={value === days}
          onPress={() => onChange(days)}
        />
      ))}
    </View>
  );
}

/**
 * 每次時間。提供固定選項 + 自訂 +（可選）不設定。
 * value 為 undefined 代表「不設定固定分鐘」。
 */
export function MinutePicker({
  value,
  choices,
  allowNone,
  onChange,
  customText,
  onCustomTextChange,
  error,
}: {
  value: number | undefined;
  choices: number[];
  allowNone: boolean;
  onChange: (next: number | undefined) => void;
  customText: string;
  onCustomTextChange: (v: string) => void;
  error?: string;
}) {
  const isPreset = value !== undefined && choices.includes(value);
  const isCustom = value !== undefined && !isPreset;

  return (
    <View style={s.stack2}>
      <View style={s.chipRow}>
        {choices.map(m => (
          <SelectableChip
            key={m}
            label={`${m} 分鐘`}
            selected={value === m}
            onPress={() => onChange(m)}
          />
        ))}
        <SelectableChip
          label="自訂"
          selected={isCustom}
          onPress={() => {
            const parsed = Number.parseInt(customText, 10);
            onChange(Number.isFinite(parsed) ? parsed : 25);
          }}
        />
        {allowNone ? (
          <SelectableChip
            label="不設定固定分鐘"
            selected={value === undefined}
            onPress={() => onChange(undefined)}
          />
        ) : null}
      </View>

      {isCustom ? (
        <View style={s.inlineInput}>
          <View style={s.inlineInputField}>
            <DraftTextInput
              value={customText}
              onChangeText={text => {
                onCustomTextChange(text);
                const parsed = Number.parseInt(text, 10);
                onChange(Number.isFinite(parsed) ? parsed : Number.NaN);
              }}
              placeholder="例如 25"
              keyboardNumeric
              hasError={!!error}
              accessibilityLabel="自訂每次分鐘數"
            />
          </View>
          <Text style={s.inlineSuffix}>分鐘</Text>
        </View>
      ) : null}

      <ValidationMessage>{error}</ValidationMessage>
    </View>
  );
}

/** 開始日期：文字輸入 + 今天／明天快速鍵，不引入日期選擇器 dependency。 */
export function StartDatePicker({
  value,
  onChange,
  todayValue,
  tomorrowValue,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  todayValue: string;
  tomorrowValue: string;
  error?: string;
}) {
  return (
    <View style={s.stack2}>
      <View style={s.chipRow}>
        <SelectableChip
          label="今天"
          selected={value === todayValue}
          onPress={() => onChange(todayValue)}
        />
        <SelectableChip
          label="明天"
          selected={value === tomorrowValue}
          onPress={() => onChange(tomorrowValue)}
        />
      </View>
      <DraftTextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        hasError={!!error}
        accessibilityLabel="開始日期"
      />
      <ValidationMessage>{error}</ValidationMessage>
    </View>
  );
}

/** 固定星期 vs 每週次數的二選一。 */
export function ScheduleModePicker({
  value,
  onChange,
}: {
  value: 'fixed_days' | 'weekly_frequency';
  onChange: (next: 'fixed_days' | 'weekly_frequency') => void;
}) {
  return (
    <View style={s.segmented}>
      {([
        { id: 'fixed_days' as const, label: '固定星期' },
        { id: 'weekly_frequency' as const, label: '每週次數' },
      ]).map(item => {
        const active = value === item.id;
        return (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              s.segment,
              active && s.segmentOn,
              pressed && !active && s.chipPressed,
            ]}
            onPress={() => onChange(item.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.segmentText, active && s.segmentTextOn]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 每週幾次。不指定星期時使用。 */
export function WeeklyFrequencyPicker({
  value,
  choices,
  onChange,
}: {
  value: number | undefined;
  choices: number[];
  onChange: (next: number) => void;
}) {
  return (
    <View style={s.chipRow}>
      {choices.map(n => (
        <SelectableChip
          key={n}
          label={`每週 ${n} 次`}
          selected={value === n}
          onPress={() => onChange(n)}
        />
      ))}
    </View>
  );
}

/** 家長一開始怎麼協助（家庭角色）。 */
export function SupportLevelPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string; description: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <View style={s.stack2}>
      {options.map(option => (
        <SelectableRow
          key={option.id}
          label={option.label}
          description={option.description}
          selected={value === option.id}
          onPress={() => onChange(option.id)}
        />
      ))}
    </View>
  );
}

export type ResponsibilityRow = {
  id: string;
  text: string;
  enabled: boolean;
  isCustom: boolean;
};

/**
 * 責任項目清單：可改文字、可開關、可新增最多一個自訂項目。
 * 不做拖曳排序（本輪範圍外）。
 */
export function ResponsibilityListEditor({
  items,
  maxItems,
  onChange,
}: {
  items: ResponsibilityRow[];
  maxItems: number;
  onChange: (next: ResponsibilityRow[]) => void;
}) {
  const customCount = items.filter(item => item.isCustom).length;
  /*
    preset 的清單是「模板項目 ＋ 最多一項自訂」——「補一項」是它的用途。
    自訂任務沒有模板，整份清單都是自訂的，那時候上限只剩 maxItems ——
    否則家長只能寫一項負責內容，而規則建議的是 2–4 項。
  */
  const allCustom = items.length > 0 && items.every(item => item.isCustom);
  const canAdd =
    items.length < maxItems && (customCount < 1 || allCustom || items.length === 0);

  const patchAt = (index: number, partial: Partial<ResponsibilityRow>) => {
    const next = [...items];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  return (
    <View style={s.stack2}>
      {items.map((item, index) => (
        <View key={item.id} style={s.respRow}>
          <View style={s.respIndex}>
            <Text style={s.respIndexText}>{index + 1}</Text>
          </View>
          <View style={s.respMain}>
            <DraftTextInput
              value={item.text}
              onChangeText={text => patchAt(index, { text })}
              placeholder="例如：用餐前放好約定餐具"
              accessibilityLabel={`第 ${index + 1} 項負責內容`}
            />
          </View>
          <SelectableChip
            label={item.enabled ? '使用中' : '已關閉'}
            selected={item.enabled}
            onPress={() => patchAt(index, { enabled: !item.enabled })}
          />
        </View>
      ))}

      {canAdd ? (
        <SelectableChip
          label="新增一項自訂內容"
          selected={false}
          onPress={() =>
            onChange([
              ...items,
              { id: `resp-custom-${Date.now()}`, text: '', enabled: true, isCustom: true },
            ])
          }
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  fieldLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  requiredMark: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgMuted,
  },
  helperText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
  },
  errorText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.error,
  },

  policyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[3],
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintPine,
  },
  policyNoticeWarn: {
    backgroundColor: ParentColors.tintAmber,
  },
  policyBody: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  policyTitle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 21,
  },
  policyNoticeText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  policyDetails: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  policyToggle: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine500,
    lineHeight: 20,
  },

  field: {
    gap: ParentSpacing[2],
  },
  optionList: {
    gap: ParentSpacing[2],
  },

  /** 唯讀清單：淡色資訊框，刻意沒有邊框與可點外觀。 */
  outcomeBox: {
    gap: ParentSpacing[2],
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  outcomeIntro: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.fgSecondary,
  },
  outcomeList: {
    gap: 5,
  },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[2],
  },
  outcomeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: ParentColors.pine400,
    flexShrink: 0,
  },
  outcomeText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.fgPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  gridError: {
    // 錯誤只改邊框色，不整片染紅。
    borderRadius: ParentRadii.md,
  },
  gridCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    minHeight: 48,
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  /** 兩欄：扣掉一個 gap 後各佔一半，文字過長時自然換行、不設固定高度。 */
  gridCellHalf: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 150,
  },
  gridCellFull: {
    flexGrow: 1,
    flexBasis: '100%',
  },
  gridCellOn: {
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
  },
  gridCellDisabled: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  gridLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.fgPrimary,
  },
  gridLabelOn: {
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine500,
  },

  input: {
    minHeight: 46,
    paddingHorizontal: ParentSpacing[3],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    lineHeight: 22,
    color: ParentColors.fgPrimary,
  },
  multiline: {
    paddingTop: ParentSpacing[3],
  },
  /**
   * 底線式，不是有邊框的方塊——用在夾在一般文字中間的短數字
   * （例如「約第 __ 天」），要跟兩側文字的底線對齊，不能看起來像獨立的卡片。
   */
  inputCompact: {
    minHeight: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    paddingVertical: 0,
    fontSize: ParentFontSizes.xs,
    lineHeight: ParentFontSizes.xs + 4,
    textAlign: 'center',
  },
  inputError: {
    borderColor: ParentColors.error,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  rewardChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  chipSelected: {
    backgroundColor: ParentColors.tintPine,
    borderColor: ParentColors.pine300,
  },
  chipPressed: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  chipDisabled: {
    backgroundColor: ParentColors.bgSurfaceWarm,
    borderColor: ParentColors.borderSoft,
  },
  chipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
  },
  chipTextSelected: {
    color: ParentColors.pine500,
    fontWeight: ParentFontWeights.bold,
  },
  chipTextDisabled: {
    color: ParentColors.fgMuted,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    minHeight: 52,
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  rowSelected: {
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
  },
  rowPressed: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    lineHeight: 22,
  },
  rowLabelSelected: {
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.pine500,
  },
  rowDesc: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ParentColors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
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
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ParentColors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxOn: {
    backgroundColor: ParentColors.pine500,
    borderColor: ParentColors.pine500,
  },

  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: ParentColors.stone200,
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
  },
  trackOn: {
    backgroundColor: ParentColors.pine500,
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ParentColors.bgSurface,
  },
  knobOn: {
    alignSelf: 'flex-end',
  },

  weekdayRow: {
    flexDirection: 'row',
    // 抽屜最窄（viewport 不足時可退到 300）也不橫向溢出：擠不下就換行。
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  weekday: {
    flex: 1,
    minWidth: 40,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  weekdayOn: {
    backgroundColor: ParentColors.pine500,
    borderColor: ParentColors.pine500,
  },
  weekdayText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  weekdayTextOn: {
    color: ParentColors.onSidebar,
    fontWeight: ParentFontWeights.bold,
  },

  stack2: {
    gap: ParentSpacing[2],
  },
  inlineInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  inlineInputField: {
    flex: 1,
    minWidth: 0,
  },
  inlineSuffix: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
  },

  segmented: {
    flexDirection: 'row',
    gap: ParentSpacing[2],
    padding: 4,
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.sm,
  },
  segmentOn: {
    backgroundColor: ParentColors.bgSurface,
    borderWidth: 1,
    borderColor: ParentColors.pine300,
  },
  segmentText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
  },
  segmentTextOn: {
    color: ParentColors.pine500,
    fontWeight: ParentFontWeights.bold,
  },

  respRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // 480px 抽屜放不下「序號＋輸入框＋開關」時降為兩列，輸入框不被壓成一個字寬。
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
  },
  respIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.tintPine,
    flexShrink: 0,
  },
  respIndexText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.pine500,
  },
  respMain: {
    flex: 1,
    minWidth: 180,
  },
});

export const editorControlStyles = s;
