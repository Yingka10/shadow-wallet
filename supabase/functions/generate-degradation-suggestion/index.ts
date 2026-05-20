/**
 * generate-degradation-suggestion — generates a parent suggestion when a child
 * fails a task repeatedly, using full DB history for richer context.
 *
 * Accepts either:
 *   {taskName, age, days}          — lightweight mode (no DB lookup)
 *   {taskId, childId}              — rich mode (fetches history from DB)
 *
 * Falls back to a template string if Gemini fails.
 */

// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 宣告 Deno 變數以解決 IDE 找不到 Deno 的錯誤
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      taskName?: string;
      age?: number;
      days?: number;
      taskId?: string;
      childId?: string;
    };

    let taskName = body.taskName ?? '';
    let age = body.age ?? 7;
    let consecutiveDays = body.days ?? 3;
    let completionRate = '不明';

    // Rich mode: fetch from DB if taskId + childId provided
    if (body.taskId && body.childId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      const [taskRes, childRes, completionsRes] = await Promise.all([
        supabase.from('tasks').select('name').eq('id', body.taskId).single(),
        supabase.from('children').select('birth_date').eq('id', body.childId).single(),
        supabase
          .from('task_completions')
          .select('completed_at, status')
          .eq('task_id', body.taskId)
          .eq('child_id', body.childId)
          .gte('completed_at', twoWeeksAgo)
          .order('completed_at', { ascending: false }),
      ]);

      if (taskRes.data) taskName = taskRes.data.name;

      if (childRes.data) {
        const birthMs = new Date(childRes.data.birth_date).getTime();
        age = Math.floor((Date.now() - birthMs) / (1000 * 60 * 60 * 24 * 365));
      }

      const completions = completionsRes.data ?? [];
      const completed = completions.filter((c: any) => c.status === 'completed').length;
      completionRate = completions.length > 0
        ? `${Math.round((completed / completions.length) * 100)}%（近14天）`
        : '無記錄';

      // Calculate consecutive misses
      const today = new Date().toDateString();
      let consecutive = 0;
      const d = new Date();
      for (let i = 0; i < 14; i++) {
        const dateStr = d.toISOString().split('T')[0];
        const found = completions.some((c: any) => c.completed_at.startsWith(dateStr) && c.status === 'completed');
        if (found) break;
        consecutive++;
        d.setDate(d.getDate() - 1);
      }
      if (consecutive > 0) consecutiveDays = consecutive;
      void today;
    }

    const fallback = `「${taskName}」連續 ${consecutiveDays} 天未完成，可以試著和孩子討論是否調整難度或時間。`;

    try {
      const prompt = `任務名稱：${taskName}
孩子年齡：${age}歲
連續未完成天數：${consecutiveDays}天
近14天完成率：${completionRate}
請給家長一個簡短的建議（50字以內），說明可以怎麼調整這個任務，語氣要溫和不批判。
只回傳建議文字，不要其他格式。`;

      const text = await callGemini(prompt);
      const suggestion = text.trim() || fallback;

      return new Response(
        JSON.stringify({ suggestion }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch {
      return new Response(
        JSON.stringify({ suggestion: fallback }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  } catch (err) {
    console.error('[generate-degradation-suggestion] error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
