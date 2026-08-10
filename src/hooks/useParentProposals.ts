import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SupabaseChildProposalService,
  type ChildProposal,
} from '../lib/childProposal';

export type ParentProposalReader = Pick<
  SupabaseChildProposalService,
  'listProposedForParent'
>;

const defaultReader = new SupabaseChildProposalService();

export function useParentProposals(
  childId: string | null,
  familyId: string | null,
  reader: ParentProposalReader = defaultReader,
) {
  const [proposals, setProposals] = useState<ChildProposal[]>([]);
  const [loading, setLoading] = useState(Boolean(childId && familyId));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;

    if (!childId || !familyId) {
      setProposals([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await reader.listProposedForParent({ childId, familyId, limit: 3 });
      if (requestId.current !== currentRequest) return;
      setProposals(next);
    } catch (caught) {
      if (requestId.current !== currentRequest) return;
      setProposals([]);
      setError(caught instanceof Error ? caught.message : '讀取孩子的新想法失敗');
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [childId, familyId, reader]);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  return { proposals, loading, error, refresh };
}
