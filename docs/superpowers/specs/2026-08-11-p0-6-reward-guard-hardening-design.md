# P0-6 Reward Guard Hardening Design

## Scope

Harden the existing production task-completion and reward path without changing
Proposal/Plan Version, wallet policy, weekly reports, P0-5 confirmation, or the
P0-8 confirmed-snapshot model.

## Security boundary

`complete-task` must invoke `complete_task` through a Supabase client carrying
the caller's JWT. PostgreSQL `auth.uid()` is therefore the single family
authorization truth. The Edge Function does not use service-role credentials
for the completion RPC.

The database function remains `SECURITY DEFINER`, but validates the caller's
parent-family membership before any mutable work. It also verifies that the
task belongs to the child's family, is active, and has an active `child_tasks`
assignment for that exact child/task pair.

## Goal and reward integrity

When `p_goal_id` is supplied, the function locks that `long_term_goals` row and
validates all of the following before completion/progress/reward writes:

- the goal exists and is active;
- the goal belongs to `p_child_id`;
- the goal references `p_task_id`;
- the task and child already passed the family checks.

Only a validated D/habit goal may advance `current_day`. Checkpoint coin is an
additional reward and is allowed only when the canonical task is
`coin_eligible`, the checkpoint amount is positive, and the amount is within
the persisted `reward_coin_min`/`reward_coin_max` range. Flexible
`weekly_frequency` tasks never mint checkpoint coin, preventing the P0 weekly
rhythm reading model from acquiring an unsupported milestone reward. Normal
per-completion coin remains governed by the existing task reward policy.

## Duplicate handling

The frequency guard continues to return the typed `already_completed` result
for ordinary retries. The completion insert additionally catches
`unique_violation`, reads `CONSTRAINT_NAME`, and converts only
`idx_unique_task_per_day` to `already_completed`. Every other unique violation
is re-raised so unrelated integrity failures are not hidden.

## Legacy assignment compatibility

A narrow forward-migration backfill creates missing active `child_tasks` rows
only for an active `long_term_goals` row whose referenced task is also active.
No unrelated orphan task is activated and no global legacy bypass is added.

## Function provenance and ACL

The forward migration starts from the complete `complete_task` definition in
the latest master migration,
`20260804000000_parent_custom_task_persistence.sql`, then adds the guards above.
It does not copy an older function body.

The migration explicitly restates execute privileges:

- `settle_weekly_interest`: service role only;
- `complete_task`: authenticated and service role, not PUBLIC/anon;
- `mark_task_atomic`: authenticated and service role, not PUBLIC/anon.

## Edge structure and errors

The Edge entrypoint creates a caller-scoped client and delegates request logic
to a dependency-injected handler. This permits deterministic unit tests without
Deno or network access. Authentication/authorization failures map to 401/403,
typed `already_completed` maps to 409, and other database failures remain
visible as request errors.

## Verification

Static migration tests protect ordering, ownership locks, assignment/activity
guards, checkpoint policy, collision constraint matching, backfill scope, and
ACL. Handler tests protect caller-JWT RPC use and response mapping. A staging
verification asset documents live zero-side-effect and ACL checks; staging is
not claimed unless it is actually run against an explicitly selected project.
