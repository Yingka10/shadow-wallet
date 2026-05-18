import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChildOption = {
  id: string;
  nickname: string;
};

type SelectedChildContextType = {
  childId: string;
  childName: string;
  allChildren: ChildOption[];
  setSelectedChild: (child: ChildOption) => void;
  reloadChildren: () => Promise<void>;
  loadingChildren: boolean;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SelectedChildContext = createContext<SelectedChildContextType | null>(null);

export function SelectedChildProvider({ children }: { children: ReactNode }) {
  const [allChildren, setAllChildren] = useState<ChildOption[]>([]);
  const [selected, setSelected] = useState<ChildOption | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);

  const fetchChildren = useCallback(async () => {
    setLoadingChildren(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingChildren(false); return; }

      const { data: parent } = await supabase
        .from('parents')
        .select('family_id')
        .eq('user_id', user.id)
        .single();

      if (!parent) { setLoadingChildren(false); return; }

      const { data: kids } = await supabase
        .from('children')
        .select('id, nickname')
        .eq('family_id', parent.family_id)
        .order('created_at', { ascending: true });

      const list = (kids ?? []) as ChildOption[];
      setAllChildren(list);
      setSelected(prev => {
        if (prev && list.some(k => k.id === prev.id)) return prev;
        return list[0] ?? null;
      });
    } catch (err) {
      console.error('[SelectedChildContext] fetchChildren error:', err);
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') void fetchChildren();
      if (event === 'SIGNED_OUT') {
        setAllChildren([]);
        setSelected(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchChildren]);

  return (
    <SelectedChildContext.Provider value={{
      childId: selected?.id ?? '',
      childName: selected?.nickname ?? '',
      allChildren,
      setSelectedChild: setSelected,
      reloadChildren: fetchChildren,
      loadingChildren,
    }}>
      {children}
    </SelectedChildContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSelectedChild(): SelectedChildContextType {
  const ctx = useContext(SelectedChildContext);
  if (!ctx) throw new Error('useSelectedChild must be used within SelectedChildProvider');
  return ctx;
}
