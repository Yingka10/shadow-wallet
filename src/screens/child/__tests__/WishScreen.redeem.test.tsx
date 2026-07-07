import fs from 'fs';
import path from 'path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockRpc = jest.fn();
const mockRefreshWallet = jest.fn();
const mockNavigate = jest.fn();
const mockFrom = jest.fn();
const mockChannel = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: jest.fn(),
  },
}));

jest.mock('../../../hooks/useWallet', () => ({
  useWallet: () => ({
    spending: { balance: 100 },
    saving: null,
    loading: false,
    refresh: mockRefreshWallet,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { childId: 'child-1' } }),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../../components/BottomNav', () => () => null);
jest.mock('../../../components/child/GradientBackground', () => () => null);
jest.mock('../../../components/WishTreeComponent', () => () => null);
jest.mock('../../../components/child/GrassGroundScene', () => () => null);
jest.mock('../../../components/WishModalComponent', () => () => null);

import { redeemWishItem } from '../redeemWish';
import WishScreen from '../WishScreen';

const wishSource = fs.readFileSync(path.join(__dirname, '..', 'WishScreen.tsx'), 'utf8');

function setupSupabaseRows() {
  const rewardOrder = jest.fn().mockResolvedValue({
    data: [
      {
        id: 'wish-1',
        name: '挑一本繪本帶回家',
        coin_cost: 60,
        added_by: 'parent',
        parent_approved: true,
        created_at: '2026-07-07T00:00:00Z',
        child_id: 'child-1',
        is_active: true,
        reward_type: 'item',
      },
    ],
    error: null,
  });
  const rewardEqActive = jest.fn(() => ({ order: rewardOrder }));
  const rewardEqFamily = jest.fn(() => ({ eq: rewardEqActive }));

  mockFrom.mockImplementation((table: string) => {
    if (table === 'children') {
      return {
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { family_id: 'family-1', nickname: '小孩' },
              error: null,
            }),
          })),
        })),
      };
    }

    if (table === 'reward_items') {
      return {
        select: jest.fn(() => ({ eq: rewardEqFamily })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  mockChannel.mockReturnValue({
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn(),
  });
}

describe('WishScreen redeem flow', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockRefreshWallet.mockReset();
    mockNavigate.mockReset();
    mockFrom.mockReset();
    mockChannel.mockReset();
  });

  it('opens an in-screen confirmation before redeeming', () => {
    expect(wishSource).toContain('setRedeemItem(item)');
    expect(wishSource).toContain('redeem-confirm-modal');
    expect(wishSource).toContain('redeem-confirm-button');
    expect(wishSource).toContain('redeem-button-${item.id}');
    expect(wishSource).toContain('confirmRedeem');
  });

  it('presses confirm from the modal and calls the redeem RPC', async () => {
    setupSupabaseRows();
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    render(<WishScreen />);

    const redeemButton = await screen.findByTestId('redeem-button-wish-1');
    fireEvent.press(redeemButton);
    fireEvent.press(screen.getByTestId('redeem-confirm-button'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('redeem_wish', {
        p_child_id: 'child-1',
        p_item_id: 'wish-1',
        p_cost: 60,
      });
    });
    expect(mockRefreshWallet).toHaveBeenCalled();
  });

  it('shows an inline error in the confirmation modal when redeem fails', async () => {
    setupSupabaseRows();
    mockRpc.mockResolvedValue({ data: { error: 'insufficient_balance' }, error: null });

    render(<WishScreen />);

    fireEvent.press(await screen.findByTestId('redeem-button-wish-1'));
    fireEvent.press(screen.getByTestId('redeem-confirm-button'));

    expect(await screen.findByTestId('redeem-error-message')).toBeTruthy();
    expect(screen.getByText('成長幣不夠兌換這個願望，再存一下吧！')).toBeTruthy();
  });

  it('calls redeem_wish with the selected item so the database deducts coins and marks it redeemed', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });

    const result = await redeemWishItem({ childId: 'child-1', itemId: 'wish-1', cost: 60 });

    expect(result).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledWith('redeem_wish', {
      p_child_id: 'child-1',
      p_item_id: 'wish-1',
      p_cost: 60,
    });
  });

  it('returns backend status errors for duplicate or unaffordable redemptions', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'already_redeemed' }, error: null });

    await expect(redeemWishItem({ childId: 'child-1', itemId: 'wish-1', cost: 60 }))
      .resolves.toEqual({ ok: false, error: 'already_redeemed' });
  });
});
