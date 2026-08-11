# P0-8G Shared Plan Integrity Guard Design

## Scope

P0-8G is a competition safety guard, not the active-plan adjustment workflow. It prevents an already-active shared plan from being silently changed through legacy task management or Weekly Report paths. It does not create adjustment requests, append Plan Versions, schedule future activation, or modify P0-5B RPCs.

An active Shared Plan task is defined authoritatively by an existing row in `child_proposals` where:

```sql
child_proposals.task_id = target_task_id
AND child_proposals.status = 'active'
```

`tasks.creation_source = 'child_proposal'` is supporting provenance only. It is neither sufficient nor required for the guard. This lets demo reset delete the Proposal first and then clean the remaining task graph without leaving an orphaned source flag permanently frozen.

## Protected mutations

### `tasks`

The guard compares old and new values and rejects only changes to shared commitments:

- Identity and task meaning: `name`, `category`, `day_type`, `long_term_type`, `is_long_term`, `duration_type`, `plan_mode`, `task_source`, `original_expectation`, `task_details`, `notes`.
- Completion meaning: `completion_policy`, `completion_description`, `progress_model`, `next_step`.
- Schedule and cadence: `recurrence_days`, `due_date`, `schedule_mode`, `weekly_frequency`, `start_date`, `scheduled_date`, `preferred_time`, `preferred_time_custom`, `claim_period`, `max_claims_per_period`.
- Effort and support: `base_time_min`, `estimated_minutes`, `difficulty`, `allow_repeat`, `review_enabled`, `review_after_days`, `support_level`.
- Reward commitment: `reward_policy`, `coin_override`, `time_saving_min`, `reward_coin_amount`, `reward_coin_suggested_amount`, `reward_coin_min`, `reward_coin_max`, `task_policy_version`, `reward_policy_version`.
- Lifecycle/provenance: `is_active` when changing from true to false, `creation_source`, and task deletion.

The trigger does not blanket-freeze the row. Columns not listed above remain available to legitimate runtime mutations.

### `long_term_goals`

The guard rejects a change to `status` and rejects deletion while the task is linked to an active Proposal. It does not reject `current_day`, `current_level`, completion timestamps, or other progress fields used by `complete_task`.

### `child_tasks`

A restrictive RLS policy rejects a resulting `is_active = false` for an active Shared Plan and rejects deletion. Updates whose resulting assignment stays active remain allowed. The existing SECURITY DEFINER `complete_task` remains the authoritative one-time completion lifecycle and bypasses caller RLS without changing the P0-6 function.

## Server contract

The repeat-safe migration `20260816000000_shared_plan_integrity_guard.sql` adds:

- internal `is_active_shared_plan_task_v1(uuid)` lookup;
- material-specific `tasks` update/delete triggers;
- status-specific `long_term_goals` update/delete triggers;
- restrictive `child_tasks` update/delete RLS policies;
- forward definitions of `update_task_schedule` and `update_task_recurrence_days` based on their latest master definitions.
- a forward definition of the latest-master `child_proposal_plan_version_guard()` that adds only the five immutable content/lineage fields proven missing by P0-5B staging acceptance: `preferred_time`, `preferred_time_custom`, `estimated_minutes`, `adopted_from_plan_version_id`, and `requires_child_review`.

The two Weekly Report RPCs check the active Proposal link before mutation and return:

```json
{
  "error": "SHARED_PLAN_REQUIRES_RENEGOTIATION"
}
```

No task or intervention log write occurs for this result.

Direct material table writes fail with the stable database message `SHARED_PLAN_REQUIRES_RENEGOTIATION`. Client code translates both forms to the product copy:

> 這是一起確認的計畫，調整內容需要再一起確認。

## Client behavior

- Weekly Report adoption and revert call the guarded RPC before changing suggestion evidence. A rejected shared task stays unchanged and the suggestion remains unadopted/unreverted.
- Parent Task Edit and Detail query the active Proposal linkage. Their legacy material save, deactivate, and delete controls are disabled for a Shared Plan and show the informational copy.
- Legacy long-term pause/delete calls map the database guard to the same informational copy.
- No functional “提出調整” control is shown. P0-8M owns that workflow.
- Ordinary parent-created tasks retain all existing edit, adoption, revert, pause, and delete behavior.

## Compatibility and non-goals

- `complete_task`, reward minting, wallets, transactions, task completions, and weekly progress reads are unchanged.
- P0-5A direct confirmation creates or updates the canonical task before the Proposal becomes active, so the guard does not block activation.
- P0-5B acceptance follows the same ordering. P0-8G does not edit any P0-5B orchestration RPC.
- The Plan Version hardening preserves the existing transition lifecycle: `effective_at`, `child_accepted_at`, `parent_confirmed_at`, and the legal first write of `confirmed_*` are not content-frozen. Existing protection for `purpose_category`, `completion_description`, `progress_model`, and `next_step` remains unchanged.

## Verification

Tests must demonstrate:

- ordinary schedule and recurrence updates still succeed;
- active Shared Plan schedule/recurrence updates return the typed result with zero writes;
- direct Shared Plan task material updates and deletes are rejected;
- only lifecycle changes are rejected for goals and assignments, while progress updates remain allowed;
- Weekly Report adoption/revert leaves both task and suggestion evidence unchanged after the guard;
- Parent Edit/Detail refuses Shared Plan material actions but preserves ordinary task behavior;
- shared long-term pause/delete is rejected while ordinary long-term behavior remains;
- direct updates to each of the five newly protected Plan Version fields are rejected, while activation lifecycle writes remain legal;
- P0-5B 4→3→accept and P0-5A Direct Confirm regressions remain green;
- P0-5A, P0-6 `complete_task`, P0-7.1 weekly rhythm, TypeScript, and diff checks remain green.
