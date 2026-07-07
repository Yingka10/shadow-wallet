import fs from 'fs';
import path from 'path';

const walletSource = fs.readFileSync(path.join(__dirname, '..', 'WalletScreen.tsx'), 'utf8');

function expectStyleValue(styleName: string, property: string, value: number) {
  const styleMatch = walletSource.match(new RegExp(`${styleName}: \\{([\\s\\S]*?)\\n  \\},`));
  expect(styleMatch?.[1]).toContain(`${property}: ${value}`);
}

describe('WalletScreen growth coin layout', () => {
  it('uses the reference growth coin copy and sections', () => {
    expect(walletSource).toContain('我的成長幣');
    expect(walletSource).toContain('我有');
    expect(walletSource).toContain('枚成長幣');
    expect(walletSource).toContain('再存 18 枚，就能兌換繪本！');
    expect(walletSource).toContain('可使用');
    expect(walletSource).toContain('已存起來');
    expect(walletSource).toContain('最近的紀錄');
  });

  it('renders the coin jar hero and the reference statistic row', () => {
    expect(walletSource).toContain('CoinJarIllustration');
    expect(walletSource).toContain('今天 +8 枚');
    expect(walletSource).toContain('本週 +56 枚');
  });

  it('uses the saving card as the deposit entry instead of repeating the balance in the header', () => {
    expect(walletSource).toContain('＋ 存一些');
    expect(walletSource).toContain('把一些成長幣放進耐心罐');
    expect(walletSource).toContain('放 7 天後');
    expect(walletSource).toContain('放進耐心罐，慢慢長大');
    expect(walletSource).toContain('styles.savingLockWrap');
    expect(walletSource).not.toContain('{savingMetaCopy}');
    expect(walletSource).not.toContain('開始存幣 〉');
    expect(walletSource).not.toContain('balancePillText');
    expect(walletSource).not.toContain('每週 +{savingInterestRate}%');
  });

  it('uses fixed screen-relative heights so wallet cards do not jump around', () => {
    expect(walletSource).toContain('useWindowDimensions');
    expect(walletSource).toContain('const heroHeight = clamp(Math.round(height * 0.2), 132, 188);');
    expect(walletSource).toContain('const miniHeight = clamp(Math.round(height * 0.15), 100, 150);');
    expect(walletSource).toContain('const statHeight = clamp(Math.round(height * 0.1), 66, 100);');
    expect(walletSource).toContain('numberOfLines={1}');
    expect(walletSource).toContain('adjustsFontSizeToFit');
    expect(walletSource).toContain('minimumFontScale={0.6}');
  });

  it('keeps the top growth coin cards scaled close to the reference mockup', () => {
    expectStyleValue('heroCard', 'borderRadius', 24);
    expectStyleValue('miniCard', 'borderRadius', 20);
    expectStyleValue('statCard', 'marginBottom', 20);
    expectStyleValue('statText', 'fontSize', 20);
  });
});
