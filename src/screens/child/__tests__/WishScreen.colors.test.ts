import fs from 'fs';
import path from 'path';

import { Colors } from '../../../constants/colors';

const wishSource = fs.readFileSync(path.join(__dirname, '..', 'WishScreen.tsx'), 'utf8');

function styleBlock(styleName: string) {
  const match = wishSource.match(new RegExp(`${styleName}: \\{([\\s\\S]*?)\\n  \\},`));
  expect(match).toBeTruthy();
  return match?.[1] ?? '';
}

describe('WishScreen action color roles', () => {
  it('defines the wish tree semantic action colors', () => {
    expect(Colors.wishPrimary).toBe('#5E8B49');
    expect(Colors.wishPrimaryPressed).toBe('#4D763B');
    expect(Colors.redeemButton).toBe('#E5F0D8');
    expect(Colors.redeemButtonText).toBe('#52753C');
    expect(Colors.redeemButtonBorder).toBe('#B8D39B');
    expect(Colors.redeemButtonPressed).toBe('#CFE3B8');
    expect(Colors.redeemButtonPressedText).toBe('#42632F');
    expect(Colors.progressGreen).toBe('#85B95D');
    expect(Colors.tabGreen).toBe('#DDECCF');
    expect(Colors.coinGold).toBe('#E6B94E');
    expect(Colors.creamWish).toBe('#FFFDF8');
    expect(Colors.textBrown).toBe('#4A4136');
  });

  it('uses green for wish CTAs and soft green for redeem actions', () => {
    expect(styleBlock('wishBtn')).toContain('backgroundColor: Colors.wishPrimary');
    expect(styleBlock('wishBtnPressed')).toContain('backgroundColor: Colors.wishPrimaryPressed');
    expect(styleBlock('emptyBtn')).toContain('backgroundColor: Colors.wishPrimary');
    expect(styleBlock('emptyBtnPressed')).toContain('backgroundColor: Colors.wishPrimaryPressed');

    expect(styleBlock('btnRedeem')).toContain('backgroundColor: Colors.redeemButton');
    expect(styleBlock('btnRedeem')).toContain('borderColor: Colors.redeemButtonBorder');
    expect(styleBlock('btnRedeemPressed')).toContain('backgroundColor: Colors.redeemButtonPressed');
    expect(styleBlock('btnRedeemText')).toContain('color: Colors.redeemButtonText');
    expect(styleBlock('btnRedeemTextPressed')).toContain('color: Colors.redeemButtonPressedText');
  });

  it('keeps gift tabs and progress aligned to the tree palette', () => {
    expect(styleBlock('segTabActive')).toContain('backgroundColor: Colors.tabGreen');
    expect(wishSource).toContain('from={Colors.progressGreen}');
    expect(wishSource).toContain('to={Colors.leaf600}');
  });
});
