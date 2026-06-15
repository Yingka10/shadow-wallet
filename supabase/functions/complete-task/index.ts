/**
 * complete-task — server-side task completion entry point.
 *
 * Delegates all writes to the complete_task() Postgres RPC, which handles
 * everything atomically in a single transaction (duplicate guard, coin award,
 * time_savings, habit milestone). See migration 20260615000002_fn_complete_task.sql.
 *
 * The user's JWT is verified first to ensure they own the child.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Build Taipei timestamp (mirrors taskActions.ts completeTask)
    const nowUtc = new Date();
    const taipeiHour = String((nowUtc.getUTCHours() + 8) % 24).padStart(2, '0');
    const taipeiMin = String(nowUtc.getUTCMinutes()).padStart(2, '0');
    const completedAt = `${completedDate}T${taipeiHour}:${taipeiMin}:00+08:00`;

    // Delegate to the atomic Postgres RPC — duplicate guard, coin award,
    // time_savings, and habit milestone all commit or roll back together.
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc('complete_task', {
      p_task_id:             taskId,
      p_child_id:            childId,
      p_completed_at:        completedAt,
      p_is_prerequisite_met: isPrerequisiteMet,
      p_goal_id:             goalId ?? null,
    });

    if (rpcErr) throw new Error(rpcErr.message);

    if (result?.error === 'already_completed') {
      return new Response(
        JSON.stringify({ error: 'already_completed', message: '今天已經完成過這個任務了' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify(result),
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
