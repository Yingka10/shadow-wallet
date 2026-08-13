# GrowBook WP2 Demo Core UX Simplification — Design

## Outcome

Simplify the three demo-critical surfaces without changing their product contracts:

1. Child long-term goal detail answers overall position, today's action, this week's remaining rhythm, and how to review or adjust.
2. Together Review feels like a short conversation, not a settings form.
3. Parent–child plan confirmation presents one clear decision surface, a guided adjustment sheet, and a compact child-facing diff.

Reference images guide hierarchy, warmth, and interaction density. Existing tokens, responsive behavior, readable type, natural scrolling, accessibility, and real product state remain authoritative.

## Dependency and Parallel-Lane Verdict

- Start point: `origin/master` at `758832f53c800eede32a6e77118734bc89910382`.
- `origin/master` has not advanced beyond the SHA named in the brief, so there is no upstream file overlap to reconcile before work starts.
- WP1 weekly-rhythm semantics are present: the plan period and weekly cadence are separate, and flexible weekly progress uses `weekly_frequency` rather than duration days as the weekly completion target.
- WP1 preferred-time semantics are present through the P0-8M child request → parent confirmation → next plan version flow. `after_dinner` and `before_bed` remain child-owned execution preferences for this reading flow.
- The separate Child Proposal/AI lane is out of scope. No AI prompt, Plan Draft contract, Edge Function, migration, reward, payout, settlement, or RPC changes are allowed.

## Approaches Considered

### 1. Styling-only pass

Keep the current component tree and change spacing, colors, and typography. This is low risk but cannot remove the duplicate progress hierarchy or the form-like review and adjustment experiences.

### 2. Component-local information architecture refactor — selected

Recompose the seven existing presentation components while retaining their props, callbacks, data sources, validation, and state transitions. This directly solves the UX problems, keeps the blast radius narrow, and allows focused regression tests around the real contracts.

### 3. New shared design system and generic workflow primitives

Create reusable hero, decision surface, wizard, diff, and editor primitives. This could improve consistency long-term, but it exceeds WP2, creates a broad migration surface, and conflicts with the explicit non-goal of introducing a new design system.

## Existing Component Audit

### Child long-term goal

- `LongTermDetailScreen.tsx` owns loading, completion lookup, selected time, sheet routing, record correction, and the P0-8M hook. These behaviors remain unchanged except for wiring any newly separated presentational callbacks.
- `longTermGoalPresentation.ts` owns trustworthy copy and derived values: plan/week labels, weekly target/completion, today action, week summary, notices, milestones, records, and plan detail labels. Copy should continue to come from this layer when it depends on data.
- `LongTermGoalDetailView.tsx` owns visual order, card hierarchy, collapsible explanation, completion CTA, time selector, review entry, records, and details entry. This is the main Target A refactor surface.
- `LongTermGoalDetailSheets.tsx` owns the menu, details, record, review, and adjustment sheets. Review answers are local unless the exact shared reading-plan preferred-time conditions are met; then P0-8M submits the child request. This distinction must remain explicit.
- Recent records, record correction, complete-today state, plan details, invalid-data notice, shared-plan pending notice, and review/adjustment entry points are formal functions and cannot be removed.
- Milestones remain conditional on trustworthy presentation data and must not be fabricated for the reading demo.

### Parent proposal and shared confirmation

- `ParentProposalSection.tsx` displays the child proposal, existing trusted plan-version fields, and three decisions. `onConfirm`, `onRevise`, and `onCloseProposal` are state-changing actions and must retain their current guards and loading/error states.
- `parentProposalPresentation.ts` is the source of normalized proposal and plan copy. The redesign may hide or collapse fields but must not invent AI decomposition or parent-reason data.
- `ParentProposalEditSheet.tsx` edits cadence, preferred time, and completion description. Existing bounds and validation remain authoritative; the UI changes from raw fields to guided controls.
- `ChildPlanReviewCard.tsx` uses `materialDiff` and exposes accept, request changes, and stale-data retry. It remains a diff-and-decision surface only.

## Target A — Child Long-Term Detail

### Hero

The hero keeps the night treehouse atmosphere and presents only the long-term position: category, `planWeekLabel`, one overall-plan progress indicator, and a short focus sentence. It does not show the weekly `2/3`; the Today card owns that weekly rhythm.

### Today Step

The Today Step becomes the largest functional card directly below the hero/valid notice. For the reading demo its hierarchy is:

- natural action sentence derived from `todayAction`, favoring “今天再讀 15 分鐘就好” style wording;
- expected time with a small adjustment action;
- collapsed-by-default explanation;
- dominant “記錄今天的閱讀” CTA or the existing completed-today state;
- integrated compact weekly rhythm: completed/target and remaining count.

The completion handler, double-submit guard, error recovery, selected-time behavior, and completed-record actions remain unchanged.

### Secondary content

- Flexible weekly reading does not render a seven-day judgment grid or a standalone weekly card because the Today card owns weekly rhythm.
- Fixed-day goal types retain a compact schedule section because those cells represent real schedule data.
- Skill/challenge goals retain their truthful compact overall progress.
- Review remains a visible secondary card after the main action.
- Recent records and plan details move behind one “更多紀錄與計畫” disclosure/entry. When expanded, recent records and plan arrangement remain separately actionable.
- Plan notices render only for truly invalid/unplanned data. Normal flexible reading data must not resurrect the old 6-versus-14 diagnostic.

## Target B — Together Review

The review remains a bottom sheet but becomes a two-stage conversational flow for reading plans:

1. Ask only which time felt best: dinner, bedtime, either, or unsure.
2. Ask what to try next. The primary choices are to keep the current arrangement or try the selected concrete time.

The sheet uses large touch targets, short copy, and one primary CTA such as “下週先試晚餐後”. It always states that this week's completed records remain.

Shared-impact changes such as frequency, fixed days, duration, completion standard, reward, or other commitments are not edited inline. A weaker “和爸媽一起調整” route leads to the existing negotiation/adjustment entry without generalizing P0-8M.

Data flow remains:

- local review choices stay local when there is no eligible shared reading plan;
- an eligible changed concrete preferred time submits the existing child-owned P0-8M request;
- no completion, coin, weekly target, history, or active version is changed by the review itself.

## Target C — Parent–Child Shared Plan Confirmation

### Parent proposal surface

Use one primary surface with three ordered bands:

1. Child voice: goal in large type, optional real motivation, compact proposal cadence/reward hope.
2. GrowBook summary: compact structured cadence, estimated time, completion standard, preferred time, and next step. Long `planSummary`, rhythm explanation, and reward detail become secondary/collapsible when present.
3. Decision zone: “這樣開始，適合孩子嗎？” followed by primary confirm, secondary adjust, and tertiary unsuitable actions.

Existing parent tablet sidebar, header, right rail, reminders, weekly summary, and responsive layout are untouched.

### Parent adjustment sheet

- Rename the header to “一起調整計畫” and show the child's original cadence as context.
- Weekly frequency uses a 1–7 stepper and still validates before save.
- Fixed-day mode remains available without mixing all controls into the default demo path.
- Preferred time shows a few relevant choices first, with the full legal enum behind “更多時間選項”. Custom time retains its validation.
- Completion standard is collapsed by default and opens the existing editor only on request.
- A live change summary lists only real material diffs from the original plan version.
- The CTA remains a parent revision action: save → `needs_child_review`; it never activates the plan directly.

### Child shared version

Keep only the “一起決定” framing, real `materialDiff` rows, errors/stale retry, and two decisions. Do not add AI summary, reward explanation, full plan metadata, or a fabricated parent reason. Accept and request-changes callbacks preserve the existing P0-5B transition rules.

## Error and Accessibility Behavior

- Existing loading, disabled, error, retry, and stale-version states remain visible and testable.
- Touch targets remain large; disclosure controls expose expanded state; selected choices expose selected state; progress retains accessible labels.
- Long copy may grow naturally. Content scrolls instead of shrinking typography to fit a screenshot.
- Invalid data continues through existing defensive presentation/validation paths.

## Testing and Acceptance

Focused tests will cover the 19 cases in the brief, including:

- one dominant weekly progress treatment for flexible reading;
- Today Step primacy and completed-today behavior;
- preserved record/detail access and no false 6-versus-14 notice;
- staged conversational review, preserved completion copy, and shared-impact routing;
- WP1-gated child-owned preferred-time behavior;
- parent child-voice/summary/three-action hierarchy;
- 1–7 stepper validation and accurate material-diff summary;
- compact child review with accept, request changes, stale retry, and no invented reason.

Verification requires focused Jest suites, full Jest regression, `npx tsc --noEmit`, and `git diff --check`.

Visual acceptance requires real screenshots of:

1. Child detail top viewport.
2. Child detail after scrolling to Review and More records/plan.
3. Together Review sheet.
4. Parent proposal viewport.
5. Parent adjustment sheet.
6. Child shared-version review.

If the implementation environment cannot capture these surfaces from the running app, the final status must explicitly say `VISUAL_ACCEPTANCE_REQUIRES_USER_SCREENSHOT` and stop at code readiness.

## Out of Scope

No Child Proposal redesign, AI generation/contract work, prompt or Edge Function edits, database or RPC changes, reward/payout/settlement changes, weekly report work, right-rail redesign, generalized active-plan adjustment, or new design system.
