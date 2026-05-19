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
 * 透過 ai-proxy Edge Function 取得自訂目標的幣值建議。
 * Gemini 1.5 Flash 在 Edge Function 端執行，API key 不暴露於 client。
 */
export async function suggestCoinWithAI(
  rewardName: string
): Promise<{ coins: number; weeks: number; reason: string }> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    body: { type: 'suggestCoinWithAI', payload: { rewardName } },
  });
  if (error) throw new Error(`suggestCoinWithAI 失敗：${error.message}`);
  return data as { coins: number; weeks: number; reason: string };
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
