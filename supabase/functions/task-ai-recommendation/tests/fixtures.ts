// 測試共用的 fixture 讀取與樣板。
//
// fixture 檔案與 App 端測試讀的是**同一份**（見 contractParity.test.ts）。
// 那份檔案是雙端契約的載體，不是這一側的測試資料。

import fixturesJson from '../__fixtures__/contractFixtures.json' with { type: 'json' };
import type { AgeGroup, ValidatedInput } from '../contract.ts';

export type FixtureTask = { id: string; demoTaskName: string; input: ValidatedInput };

export type FixtureExpect = {
  status: string;
  suggestionCount?: number;
  appReason?: string;
  serverReason?: string;
  /** 只有 serverOnlySafety 的案例會有：server 端的結論與 App 不同。 */
  serverStatus?: string;
};

export type FixtureCase = {
  id: string;
  taskId: string;
  kind: string;
  note?: string;
  serverOnlySafety?: boolean;
  inputOverride?: Record<string, unknown>;
  modelOutput: unknown;
  expect: FixtureExpect;
};

export type FixtureEdgeCase = {
  id: string;
  ageGroup: AgeGroup;
  note?: string;
  serverOnlySafety?: boolean;
  modelOutput: unknown;
  expect: FixtureExpect;
};

type FixtureFile = {
  tasks: FixtureTask[];
  cases: FixtureCase[];
  edgeCases: FixtureEdgeCase[];
};

const FIXTURES = fixturesJson as unknown as FixtureFile;

export const TASKS: readonly FixtureTask[] = FIXTURES.tasks;
export const CASES: readonly FixtureCase[] = FIXTURES.cases;
export const EDGE_CASES: readonly FixtureEdgeCase[] = FIXTURES.edgeCases;

export function taskById(id: string): FixtureTask {
  const found = TASKS.find((t) => t.id === id);
  if (!found) throw new Error(`fixture 沒有這個任務：${id}`);
  return found;
}

/** server 端預期的 status（沒標 serverStatus 就與 App 相同）。 */
export function serverStatusOf(expect: FixtureExpect): string {
  return expect.serverStatus ?? expect.status;
}

/** 一份合法的 input，測試需要改哪裡就改哪裡。 */
export function validInput(): ValidatedInput {
  return structuredClone(taskById('after-meal-tidy').input);
}
