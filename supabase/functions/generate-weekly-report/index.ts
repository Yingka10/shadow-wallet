/**
 * generate-weekly-report — AI-powered weekly report workflow.
 *
 * Trigger modes:
 *   - Cron: every Sunday 23:00 Asia/Taipei (UTC 15:00), processes all active families
 *   - HTTP POST {childId}: on-demand regeneration for a specific child
 *
 * Writes to weekly_reports:
 *   - motivation_observation: 2-3 sentence AI insight
 *   - ai_suggestions: JSON { suggestions: [...], affirmations: [...] }
 *   - task_adjustments: JSON { recommendations: [...] } (WF-4 appends abandonment_tier here)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

type TaskCategory = 'A' | 'B' | 'C' | 'D';

type WeeklyContext = {
  childId: string;
  familyId: string;
  ageGroup: string;
  motivationLevel: string;
  baumrindType: string | null;
  weekStart: string;
  taskCounts: Record<TaskCategory, { done: number; total: number }>;
  coinIncome: number;
  coinIncomeCount: number;
  coinSpend: number;
  coinSpendCount: number;
};

const BAUMRIND_LABELS: Record<string, string> = {
  elite_high_control: '高要求高回應型',
  pragmatic_labor: '高要求低回應型',
  guilt_compensate: '低要求高回應型',
  free_fatigue: '低要求低回應型',
};

const MOTIVATION_LABELS: Record<string, string> = {
  amotivation: '無動機',
  external: '外在動機',
  introjected: '內攝動機',
  internal: '內在動機',
};

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '{}';
}

type GeminiInsightResult = {
  motivation_observation: string;
  suggestions: Array<{
    body: string;
    actionLabel: string;
    action: 'adjust_reminder' | 'increase_difficulty' | 'add_contribution';
  }>;
  affirmations: string[];
  task_recommendations: Array<{
    category: string;
    suggestion: string;
  }>;
};

async function generateInsight(ctx: WeeklyContext): Promise<GeminiInsightResult> {
  const catLines = (['A', 'B', 'C', 'D'] as TaskCategory[])
    .map(cat => `- Task-${cat}：${ctx.taskCounts[cat].done}/${ctx.taskCounts[cat].total} 完成`)
    .join('\n');

  const prompt = `你是一個家庭教養週報分析助手。
根據以下孩子這週的任務數據，生成一份週報洞察。

孩子資訊：
- 年齡段：${ctx.ageGroup}
- 動機類型：${MOTIVATION_LABELS[ctx.motivationLevel] ?? ctx.motivationLevel}
- 家長教養風格：${BAUMRIND_LABELS[ctx.baumrindType ?? ''] ?? '未知'}

這週任務完成概況：
${catLines}

幣值流動：
- 賺取：${ctx.coinIncome} 幣（共 ${ctx.coinIncomeCount} 次）
- 兌換：${ctx.coinSpend} 幣（共 ${ctx.coinSpendCount} 次）

請回傳 JSON（不含其他文字）：
{
  "motivation_observation": "2-3句對孩子這週表現的觀察，語氣溫暖，提到具體行為",
  "suggestions": [
    {"body": "具體建議（40字內）", "actionLabel": "按鈕文字（5字內）", "action": "adjust_reminder"},
    {"body": "具體建議（40字內）", "actionLabel": "按鈕文字（5字內）", "action": "increase_difficulty"},
    {"body": "具體建議（40字內）", "actionLabel": "按鈕文字（5字內）", "action": "add_contribution"}
  ],
  "affirmations": [
    "適合家長傳給孩子的短句讚美1（20字內）",
    "適合家長傳給孩子的短句讚美2（20字內）",
    "適合家長傳給孩子的短句讚美3（20字內）"
  ],
  "task_recommendations": [
    {"category": "B", "suggestion": "針對家庭本分任務的調整建議（40字內）"}
  ]
}
action 只能是 "adjust_reminder", "increase_difficulty", "add_contribution" 之一。
所有文字請用繁體中文。`;

  const raw = await callGemini(prompt);
  const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as GeminiInsightResult;
}

function getIsoWeekStart(date: Date): string {
  // Get Monday of the ISO week containing `date`
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // days to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

async function processChild(
  supabase: ReturnType<typeof createClient>,
  childId: string,
  familyId: string,
  weekStart: string,
): Promise<void> {
  const weekStartDate = new Date(weekStart + 'T00:00:00Z');
  const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekStartISO = weekStartDate.toISOString();
  const weekEndISO = weekEndDate.toISOString();

  // Fetch child profile + parent baumrind type
  const [profileRes, parentRes, ctRes, completionsRes, walletRes] = await Promise.all([
    supabase.from('child_profiles').select('motivation_level').eq('child_id', childId).single(),
    supabase.from('parents').select('baumrind_type').eq('family_id', familyId).limit(1).single(),
    supabase.from('child_tasks').select('task_id').eq('child_id', childId).eq('is_active', true),
    supabase
      .from('task_completions')
      .select('task_id, coin_earned')
      .eq('child_id', childId)
      .gte('completed_at', weekStartISO)
      .lt('completed_at', weekEndISO),
    supabase.from('wallets').select('id').eq('child_id', childId).eq('wallet_type', 'spending').single(),
  ]);

  const taskIds = (ctRes.data ?? []).map(r => r.task_id);
  const completions = completionsRes.data ?? [];
  const walletId = walletRes.data?.id ?? null;

  const [tasksRes, txRes, childRes, existingReportRes] = await Promise.all([
    taskIds.length > 0
      ? supabase.from('tasks').select('id, category').in('id', taskIds).eq('is_active', true)
      : Promise.resolve({ data: [] as { id: string; category: string }[], error: null }),
    walletId
      ? supabase
          .from('transactions')
          .select('amount, type')
          .eq('wallet_id', walletId)
          .in('type', ['earn', 'redeem'])
          .gte('created_at', weekStartISO)
          .lt('created_at', weekEndISO)
      : Promise.resolve({ data: [] as { amount: number; type: string }[], error: null }),
    supabase.from('children').select('age_group').eq('id', childId).single(),
    supabase
      .from('weekly_reports')
      .select('task_adjustments')
      .eq('family_id', familyId)
      .eq('child_id', childId)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ]);

  // Build task counts per category
  const taskCounts: Record<TaskCategory, { done: number; total: number }> = {
    A: { done: 0, total: 0 },
    B: { done: 0, total: 0 },
    C: { done: 0, total: 0 },
    D: { done: 0, total: 0 },
  };
  const completedIds = new Set(completions.map(c => c.task_id));
  for (const t of tasksRes.data ?? []) {
    const cat = t.category as TaskCategory;
    taskCounts[cat].total += 1;
    if (completedIds.has(t.id)) taskCounts[cat].done += 1;
  }

  // Build coin flow
  const txData = txRes.data ?? [];
  const earnTxs = txData.filter(t => t.type === 'earn');
  const redeemTxs = txData.filter(t => t.type === 'redeem');

  const ctx: WeeklyContext = {
    childId,
    familyId,
    ageGroup: childRes.data?.age_group ?? '6-9',
    motivationLevel: profileRes.data?.motivation_level ?? 'external',
    baumrindType: parentRes.data?.baumrind_type ?? null,
    weekStart,
    taskCounts,
    coinIncome: earnTxs.reduce((s, t) => s + t.amount, 0),
    coinIncomeCount: earnTxs.length,
    coinSpend: Math.abs(redeemTxs.reduce((s, t) => s + t.amount, 0)),
    coinSpendCount: redeemTxs.length,
  };

  const insight = await generateInsight(ctx);

  // Preserve abandonment_tier (and any other fields) written by detect-abandonment
  const existingAdjustments =
    (existingReportRes.data?.task_adjustments as Record<string, unknown> | null) ?? {};

  // Upsert weekly_reports
  await supabase.from('weekly_reports').upsert(
    {
      family_id: familyId,
      child_id: childId,
      week_start: weekStart,
      motivation_observation: insight.motivation_observation,
      ai_suggestions: {
        suggestions: insight.suggestions,
        affirmations: insight.affirmations,
      },
      task_adjustments: {
        ...existingAdjustments,
        recommendations: insight.task_recommendations,
      },
    },
    { onConflict: 'family_id,child_id,week_start' },
  );

  console.log(`[generate-weekly-report] processed child ${childId} week ${weekStart}`);
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

    // Determine which week to generate for (default: last completed ISO week)
    const now = new Date();
    const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const defaultWeekStart = getIsoWeekStart(lastWeekDate);

    // HTTP mode: single child on-demand
    let targetChildId: string | null = null;
    let weekStart = defaultWeekStart;
    if (req.method === 'POST') {
      try {
        const body = await req.json() as { childId?: string; weekStart?: string };
        targetChildId = body.childId ?? null;
        if (body.weekStart) weekStart = body.weekStart;
      } catch { /* no body = cron mode */ }
    }

    if (targetChildId) {
      // On-demand: generate for specific child
      const { data: child } = await supabase
        .from('children')
        .select('id, family_id')
        .eq('id', targetChildId)
        .single();
      if (!child) throw new Error('Child not found');

      await processChild(supabase, child.id, child.family_id, weekStart);
      return new Response(
        JSON.stringify({ ok: true, childId: targetChildId, weekStart }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Cron mode: process all active children
    const { data: children } = await supabase
      .from('children')
      .select('id, family_id');

    const results = await Promise.allSettled(
      (children ?? []).map(c => processChild(supabase, c.id, c.family_id, defaultWeekStart)),
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[generate-weekly-report] cron done: ${results.length} children, ${failed} failed`);

    return new Response(
      JSON.stringify({ ok: true, total: results.length, failed, weekStart: defaultWeekStart }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[generate-weekly-report] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
