# Long-Term Unified Shell — Step 1 Design

## Scope

Build Step 1 only on `feat/long-term-unified-shell`, branched from
`264aa562529f0f801769d3acd88609aebde5f6eb`. The child long-term detail page
will use one information skeleton for every long-term task. Task names may
remain visible as content, but may not choose layout, progression, review mode,
or preferred-time behavior.

This work is presentation-only. It does not introduce database enums,
migrations, proposal persistence changes, AI/Gemini changes, parent proposal
changes, rewards, settlement changes, or a P0 state-machine rewrite.

## Presentation model

`GoalPresentation` will separate the domain category from progression:

- `goalKind` remains a domain shape: habit, skill, family/responsibility, or
  challenge. `reading_habit` and `isReadingPlan` are removed.
- `progression` is a presentation-only discriminator with `weekly_rhythm`,
  `fixed_days`, `staged_skill`, `accumulation`, and `challenge`.
- `supportsPreferredTimeWindow` is an explicit capability for the existing
  shared-plan preferred-time channel. It is inferred from structured state,
  never from a title or task name.

Progression precedence is: skill → `staged_skill`; challenge with valid current
and target values → `accumulation`; other challenge → `challenge`; habit or
responsibility with `progress_model === 'weekly_rhythm'` → `weekly_rhythm`;
then `schedule_mode === 'weekly_frequency'` → `weekly_rhythm`; then fixed
weekday evidence → `fixed_days`. No textual heuristic is permitted.

For legacy rows that lack canonical evidence, the mapper preserves existing
completion-target meaning. It may use `weekly_frequency` to select the visual
weekly-rhythm layout, but does not reinterpret `goal.total_days` as a duration
without explicit structured duration/end evidence.

## Unified child shell

All progressions render the same top-level order:

1. Hero/current position
2. Today/current step
3. Progress
4. Together Review/Adjust
5. More records and plan

The Hero component remains shared. Its label changes with progression (for
example, week 1 of 2, stage 2 of 4, or 8 of 20), rather than exchanging page
skeletons.

Today is the functional focal point. Its action copy resolves in this order:
`task.next_step`, `task.completion_description`, a progression-specific action,
then `task.name`. It retains existing completion, loading, retry, and record
correction behavior.

Progress is one shared section with progression-specific interior content:

- weekly rhythm: `本週 X / Y` and a short summary;
- fixed days: real completed, today, upcoming, missed, and unscheduled weekday
  states with non-punitive language;
- staged skill: actual stage progress and next-stage information;
- accumulation: current/target/unit and a real checkpoint when present;
- challenge: current progress and next checkpoint.

Milestones/checkpoints, when real, live inside Progress and do not create a
parallel major section. Together Review, review sheets, completion history,
plan details, and the collapsed More section stay in place.

## Weekly-rhythm semantics

For canonical weekly rhythm, duration and completion capacity are separate. A
14-day plan at three sessions per week is a two-week plan with about six rhythm
slots, not a fourteen-completion target. Its condition label will communicate
the plan period and frequency (for example, `2 週計畫 · 每週 3 次`). If a
reliable covered-week capacity exists, Hero progress may use it; otherwise it
uses an honest non-invented expression. The primary functional progress remains
`本週 X / 3`.

The capacity diagnostic (`6` scheduled versus `14` target) is internal and
will not enter `planNotice`, the main child shell, or the details sheet.

## Shared-plan safety

The existing preferred-time RPC gate remains unchanged in effect: a shared plan
must exist and support preferred-time adjustment; the child must select a valid
different `after_dinner` or `before_bed` value; there must be no pending request
and no in-flight submission. The only replacement is from name-based
`reading_habit` eligibility to the explicit structured capability.

Pending, submitted, failure-draft, and no-clawback behavior is preserved. In
particular, the UI must continue to say the request is awaiting parent
confirmation and must not imply that the plan is already applied; completed
records remain intact.

`LongTermDetailScreen` is frozen except for minimal capability plumbing and a
neutral preferred-time helper rename if needed. Its date normalization, legacy
completion-context fallback, reload guards, completion/retry behavior, local
append/current-day synchronization, correction, and shared-plan refresh are not
rewritten.

## Verification

Tests will add:

- a structured Demo `兩週讀完這本書` weekly-rhythm fixture with category D,
  weekly frequency three, a 14-day duration/end, and `next_step`;
- a name-invariance pair with identical structured fields and different names;
- the five-progression common-shell matrix;
- weekly duration/denominator and no-capacity-warning assertions;
- Today focal-point and fixed-day truthfulness regression coverage; and
- existing shared-plan gate plus Screen P0 regressions with capability-based
  setup.

Required checks are the six specified Jest suites, `npx tsc --noEmit`, and
`git diff --check`. Real-device visual acceptance remains a final external
acceptance step; code completion does not substitute for it.

## Self-review

This document contains no TODO/TBD placeholders. It confines Step 1 to the
four named child presentation surfaces and their tests, makes legacy ambiguity
explicitly backward-compatible, and preserves the shared-plan and completion
state-machine invariants. It does not depend on database or AI work from the
parallel P1 streams.
