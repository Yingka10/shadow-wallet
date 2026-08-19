import type { ImageSourcePropType } from 'react-native';

// Shadow Wallet — CHILD-REVIEW-V2：Review Hero 的專屬插圖
//
// 這支檔案是 Review Hero 插圖的唯一來源。元件不自己 require 圖檔 ——
// 換圖、改尺寸都只動這裡，TogetherReviewSheet 一個字都不用碰。
//
// ⚠️ 一張，而且只有一張。
// ⚠️ 不准沿用 Today 的 journey mascot —— Review 是回頭看，不是今天的旅程。
// ⚠️ 不准依任務內容挑圖（讀書就給書、運動就給球）。素材裡雖然有筆記本，
//    但它代表的是「停下來整理自己的想法」這件事，跟這一段回顧的主題無關。
//    任何 goal / task-keyed 的查表都是錯的。
// ⚠️ 不加圓形外框、不加底色圓、不加白卡 —— 去背圖直接站在 hero 上。

/**
 * 小芽＋筆記本＋鉛筆的去背 PNG（1289×1220）。
 *
 * 構圖接近正方形。渲染是固定寬高的 contain box，換成直式圖會被 letterbox
 * 成比 REVIEW_HERO_ART_WIDTH 更窄，就吃不到指定的視覺寬度。
 */
export const REVIEW_HERO_ASSET: ImageSourcePropType =
  require('../../../assets/images/child/review.png');

/**
 * 素材原始長寬比（1220 / 1289）。
 *
 * 高度用這個乘出**字面數字**，不交給 aspectRatio —— RN 對
 * 「aspectRatio ＋ resizeMode contain」在 sheet 這種容器裡不可靠，
 * LT-FINAL 那次 Image onLoad 成功卻不畫像素就是這樣來的。
 */
export const REVIEW_HERO_ASPECT = 1220 / 1289;

/**
 * 顯示寬度。CHILD-REVIEW-V2-COMPACT-VIEWPORT 從 100px 收緊到 82–88px，
 * 換到 Step 1 + Step 2 要用的直向空間——插圖還在，只是不再是版面裡最高
 * 的一塊。
 */
export const REVIEW_HERO_ART_WIDTH = 84;

/**
 * 窄螢幕的寬度。降是為了不擠掉 evidence，但**不會**縮回原本那顆
 * 30–40px 的裝飾小芽 —— 那樣 hero 就沒有存在感了。跟正常寬度維持同一個
 * 縮小比例。
 */
export const REVIEW_HERO_ART_WIDTH_COMPACT = 74;

/** 低於這個寬度就用 compact 尺寸。 */
export const REVIEW_HERO_COMPACT_BREAKPOINT = 360;
