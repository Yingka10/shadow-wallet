import {
  REVIEW_HERO_ART_WIDTH,
  REVIEW_HERO_ART_WIDTH_COMPACT,
  REVIEW_HERO_ASPECT,
  REVIEW_HERO_ASSET,
  REVIEW_HERO_COMPACT_BREAKPOINT,
} from '../reviewHeroAsset';

// Review Hero 的插圖是一個交付契約，不是一般的常數檔。
// 這幾條鎖的是「換圖的人不會不小心踩線」。
describe('review hero asset', () => {
  it('資產真的存在，而且 bundler 解得出來', () => {
    expect(REVIEW_HERO_ASSET).toBeTruthy();
  });

  it('插槽是單一常數 —— 不是依 goal／task 查表，也不是一組候選圖', () => {
    // 依內容挑圖（讀書給書、運動給球）會讓 Review Hero 變成 task illustration。
    // 它代表的是「一起回顧」這件事本身，跟這一段回顧的主題無關。
    expect(typeof REVIEW_HERO_ASSET).not.toBe('function');
    expect(Array.isArray(REVIEW_HERO_ASSET)).toBe(false);
  });

  it('顯示寬度維持在設計指定的 94–106px', () => {
    expect(REVIEW_HERO_ART_WIDTH).toBeGreaterThanOrEqual(94);
    expect(REVIEW_HERO_ART_WIDTH).toBeLessThanOrEqual(106);
  });

  it('窄螢幕降到 84–92，不會縮回原本那顆裝飾小芽的尺寸', () => {
    expect(REVIEW_HERO_ART_WIDTH_COMPACT).toBeGreaterThanOrEqual(84);
    expect(REVIEW_HERO_ART_WIDTH_COMPACT).toBeLessThanOrEqual(92);
    expect(REVIEW_HERO_ART_WIDTH_COMPACT).toBeLessThan(REVIEW_HERO_ART_WIDTH);
  });

  it('不做成大 banner —— 算出來的高度不超過 110px', () => {
    // §4：hero 是提供情境，不是搶主畫面。第一屏還要看得到完整 Step 1。
    const height = Math.round(REVIEW_HERO_ART_WIDTH * REVIEW_HERO_ASPECT);

    expect(height).toBeLessThanOrEqual(110);
  });

  it('素材是接近正方或橫式 —— 直式會被 contain 成比指定寬度更窄', () => {
    expect(REVIEW_HERO_ASPECT).toBeLessThanOrEqual(1.2);
  });

  it('breakpoint 是一個真的手機寬度', () => {
    expect(REVIEW_HERO_COMPACT_BREAKPOINT).toBeGreaterThan(300);
    expect(REVIEW_HERO_COMPACT_BREAKPOINT).toBeLessThan(420);
  });
});
