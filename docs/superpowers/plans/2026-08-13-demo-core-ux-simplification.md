# GrowBook WP2 Demo Core UX Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the child long-term detail, Together Review, parent proposal adjustment, and child shared-version confirmation demo flows visually focused while preserving all WP1/P0 product contracts.

**Architecture:** Keep the existing screen containers, presentation builders, hooks, service commands, and callbacks. Refactor only the seven scoped React Native presentation components and their focused tests; use local UI state for disclosures and staged questions, while every persisted change continues through the existing P0-5B/P0-8M callbacks.

**Tech Stack:** React Native 0.81, React 19, TypeScript 5.9, React Native Testing Library, Jest Expo, existing GrowBook `Colors` and `parentTheme` tokens.

---

## File Map

- Modify `src/components/child/LongTermGoalDetailView.tsx`: hero responsibility, Today card weekly rhythm, fixed-day-only week section, secondary records/details disclosure.
- Modify `src/components/child/LongTermGoalDetailSheets.tsx`: staged reading review and weak shared-impact route.
- Modify `src/screens/parent/tablet/home/ParentProposalSection.tsx`: one primary surface and three-band hierarchy.
- Modify `src/screens/parent/tablet/home/ParentProposalEditSheet.tsx`: guided frequency/time/completion controls and material-diff summary.
- Modify `src/components/child/ChildPlanReviewCard.tsx`: compact child-facing diff decision surface.
- Modify the five corresponding focused test files; change `longTermGoalPresentation.ts` only if a data-derived sentence cannot be expressed truthfully in the component.
- Do not modify screens, hooks, services, Supabase code, migrations, reward policy, AI code, or shared-plan command contracts.

### Task 1: Child detail hierarchy and Today-owned weekly rhythm

**Files:**
- Modify: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx:230`
- Modify: `src/components/child/LongTermGoalDetailView.tsx:258-1035`

- [ ] **Step 1: Add failing hierarchy tests**

Add focused tests using the existing `makePresentation` and `renderView` helpers:

```tsx
it('gives flexible reading one weekly progress treatment inside Today Step', () => {
  renderView(makePresentation({
    goalKind: 'reading_habit',
    weekCompleted: 2,
    weekTarget: 3,
    weekProgressLabel: '本週完成 2／3 次',
    weekSummary: '這週已經讀 2 次，還差 1 次，今天繼續就好。',
  }));

  const today = within(screen.getByTestId('goal-today'));
  expect(today.getByText('本週 2 / 3')).toBeTruthy();
  expect(today.getByText('再 1 次，就完成這週的節奏。')).toBeTruthy();
  expect(screen.queryByTestId('goal-week')).toBeNull();
  expect(within(screen.getByTestId('goal-hero')).queryByText(/2[／/]3/)).toBeNull();
});

it('keeps a compact schedule for a real fixed-day plan', () => {
  renderView(makePresentation({
    goalKind: 'habit',
    weekTarget: 3,
    weekDays: makePresentation().weekDays,
  }));
  expect(screen.getByTestId('goal-week')).toBeTruthy();
});

it('hides records and plan details behind one secondary disclosure', () => {
  renderView(makePresentation(), {
    onOpenRecord: jest.fn(),
    onOpenDetails: jest.fn(),
  });
  expect(screen.queryByText('最近紀錄')).toBeNull();
  expect(screen.queryByText('計畫安排')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '展開更多紀錄與計畫' }));
  expect(screen.getByText('最近紀錄')).toBeTruthy();
  expect(screen.getByText('計畫安排')).toBeTruthy();
});
```

- [ ] **Step 2: Run the new tests and verify failure**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: FAIL because Today does not contain `本週 2 / 3`, flexible reading still renders `goal-week`, and supporting information is expanded by default.

- [ ] **Step 3: Make the hero long-term-only and add compact weekly rhythm to Today**

In `GoalHero`, remove `weekProgressLabel` from visible/accessibility copy while retaining `planWeekLabel`, `overallPercent`, `focusText`, and the overall progressbar. Add this helper and render it at the bottom of `TodayStepCard` for active flexible reading:

```tsx
function remainingRhythmCopy(completed: number, target: number): string {
  const remaining = Math.max(target - completed, 0);
  if (remaining === 0) return '這週的節奏完成了。';
  return `再 ${remaining} 次，就完成這週的節奏。`;
}

function TodayWeekRhythm({ presentation }: { presentation: GoalPresentation }) {
  if (presentation.goalKind !== 'reading_habit' || presentation.weekTarget <= 0) {
    return null;
  }
  return (
    <View testID="today-week-rhythm" style={styles.todayWeekRhythm}>
      <Text style={styles.todayWeekRhythmTitle}>
        本週 {presentation.weekCompleted} / {presentation.weekTarget}
      </Text>
      <Text style={styles.todayWeekRhythmCopy}>
        {remainingRhythmCopy(presentation.weekCompleted, presentation.weekTarget)}
      </Text>
    </View>
  );
}
```

Place `<TodayWeekRhythm presentation={presentation} />` after the completion/rest state. Increase the Today action type scale, padding, and CTA height with existing `Colors` tokens so it is the dominant functional card.

- [ ] **Step 4: Render standalone week progress only when it adds distinct truth**

Add a predicate and use it around `WeekProgressCard`:

```tsx
function shouldShowStandaloneWeek(presentation: GoalPresentation): boolean {
  if (presentation.goalKind === 'reading_habit') return false;
  if (presentation.goalKind === 'skill' || presentation.goalKind === 'challenge') return true;
  return presentation.weekDays.some(day => day.isScheduled);
}

{shouldShowStandaloneWeek(presentation) ? (
  <WeekProgressCard presentation={presentation} />
) : null}
```

Do not change `weekTarget`, completion filtering, or plan-notice derivation.

- [ ] **Step 5: Collapse recent records and plan arrangement behind one entry**

Add local disclosure state to the view and an accessible control:

```tsx
const [showSupportingDetails, setShowSupportingDetails] = useState(false);

<TouchableOpacity
  style={styles.supportingToggle}
  onPress={() => setShowSupportingDetails(value => !value)}
  accessibilityRole="button"
  accessibilityLabel={`${showSupportingDetails ? '收合' : '展開'}更多紀錄與計畫`}
  accessibilityState={{ expanded: showSupportingDetails }}
>
  <DetailIcon name="document" color={Colors.leaf700} />
  <Text style={styles.supportingToggleText}>更多紀錄與計畫</Text>
  <View style={showSupportingDetails && styles.supportingChevronExpanded}>
    <DetailIcon name="chevron" color={Colors.ink300} />
  </View>
</TouchableOpacity>
{showSupportingDetails ? (
  <View style={styles.supportingBody}>
    <RecentRecords records={recentRecords} onOpenRecord={onOpenRecord} />
    <PlanDetailsEntry presentation={presentation} onOpenDetails={onOpenDetails} />
  </View>
) : null}
```

Keep at most three records and all existing record/detail callbacks.

- [ ] **Step 6: Run focused child-detail tests**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/longTermGoalPresentation.test.ts src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand
```

Expected: PASS. Existing completion, time selection, invalid notice, milestone, record, and screen wiring tests remain green.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx
git commit -m "feat: focus child long-term detail on today's step"
```

### Task 2: Conversational Together Review

**Files:**
- Modify: `src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx:96`
- Modify: `src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx`
- Modify: `src/components/child/LongTermGoalDetailSheets.tsx:603-838`

- [ ] **Step 1: Add failing staged-review tests**

```tsx
it('asks the reading time first and reveals the next step after a choice', () => {
  renderSheet('review', {
    presentation: makePresentation({ weekCompleted: 2, weekTarget: 3 }),
  });
  expect(screen.getByText('這週已經讀了 2 次，一起看看什麼安排最順。')).toBeTruthy();
  expect(screen.getByText('哪個時間比較適合？')).toBeTruthy();
  expect(screen.queryByText('下週想怎麼試？')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: '晚餐後' }));
  expect(screen.getByText('下週想怎麼試？')).toBeTruthy();
  expect(screen.getByRole('button', { name: '就照現在這樣' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '改成晚餐後' })).toBeTruthy();
});

it('does not flatten shared-impact adjustments into the review', () => {
  const onOpenSheet = jest.fn();
  renderSheet('review', { onOpenSheet });
  expect(screen.queryByRole('button', { name: '調整次數' })).toBeNull();
  expect(screen.queryByRole('button', { name: '調整方式' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '和爸媽一起調整' }));
  expect(onOpenSheet).toHaveBeenCalledWith('adjustment');
});

it('states that this week’s completed records stay unchanged', () => {
  renderSheet('review');
  expect(screen.getByText('這週已完成的紀錄都會保留。')).toBeTruthy();
});
```

- [ ] **Step 2: Run the review suites and verify failure**

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx --runInBand
```

Expected: FAIL because the current sheet shows the note field and all next-step kinds at once.

- [ ] **Step 3: Replace the reading review with a two-stage flow**

Keep `ReviewDraft` unchanged. Derive stage two from `draft.preferredWindow !== null`, and derive only the two contextual choices:

```tsx
const chosenLabel = draft.preferredWindow === 'after_dinner'
  ? '晚餐後'
  : draft.preferredWindow === 'before_bed'
    ? '睡前'
    : null;
const showNextStep = draft.preferredWindow !== null;

const chooseKeep = () => onChange({ ...draft, nextStep: 'keep' });
const chooseTime = () => onChange({ ...draft, nextStep: 'time' });

<Text style={styles.reviewLead}>
  這週已經讀了 {presentation.weekCompleted} 次，一起看看什麼安排最順。
</Text>
<Text style={styles.questionLabel}>哪個時間比較適合？</Text>
<View style={styles.largeChoiceGrid}>{/* existing four REVIEW_TIME_OPTIONS */}</View>
{showNextStep ? (
  <View style={styles.reviewStage}>
    <Text style={styles.questionLabel}>下週想怎麼試？</Text>
    <OptionButton label="就照現在這樣" selected={draft.nextStep === 'keep'} onPress={chooseKeep} />
    {chosenLabel ? (
      <OptionButton label={`改成${chosenLabel}`} selected={draft.nextStep === 'time'} onPress={chooseTime} />
    ) : null}
  </View>
) : null}
```

Remove the default note textarea from the reading path; leave it available for non-reading review behavior so unrelated goal types do not regress.

- [ ] **Step 4: Preserve the exact P0-8M send predicate and add the weak route**

Retain `chosenWindow`, `wantsTimeChange`, and `canSend` unchanged. Use the existing `onOpenSheet('adjustment')` callback for shared-impact changes:

```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="和爸媽一起調整"
  style={styles.sharedImpactLink}
  onPress={() => onOpenSheet('adjustment')}
>
  <Text style={styles.sharedImpactCopy}>想調整每週次數或其他安排？</Text>
  <Text style={styles.sharedImpactAction}>和爸媽一起調整 →</Text>
</TouchableOpacity>
<Text style={styles.preservedCopy}>這週已完成的紀錄都會保留。</Text>
```

Change the eligible primary label to `下週先試${chosenLabel}`. Keep local-draft copy for non-sendable cases and do not call a mutation for `either` or `unsure`.

- [ ] **Step 5: Run review and shared-plan regressions**

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx --runInBand
```

Expected: PASS, including one P0-8M submit for a changed concrete time, idempotency, pending state, and no mutation for local-only review.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/components/child/LongTermGoalDetailSheets.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx
git commit -m "feat: make weekly review conversational"
```

### Task 3: Parent proposal as one decision surface

**Files:**
- Modify: `src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx:54`
- Modify: `src/screens/parent/tablet/home/ParentProposalSection.tsx:40-260`

- [ ] **Step 1: Add failing information-hierarchy tests**

```tsx
it('orders child voice, compact GrowBook summary, and one decision zone', () => {
  const item = card('p1', true);
  item.proposal = proposal('p1', {
    child_original_goal: '我想兩週把這本書讀完',
    child_original_motivation: '同學說這本書很好看，我也想知道後面發生什麼事。',
    cadence_mode: 'weekly_frequency',
    cadence_weekly_frequency: 4,
    child_reward_preference: 'hopes_for_coin',
  });
  render(<ParentProposalSection {...base} proposals={[item]} />);

  expect(screen.getByText('孩子的聲音')).toBeTruthy();
  expect(screen.getByText('我想兩週把這本書讀完')).toBeTruthy();
  expect(screen.getByText('GrowBook 幫忙整理')).toBeTruthy();
  expect(screen.getByText('這樣開始，適合承恩嗎？')).toBeTruthy();
  expect(screen.getByText('確認這個計畫')).toBeTruthy();
  expect(screen.getByText('調整一下')).toBeTruthy();
  expect(screen.getByText('目前不適合')).toBeTruthy();
});

it('keeps long reasoning collapsed by default', () => {
  render(<ParentProposalSection {...base} proposals={[card('p1', true)]} />);
  expect(screen.queryByText(card('p1', true).currentPlanVersion!.plan_summary!)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '展開為什麼這樣整理' }));
  expect(screen.getByText(card('p1', true).currentPlanVersion!.plan_summary!)).toBeTruthy();
});
```

- [ ] **Step 2: Run the parent proposal suite and verify failure**

```powershell
npx.cmd jest src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx --runInBand
```

Expected: FAIL because the current surface nests equal-weight summary cards and exposes the plan summary directly.

- [ ] **Step 3: Recompose each proposal into three bands**

Keep the existing mapped `source` and `card` view model. Add per-card reasoning disclosure state:

```tsx
const [expandedReasoningId, setExpandedReasoningId] = useState<string | null>(null);
const reasoningExpanded = expandedReasoningId === card.id;
```

Render child voice, structured plan facts, and actions in one outer `styles.card`. Use plain rows rather than nested cards. Only show real optional values. Gate `planSummary` behind:

```tsx
{card.planSummary ? (
  <View>
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${reasoningExpanded ? '收合' : '展開'}為什麼這樣整理`}
      accessibilityState={{ expanded: reasoningExpanded }}
      onPress={() => setExpandedReasoningId(reasoningExpanded ? null : card.id)}
    >
      <Text style={styles.reasoningAction}>為什麼這樣整理？</Text>
    </TouchableOpacity>
    {reasoningExpanded ? <Text style={styles.detailText}>{card.planSummary}</Text> : null}
  </View>
) : null}
```

Keep `onConfirm(source)`, `setEditCard(source)`, and `setCloseCard(source)` exactly as the three decision handlers, with all existing state-dependent guards.

- [ ] **Step 4: Run parent proposal and direct-confirm tests**

```powershell
npx.cmd jest src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx src/lib/childProposal/directConfirm/__tests__/buildDirectConfirmCommand.test.ts src/lib/childProposal/__tests__/transitions.test.ts --runInBand
```

Expected: PASS. Fresh AI, waiting-child, child-revisit, loading, success, error, adjust, unsuitable, and direct-confirm behavior all remain intact.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/screens/parent/tablet/home/ParentProposalSection.tsx src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx
git commit -m "feat: simplify parent proposal decision surface"
```

### Task 4: Guided parent adjustment sheet with truthful diff

**Files:**
- Modify: `src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx:19`
- Modify: `src/screens/parent/tablet/home/ParentProposalEditSheet.tsx:45-190`

- [ ] **Step 1: Add failing guided-control tests**

```tsx
it('uses a bounded frequency stepper and shows the original value', () => {
  renderSheet(card);
  expect(screen.queryByTestId('proposal-weekly-frequency-input')).toBeNull();
  expect(screen.getByText('承恩原本想：一週 4 次')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '減少每週次數' }));
  expect(screen.getByText('3 次')).toBeTruthy();
  expect(screen.getByText('一週 4 次 → 一週 3 次')).toBeTruthy();
});

it('keeps extra time options and completion editing collapsed', () => {
  renderSheet(card);
  expect(screen.queryByText('上學前')).toBeNull();
  expect(screen.queryByTestId('proposal-completion-description-input')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: '展開更多時間選項' }));
  expect(screen.getByText('上學前')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: '修改怎樣算完成' }));
  expect(screen.getByTestId('proposal-completion-description-input')).toBeTruthy();
});

it('summarizes only changed material fields before save', () => {
  renderSheet(card);
  fireEvent.press(screen.getByRole('button', { name: '減少每週次數' }));
  fireEvent.press(screen.getByText('睡覺前'));
  const summary = within(screen.getByTestId('proposal-change-summary'));
  expect(summary.getByText('一週 4 次 → 一週 3 次')).toBeTruthy();
  expect(summary.getByText('晚餐後 → 睡覺前')).toBeTruthy();
  expect(summary.queryByText(/怎樣算完成/)).toBeNull();
});
```

Add this local test helper above the cases:

```tsx
function renderSheet(value: ParentProposalCardData = card) {
  return render(
    <ParentProposalEditSheet
      visible
      card={value}
      saving={false}
      error={null}
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
  );
}
```

- [ ] **Step 2: Run the edit-sheet suite and verify failure**

```powershell
npx.cmd jest src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx --runInBand
```

Expected: FAIL because frequency is a raw `TextInput`, all time pills are visible, completion is an open textarea, and no change summary exists.

- [ ] **Step 3: Replace raw frequency with a bounded stepper**

Change `frequency` state to `number`, reset from the plan with `plan.cadence_weekly_frequency ?? 1`, and clamp controls:

```tsx
const changeFrequency = (delta: number) => {
  setFrequency(current => Math.min(7, Math.max(1, current + delta)));
  setLocalError(null);
};

<View style={styles.stepper}>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="減少每週次數" onPress={() => changeFrequency(-1)}>
    <Text style={styles.stepperAction}>−</Text>
  </TouchableOpacity>
  <Text style={styles.stepperValue}>{frequency} 次</Text>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="增加每週次數" onPress={() => changeFrequency(1)}>
    <Text style={styles.stepperAction}>＋</Text>
  </TouchableOpacity>
</View>
```

Keep submit-time `1 <= frequency <= 7` validation even though the controls clamp.

- [ ] **Step 4: Add progressive disclosure and material change summary**

Add `showAllTimes` and `editingCompletion` local state. The default time list is `[null, 'after_dinner', 'before_bed']`; show the full existing enum only when expanded. Display the current completion description in a row until edit is requested.

Import the existing formatters and add one draft cadence helper:

```tsx
import {
  formatPlanCadence,
  formatPreferredTime,
  formatPreferredTimeValue,
} from '../../../../lib/childProposal/materialDiff';

function formatDraftCadence(
  mode: 'weekly_frequency' | 'fixed_days',
  frequency: number,
  days: number[],
): string {
  if (mode === 'weekly_frequency') return `一週 ${frequency} 次`;
  const labels = [...days].sort((a, b) => a - b).map(day => DAYS[day]);
  return labels.length > 0 ? `每${labels.join('、')}` : '還沒決定';
}
```

Build summary rows from current versus original structured values:

```tsx
const changes = [
  formatDraftCadence(mode, frequency, days) !== formatPlanCadence(plan)
    ? { label: '每週安排', before: formatPlanCadence(plan), after: formatDraftCadence(mode, frequency, days) }
    : null,
  preferredTime !== plan.preferred_time || preferredTimeCustom.trim() !== (plan.preferred_time_custom ?? '')
    ? { label: '適合時間', before: formatPreferredTime(plan), after: formatPreferredTimeValue(preferredTime, preferredTimeCustom) }
    : null,
  completionDescription.trim() !== (plan.completion_description ?? '').trim()
    ? { label: '怎樣算完成', before: plan.completion_description ?? '還沒決定', after: completionDescription.trim() }
    : null,
].filter((change): change is { label: string; before: string; after: string } => change !== null);
```

Render under `testID="proposal-change-summary"`; show “目前沒有調整” when empty. The primary label is `存下來，讓承恩看看` using the available child context; if the component has no child name prop, use the brief-compatible generic `存下來，讓孩子看看` rather than inventing data.

- [ ] **Step 5: Preserve submission semantics and run tests**

Submit the same `ParentProposalMaterialEdits` keys as before. Run:

```powershell
npx.cmd jest src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx src/lib/childProposal/__tests__/reviewCommands.test.ts src/lib/childProposal/__tests__/materialDiff.test.ts --runInBand
```

Expected: PASS. No duration, reward, AI, active-plan, or migration fields appear in the saved patch.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/screens/parent/tablet/home/ParentProposalEditSheet.tsx src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx
git commit -m "feat: guide parent plan adjustments"
```

### Task 5: Compact child shared-version decision

**Files:**
- Modify: `src/components/child/__tests__/ChildPlanReviewCard.test.tsx:27`
- Modify: `src/components/child/ChildPlanReviewCard.tsx:16-120`

- [ ] **Step 1: Add failing scope and diff tests**

```tsx
it('shows only real material changes and the two child decisions', () => {
  const data = review({ preferred_time: 'before_bed' });
  data.sourcePlanVersion.preferred_time = null;
  renderCard(data);

  expect(screen.getByText('每週安排')).toBeTruthy();
  expect(screen.getByText('一週 4 次')).toBeTruthy();
  expect(screen.getByText('一週 3 次')).toBeTruthy();
  expect(screen.getByText('適合時間')).toBeTruthy();
  expect(screen.getByText('還沒決定')).toBeTruthy();
  expect(screen.getByText('睡覺前')).toBeTruthy();
  expect(screen.getByLabelText('每週安排，一週 4 次改成一週 3 次')).toBeTruthy();
  expect(screen.getByText('好，我也想這樣試試看')).toBeTruthy();
  expect(screen.getByText('我想再聊聊')).toBeTruthy();
  expect(screen.queryByText(/AI|成長幣|完整計畫/)).toBeNull();
});

it('does not invent a parent reason', () => {
  renderCard();
  expect(screen.queryByText('先從一週 3 次開始，感覺比較容易持續。')).toBeNull();
});
```

Add this helper above the cases:

```tsx
function renderCard(data: ChildProposalReviewData = review()) {
  return render(
    <ChildPlanReviewCard
      review={data}
      saving={false}
      error={null}
      onAccept={jest.fn()}
      onRequestChanges={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
}
```

- [ ] **Step 2: Run the child review suite and verify the new visual assertions fail**

```powershell
npx.cmd jest src/components/child/__tests__/ChildPlanReviewCard.test.tsx --runInBand
```

Expected: FAIL because current diff rows do not expose the combined accessible change label.

- [ ] **Step 3: Recompose the card without changing its API**

Keep `materialDiff(review.sourcePlanVersion, review.currentPlanVersion)`, the zero-diff retry state, error retry, `onAccept`, and `onRequestChanges`. Render each change as one semantic row with separate before/arrow/after columns and use a low-emphasis outline secondary button. Do not read or render fields outside `ChildProposalReviewData`.

```tsx
<View style={styles.changeRow} accessible accessibilityLabel={`${change.label}，${change.before}改成${change.after}`}>
  <Text style={styles.changeLabel}>{change.label}</Text>
  <View style={styles.diffValues}>
    <Text style={styles.before}>{change.before}</Text>
    <Text style={styles.arrow}>→</Text>
    <Text style={styles.after}>{change.after}</Text>
  </View>
</View>
```

- [ ] **Step 4: Run child review and P0-5B state tests**

```powershell
npx.cmd jest src/components/child/__tests__/ChildPlanReviewCard.test.tsx src/hooks/__tests__/useChildProposalReview.test.ts src/lib/childProposal/__tests__/reviewCommands.test.ts src/lib/childProposal/__tests__/transitions.test.ts --runInBand
```

Expected: PASS for 4→3, undecided→bedtime, accept, request changes, stale retry, and no fabricated reason.

- [ ] **Step 5: Commit Task 5**

```powershell
git add src/components/child/ChildPlanReviewCard.tsx src/components/child/__tests__/ChildPlanReviewCard.test.tsx
git commit -m "feat: simplify child shared plan review"
```

### Task 6: Integrated regression and visual acceptance preparation

**Files:**
- Modify only if a test exposes a scoped defect: the files listed in Tasks 1–5.

- [ ] **Step 1: Run all focused WP2 suites together**

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx src/screens/child/__tests__/longTermGoalPresentation.test.ts src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx src/components/child/__tests__/ChildPlanReviewCard.test.tsx --runInBand
```

Expected: PASS with no changed snapshots.

- [ ] **Step 2: Type-check**

```powershell
npx.cmd tsc --noEmit
```

Expected: exit 0 with no diagnostics.

- [ ] **Step 3: Check patch whitespace**

```powershell
git diff --check origin/master...HEAD
```

Expected: exit 0 with no output.

- [ ] **Step 4: Run full regression**

```powershell
npx.cmd jest --runInBand
```

Expected: 129 passing suites and 2,605 passing tests or a larger all-green count after new tests; existing skipped tests and known console warnings may remain.

- [ ] **Step 5: Capture or explicitly defer visual acceptance**

Start the web app only if the local environment can reach the demo data without touching staging or production:

```powershell
npm.cmd run web
```

Capture the six required surfaces: child top, child scrolled review/details, Together Review, parent proposal, parent adjustment, and child shared review. If authenticated/demo data is unavailable, do not infer visual quality from code; record exactly `VISUAL_ACCEPTANCE_REQUIRES_USER_SCREENSHOT`.

- [ ] **Step 6: Re-fetch and check upstream overlap**

```powershell
git fetch origin
git rev-parse origin/master
git diff --name-only 758832f53c800eede32a6e77118734bc89910382..origin/master
```

Expected: if `origin/master` is unchanged, continue. If it advanced without LongTerm/Review/Proposal/Shared Plan overlap, merge once and rerun Steps 1–4. If those core files overlap, stop and report the semantic conflict without merging.

- [ ] **Step 7: Record final branch state**

```powershell
git status --short --branch
git log --oneline --decorate origin/master..HEAD
```

Expected: clean feature branch with only the approved WP2 commits. Do not push until all required checks pass and the final upstream overlap check is safe.
