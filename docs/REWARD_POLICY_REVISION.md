# 回饋政策修訂｜家庭參與與成長幣

> 第九階段 A。**這是產品政策的修訂紀錄，不是上線核可。**
>
> 修訂的是「理念上允不允許」。系統目前**仍然建立不出**一筆
> 家庭參與 ＋ 成長幣的任務 —— 缺的東西列在第五、六節。

---

## 一、為什麼改

舊規則是一句硬規定：

> 家庭參與（B）＋ 成長幣（coin_eligible）＝ 非法，一律擋下。

它擋住的不是壞決定。它擋住的是那些**家裡本來就是這樣過的**家庭 ——
零用錢、有償家事、「洗一次碗五塊錢」。對他們來說，那條紅字的意思是
「這個 App 不接受我們家」。

而另一種情況更常見：孩子在某件事的起步階段就是需要一點外在動力。
教養研究對外在獎勵的疑慮是**長期取代內在動機**，不是「任何時候都不能用」。
把一個階段性的工具寫成永久禁令，是把一個教養主張寫成了技術限制。

**所以修訂的是規則的形狀，不是立場。** GrowBook 仍然認為家庭參與
不該預設標價 —— 那是對孩子的承諾，不是設定。改變的是：
當家長明確知道自己在做什麼的時候，系統不再替他決定。

---

## 二、三種語意

| 意圖 | 意思 | 要求回顧時間 | 提醒可以降低 |
|---|---|---|---|
| `default` | 不用成長幣，以貢獻紀錄與週報被看見 | — | — |
| `temporary_startup_support` | 孩子現在需要外在回饋協助開始或建立節奏 | **是** | **是** |
| `family_defined_agreement` | 這個家庭本來就有零用錢／有償工作制度 | 否 | **否** |

三個欄位的差別看起來瑣碎，但它決定了半年後系統會對這筆任務說什麼。

一筆「家庭參與 ＋ 成長幣」的任務，回頭看有兩種完全不同的讀法：
「當時孩子需要一點動力，我們說好三週後再看」，
或「我們家的家事本來就有零用錢」。
**前者該被提醒回顧，後者不該。**

對一個既有的家庭制度跳出「要不要考慮降低外在獎勵」，
是在指導一個家庭怎麼過日子 —— 那不是 GrowBook 的位置。
沒有這個欄位的話，兩者在資料上長得一模一樣，系統只能猜。

⚠️ `suggestsStepDown` 是**提醒**，不是強制退場。
家長看完提醒後維持原樣是完全正常的結果。

---

## 三、修訂後的規則

新的分工：

- `purposeCategory` 說明這件事**對家庭的意義**
- `rewardPolicy` 說明**目前使用的支持方式**
- 兩者不再完全綁死

家庭參與的四種回饋方式：

| 回饋方式 | 狀態 |
|---|---|
| `family_contribution` | **recommended** —— 預設做法 |
| `progress_only` | available |
| `record_only` | available |
| `coin_eligible` | **available_with_confirmation**，且必須說明是哪一種支持意圖 |

**A 類（生活常規）沒有跟著放寬。** 理由不同：家庭參與是「這個家怎麼分工」，
那是家庭的事；生活自理是「照顧自己」，把它標價會讓孩子學到
照顧自己是有償的。這一輪只改了家庭參與。

---

## 四、哪些仍然是 deterministic policy

修訂**不等於**把判斷交給 AI 或家長自由心證。以下仍然由程式決定，不可協商：

| 規則 | 仍然 blocking | 理由 |
|---|---|---|
| AI 不得選擇支持意圖 | 是 | 那是家長對自己家的判斷 |
| AI 不得把家庭參與改成成長幣 | 是 | `rewardPolicy` 在 AI 契約的明確禁止清單裡 |
| AI 不得產生任何 coin amount | 是 | `coinAmount` 同上 |
| 家庭角色固定 `family_contribution` | 是 | 一個「有償的家庭角色」在語意上是雇傭，不是角色 |
| 短期支援固定 `progress_only` | 是 | 短期練習不作為賺幣來源 |
| 時間儲蓄 | 是 | 建立與兌換鏈路都還沒打通 |
| 沒有合法幣值就不可建立 | 是 | 見下一節 |

---

## 五、目前的技術缺口（**上線阻擋**）

### 5.1 沒有 B 類幣值政策

`coin-policy.json` 的 `agePolicies` 四個年齡段都**只定義 C 與 D**。
`CoinCategory` 這個型別本身就是 `'C' | 'D'`。

所以家庭參與現在算不出任何合法金額。

**這一輪沒有自己發明數字。** 借 C 或 D 的規則來代算是最糟的做法 ——
那會產生一個沒有人知道依據的金額，然後寫進孩子的錢包。
半年後家長問「為什麼是 12 幣」，答案會是「因為我們拿了自主挑戰的表」。

> **需要拍板：** B 類的時間分級與 baseCoins。
> 這是產品決策，不是工程可以自己填的。

### 5.2 完成端會給 0 幣

比 5.1 更嚴重，而且更安靜。

`fn_complete_task` 第 50 行：

```sql
IF v_task.category IN ('A', 'B') THEN
  v_coin_earned := 0;
```

**它看的是 `category`，不是 `reward_policy`。**

也就是說：就算建立端放行了一筆 B ＋ coin_eligible 的任務，
孩子完成後仍然拿到 **0 幣**。家長看到「完成後給予成長幣」，
孩子拿到 0 —— 兩邊都會覺得系統壞了，而且沒有任何錯誤訊息。

同一支函式的第 107 行還會為 B 類寫 `time_savings`，
那與 2026-07 分類修訂（DELTA §2「B 類不該再有時間儲蓄」）本來就已經衝突。

> **結論：B 類發幣是一條需要同時修改建立端與完成端的鏈路。**
> 只放寬建立端會製造一個比原本更糟的狀態。

---

## 六、目前仍硬性阻擋 B ＋ coin 的地方

完整盤點見 `CUSTOM_TASK_DOMAIN_CONTRACT.md` 第三節。摘要：

| 層 | 位置 | 分類 |
|---|---|---|
| catalog | `familyParticipation.ts` 的 `allowedRewardPolicies` | C 舊假設 |
| 草稿驗證 | `validators.ts` `validateFamilyParticipationReward` | A 應改為確認 |
| 規則檢查 | `ruleFindings.ts` `FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE` | A 應改為確認 |
| 回饋決策 | `evaluateTaskReward.ts` `COIN_CATEGORY_BY_PURPOSE` | D 缺政策 |
| 幣值政策 | `coinPolicy.ts` 的 `CoinCategory` 型別 | D 缺政策 |
| RPC | `create_parent_task_v1` guard A | **A，而且比其他層更嚴** |
| 完成端 | `fn_complete_task` | D，且會安靜給 0 |

RPC guard A 值得單獨說明：

```sql
IF v_category = 'B' AND v_reward <> 'family_contribution' THEN
  ... POLICY_REJECTED '家庭參與只能以家庭貢獻回饋'
```

它擋的**不只是成長幣** —— 連 `record_only` 與 `progress_only` 都會被拒。
所以本文第三節那張表裡的「available」兩項，在資料庫層目前也是不通的。
這一輪沒有改它（需要 migration），但它是第九階段 B 的第一個待辦。

---

## 七、這一輪實際做了什麼

**只有 domain 與純函式。**

- `RewardSupportIntent` 型別與三種語意的描述
- `evaluateCustomTaskRewardOptions()` —— 修訂後的選項計算
- `canFinalizeRewardOption()` —— 把「理念允許」與「現在做得到」分開
- 對應測試

**沒有做：** 沒有移除任何既有的 blocking、沒有 migration、
沒有改 catalog、沒有改 RPC、沒有填任何幣值數字。

`evaluateCustomTaskRewardOptions` 對家庭參與的成長幣會回
`available_with_confirmation` ＋ `coinAmountStatus: 'policy_missing'`，
而 `canFinalizeRewardOption` 回 `false`。

也就是說，新舊兩層目前的**結論一致**（都建不出來），
只是理由不同：舊層說「不准」，新層說「可以，但還沒有金額」。
等 B 類幣值政策拍板後，只有新層會改變答案。


---

## 八、第九階段 B：規則已落到資料庫

第五節的兩個技術缺口，處置如下。

### 5.2「完成端會給 0 幣」已修正

`complete_task` 不再讓 category 覆蓋 reward_policy。金額 ≤ 0 時回
`coin_amount_not_configured`，不安靜發 0。舊任務（`reward_policy IS NULL`）
行為一個字沒改。

### 5.1「沒有 B 類幣值政策」仍然是 blocker

**本輪沒有新增任何數字，也沒有借用 C／D 的表。**
RPC 的拒絕理由是 `B_COIN_POLICY_NOT_CONFIGURED` —— 是「尚未設定」，
不是「永遠禁止」。

### 第六節那張表的更新

| 層 | 第九階段 A | 現在 |
|---|---|---|
| RPC guard A | B 只能 family_contribution | **已修**：B ＋ record_only／progress_only 可建立 |
| 完成端 | category 覆蓋 reward_policy | **已修**：只看 reward_policy |
| 幣值政策 | 沒有 B 類數字 | **未變，仍是 blocker** |
| catalog / validators / ruleFindings | 硬擋 B ＋ coin | **未變**（分類 A／C，等 B coin policy 落地後一起改） |

App 端的 `validateFamilyParticipationReward` 與
`FAMILY_PARTICIPATION_NOT_COIN_ELIGIBLE` 仍然擋 B ＋ coin。
那與 RPC 的結論一致（都建不出來），只是訊息還停在舊說法。
**B 類幣值政策拍板時要一起改**，否則會出現「資料庫允許但 App 說不行」。

### 一項更正

第九階段 A 的報告把 RPC 的「guard A」讀成「A 類的 guard」。
它的**列表編號是 A，內容講的是 category B**。
盤點後確認：RPC 裡沒有任何 A 類專屬 guard。
