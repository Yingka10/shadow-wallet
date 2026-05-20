/**
 * complete-task — server-side task completion workflow.
 * Replicates the atomicity of completeTask() from taskActions.ts:
 *   1. Insert task_completion
 *   2. Task-C/D: update wallet balance + insert transaction
 *   3. Task-B: insert time_savings
 *   4. Task-D habit: increment long_term_goal.current_day, check milestone coin
 *
 * Using service role key to perform multi-table writes without RLS interference.
 * The user's JWT is verified first to ensure they own the child.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type CheckpointRewards = Record<string, number>;

function calcCoin(
  category: string,
  baseTimeMin: number,
  difficulty: number,
  coinOverride: number | null,
  isPrerequisiteMet: boolean,
): number {
  if (category === 'A' || category === 'B') return 0;
  const base = coinOverride ?? Math.round(baseTimeMin * difficulty);
  return Math.round(base * (isPrerequisiteMet ? 1.0 : 0.7));
}

function getPrevCheckpoint(currentDay: number, rewards: CheckpointRewards | null): number {
  if (!rewards) return 0;
  const days = Object.keys(rewards).map(Number).sort((a, b) => a - b);
  const prev = days.filter(d => d < currentDay);
  return prev.length > 0 ? prev[prev.length - 1] : 0;
}

function checkMilestone(
  goalId: string,
  currentDay: number,
  rewards: CheckpointRewards | null,
): { goalId: string; day: number; coinReward: number } | null {
  if (!rewards) return null;
  const coin = rewards[String(currentDay)];
  if (coin === undefined) return null;
  return { goalId, day: currentDay, coinReward: coin };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { taskId, childId, completedDate, isPrerequisiteMet, goalId } = await req.json() as {
      taskId: string;
      childId: string;
      completedDate: string;
      isPrerequisiteMet: boolean;
      goalId?: string;
    };

    // Fetch task to get category + coin params
    const { data: task, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .select('id, category, base_time_min, difficulty, coin_override, time_saving_min, long_term_type')
      .eq('id', taskId)
      .single();
    if (taskErr || !task) throw new Error(taskErr?.message ?? 'Task not found');

    const coinEarned = calcCoin(
      task.category,
      task.base_time_min,
      task.difficulty,
      task.coin_override,
      isPrerequisiteMet,
    );
    const timeSavedMin = task.category === 'B' ? task.time_saving_min : 0;

    // Build completed_at: use actual Taipei clock time on the requested date
    // so the parent dashboard shows real completion times instead of always 08:00
    const nowUtc = new Date();
    const taipeiHour = String((nowUtc.getUTCHours() + 8) % 24).padStart(2, '0');
    const taipeiMin = String(nowUtc.getUTCMinutes()).padStart(2, '0');
    const completedAt = `${completedDate}T${taipeiHour}:${taipeiMin}:00+08:00`;

    // 1. Insert task_completion
    const { data: completion, error: completionErr } = await supabaseAdmin
      .from('task_completions')
      .insert({
        task_id: taskId,
        child_id: childId,
        completed_at: completedAt,
        reported_by: 'child',
        status: 'completed',
        coin_earned: coinEarned,
        time_saved_min: timeSavedMin,
      })
      .select('id')
      .single();
    if (completionErr || !completion) throw new Error(completionErr?.message ?? 'Failed to insert completion');

    const completionId = completion.id;
    let milestone: { goalId: string; day: number; coinReward: number } | null = null;

    // 2. Task-C/D: update wallet + insert transaction
    if (coinEarned > 0) {
      const { data: wallet, error: walletErr } = await supabaseAdmin
        .from('wallets')
        .select('id, balance')
        .eq('child_id', childId)
        .eq('wallet_type', 'spending')
        .single();
      if (walletErr || !wallet) throw new Error(walletErr?.message ?? 'Spending wallet not found');

      const { error: wUpdateErr } = await supabaseAdmin
        .from('wallets')
        .update({ balance: wallet.balance + coinEarned })
        .eq('id', wallet.id);
      if (wUpdateErr) throw new Error(wUpdateErr.message);

      const { error: txErr } = await supabaseAdmin
        .from('transactions')
        .insert({
          wallet_id: wallet.id,
          amount: coinEarned,
          type: 'earn',
          reference_id: completionId,
          reference_type: 'task_completion',
        });
      if (txErr) throw new Error(txErr.message);
    }

    // 3. Task-B: insert time_savings
    if (task.category === 'B' && timeSavedMin > 0) {
      const { error: tsErr } = await supabaseAdmin
        .from('time_savings')
        .insert({ child_id: childId, completion_id: completionId, minutes_saved: timeSavedMin });
      if (tsErr) throw new Error(tsErr.message);
    }

    // 4. Task-D habit: increment current_day, check milestone
    if (task.category === 'D' && task.long_term_type === 'habit' && goalId) {
      const { data: goal, error: goalErr } = await supabaseAdmin
        .from('long_term_goals')
        .select('current_day, checkpoint_rewards')
        .eq('id', goalId)
        .single();
      if (goalErr || !goal) throw new Error(goalErr?.message ?? 'Long-term goal not found');

      const newDay = goal.current_day + 1;
      const { error: goalUpdateErr } = await supabaseAdmin
        .from('long_term_goals')
        .update({ current_day: newDay })
        .eq('id', goalId);
      if (goalUpdateErr) throw new Error(goalUpdateErr.message);

      const rewards = goal.checkpoint_rewards as CheckpointRewards | null;
      milestone = checkMilestone(goalId, newDay, rewards);

      if (milestone) {
        const { data: wallet } = await supabaseAdmin
          .from('wallets')
          .select('id, balance')
          .eq('child_id', childId)
          .eq('wallet_type', 'spending')
          .single();

        if (wallet) {
          await supabaseAdmin
            .from('wallets')
            .update({ balance: wallet.balance + milestone.coinReward })
            .eq('id', wallet.id);

          await supabaseAdmin.from('transactions').insert({
            wallet_id: wallet.id,
            amount: milestone.coinReward,
            type: 'earn',
            reference_id: goalId,
            reference_type: 'long_term_goal_milestone',
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ completionId, coinEarned, timeSavedMin, milestone }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[complete-task] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
