/**
 * detect-abandonment — daily abandonment detection workflow.
 *
 * Trigger: Cron daily 21:00 Asia/Taipei (UTC 13:00): 0 13 * * *
 *
 * Checks all active children's last task completion date.
 * Classifies by tier:
 *   Tier 1 (3 days):  gentle nudge in child UI
 *   Tier 2 (7 days):  warning in weekly report
 *   Tier 3 (14 days): suggest pausing tasks
 *   null:             active (completed within last 3 days)
 *
 * Writes abandonment_tier to weekly_reports.task_adjustments using JSON merge
 * (append pattern) to avoid overwriting WF-3's recommendations field.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getIsoWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function calcAbandonmentTier(lastCompletedAt: string | null, nowMs: number): 1 | 2 | 3 | null {
  if (!lastCompletedAt) return 3; // Never completed = treat as tier 3
  const lastMs = new Date(lastCompletedAt).getTime();
  const daysSince = (nowMs - lastMs) / (1000 * 60 * 60 * 24);
  if (daysSince >= 14) return 3;
  if (daysSince >= 7) return 2;
  if (daysSince >= 3) return 1;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const nowMs = now.getTime();
    const correlationId = crypto.randomUUID();
    const currentWeekStart = getIsoWeekStart(now);

    // Fetch all children with their families
    const { data: children, error: childrenErr } = await supabase
      .from('children')
      .select('id, family_id, created_at');
    if (childrenErr) throw childrenErr;

    let processed = 0;
    let flagged = 0;
    let logged = 0;

    for (const child of children ?? []) {
      try {
        // Find last task completion for this child
        const { data: lastCompletion } = await supabase
          .from('task_completions')
          .select('completed_at')
          .eq('child_id', child.id)
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        const tier = calcAbandonmentTier(lastCompletion?.completed_at ?? null, nowMs);

        // Write to intervention_log only when tier changes (including recovery to 0).
        // Failures are isolated: never throw, never affect weekly_report logic below.
        const tierForLog = tier ?? 0;
        const childCreatedMs = new Date(child.created_at).getTime();
        const isNewChild = (nowMs - childCreatedMs) < 3 * 24 * 60 * 60 * 1000;
        if (!isNewChild) {
          try {
            const { data: lastEvent } = await supabase
              .from('intervention_log')
              .select('context_snapshot')
              .eq('child_id', child.id)
              .in('event_type', ['abandonment_flagged', 'abandonment_recovered'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            const lastTierRaw = (lastEvent?.context_snapshot as Record<string, unknown> | null)?.abandonment_tier;
            const lastTier = lastTierRaw == null ? null : Number(lastTierRaw);

            if (tierForLog !== lastTier) {
              const eventType = tierForLog === 0 ? 'abandonment_recovered' : 'abandonment_flagged';
              const { error: logErr } = await supabase
                .from('intervention_log')
                .insert({
                  event_type: eventType,
                  family_id: child.family_id,
                  child_id: child.id,
                  context_snapshot: {
                    abandonment_tier: tierForLog,
                    last_completion_at: lastCompletion?.completed_at ?? null,
                    days_since: lastCompletion?.completed_at
                      ? Math.floor((nowMs - new Date(lastCompletion.completed_at).getTime()) / (1000 * 60 * 60 * 24))
                      : null,
                  },
                  correlation_id: correlationId,
                  trigger_source: 'detect-abandonment-cron',
                });
              if (!logErr) logged++;
            }
          } catch (logWriteErr) {
            console.warn(`[detect-abandonment] intervention_log write failed for child ${child.id}:`, logWriteErr);
          }
        }

        // Fetch current week's report to merge (not overwrite)
        const { data: existingReport } = await supabase
          .from('weekly_reports')
          .select('id, task_adjustments')
          .eq('family_id', child.family_id)
          .eq('child_id', child.id)
          .eq('week_start', currentWeekStart)
          .maybeSingle();

        const existingAdjustments =
          (existingReport?.task_adjustments as Record<string, unknown> | null) ?? {};

        // Merge abandonment data without touching other fields (e.g., recommendations from WF-3)
        const mergedAdjustments = {
          ...existingAdjustments,
          abandonment_tier: tier,
          abandonment_checked_at: now.toISOString(),
        };

        if (existingReport?.id) {
          await supabase
            .from('weekly_reports')
            .update({ task_adjustments: mergedAdjustments })
            .eq('id', existingReport.id);
        } else if (tier !== null) {
          // No report yet — only create one if the child is flagged (tier 1+)
          await supabase.from('weekly_reports').insert({
            family_id: child.family_id,
            child_id: child.id,
            week_start: currentWeekStart,
            task_adjustments: mergedAdjustments,
          });
        }

        if (tier !== null) flagged++;
        processed++;
      } catch (childErr) {
        console.warn(`[detect-abandonment] failed for child ${child.id}:`, childErr);
      }
    }

    console.log(`[detect-abandonment] done: ${processed} children, ${flagged} flagged, ${logged} logged`);

    return new Response(
      JSON.stringify({ ok: true, processed, flagged, logged, weekStart: currentWeekStart }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[detect-abandonment] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
