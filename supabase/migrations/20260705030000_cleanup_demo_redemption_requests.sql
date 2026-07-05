-- AUDIT 5-9 #4 / SPEC_P1-1: remove the 6 hand-seeded demo rows in
-- `redemption_requests`. These predate any real write path (the only insert
-- site was commented out in WishScreen.tsx) and were inserted directly for
-- demo purposes. Two are marked 'approved' with no matching `transactions`
-- row, because approval never actually deducted a wallet until this
-- migration's sibling (20260705020000) added `review_redemption_request`.
-- Left in place, they would sit in the "review history" screen next to real
-- approvals and misrepresent money that was never actually charged.
--
-- Deletes by explicit id (not a blanket status/date filter) so this can never
-- catch a legitimate row, past or future.
DELETE FROM redemption_requests
WHERE id IN (
  'f59faa0e-96e0-479e-89d2-f55e8a3ce15f', -- approved, 買一本漫畫書 — no backing transaction
  '1bbb605a-8509-49e1-88b2-a26cec91eb53', -- approved, 週末多玩一小時遊戲 — no backing transaction
  'c1e725c3-7eef-4913-83be-13297ecd2d28', -- rejected, 買新款玩具遙控車
  '1af21576-4a14-4624-af68-c70d8e4817b3', -- rejected, 去主題樂園
  'bd59bdba-20a4-4f89-b7c9-9250f63036ce', -- pending, 換 30 分鐘額外遊戲時間
  'f3c176c0-586f-402d-b449-30ba3934d04f'  -- pending, 想要一組新色筆
);
