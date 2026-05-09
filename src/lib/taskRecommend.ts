import { supabase } from './supabase';
import type { AgeGroup, CustomTask, SystemTaskTemplate } from '../types/database';

/**
 * 從 system_task_templates 撈指定年齡段的 Task-B + Task-C
 */
export async function fetchTemplates(ageGroup: AgeGroup): Promise<SystemTaskTemplate[]> {
  const { data, error } = await supabase
    .from('system_task_templates')
    .select('*')
    .eq('age_group', ageGroup)
    .in('category', ['B', 'C'])
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`載入任務模板失敗：${error.message}`);
  return data ?? [];
}

/**
 * 從模板清單取前 3 個 Task-B、前 2 個 Task-C 作為推薦；
 * showAlt=true 時取剩餘的模板作為第二批建議。
 */
export function recommendTasks(
  templates: SystemTaskTemplate[],
  showAlt = false
): { taskB: SystemTaskTemplate[]; taskC: SystemTaskTemplate[] } {
  const allB = templates.filter(t => t.category === 'B');
  const allC = templates.filter(t => t.category === 'C');
  if (showAlt) {
    return { taskB: allB.slice(3), taskC: allC.slice(2) };
  }
  return { taskB: allB.slice(0, 3), taskC: allC.slice(0, 2) };
}

/**
 * 計算選取的 Task-C 模板總潛在幣值
 * coin = Math.round(base_time_min * difficulty)
 */
export function calcTotalCoin(selectedC: SystemTaskTemplate[]): number {
  return selectedC.reduce(
    (sum, t) => sum + Math.round(t.base_time_min * t.difficulty),
    0
  );
}

/**
 * 呼叫 Gemini 1.5 Flash API 取得自訂目標的幣值建議
 */
export async function suggestCoinWithAI(
  rewardName: string
): Promise<{ coins: number; weeks: number; reason: string }> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) throw new Error('未設定 EXPO_PUBLIC_GEMINI_API_KEY');

  const prompt = `你是一個家庭教養 App 的幣值顧問。
這個 App 使用「幣」作為虛擬貨幣。孩子（6-9歲）每週透過完成家務賺取約 120-150 幣。
家長想設定一個兌換目標：「${rewardName}」
請根據這個獎品的相對吸引力，建議一個合適的幣值（60-200 幣之間）。
回應 JSON（不含其他文字）：{ "coins": number, "weeks": number, "reason": string }`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API 錯誤：${res.status}`);
  const json = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const cleanText = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleanText) as { coins: number; weeks: number; reason: string };
}

/**
 * 原子寫入：複製模板任務 + 自訂任務 + 指派給孩子 + 寫入兌換目標
 * 全部在同一個 PostgreSQL transaction 中執行
 */
export async function confirmSetup(params: {
  familyId: string;
  childId: string;
  templateIds: string[];
  customTasks: CustomTask[];
  rewardName: string;
  coinCost: number;
}): Promise<void> {
  const { error } = await supabase.rpc('setup_child_tasks', {
    p_family_id: params.familyId,
    p_child_id: params.childId,
    p_template_ids: params.templateIds,
    p_custom_tasks: params.customTasks,
    p_reward_name: params.rewardName,
    p_coin_cost: params.coinCost,
  });
  if (error) throw new Error(`設定失敗：${error.message}`);
}
