// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageContext, PageSelection, pageContextOf } from './pageContext';

type Store = { selection?: PageSelection; setSelection: (s: PageSelection | undefined) => void };

const SelectionContext = createContext<Store | null>(null);

/** Holds what the current platform page has open or selected (one object at a time). */
export function PageSelectionProvider({ children }: { children: ReactNode }) {
    const [selection, setSelection] = useState<PageSelection>();
    const value = useMemo(() => ({ selection, setSelection }), [selection]);
    return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/**
 * Called by a platform page with the object it has open or selected (undefined: none). The selection ends when the
 * page unmounts. Without the agent (no provider) it does nothing, so pages need no agent check.
 */
export function usePublishPageSelection(selection: PageSelection | undefined) {
    const setSelection = useContext(SelectionContext)?.setSelection;
    const kind = selection?.kind;
    const id = selection?.id;
    const name = selection?.name;
    useEffect(() => {
        if (!setSelection) return;
        setSelection(kind !== undefined && id !== undefined ? { kind, id, name } : undefined);
        return () => setSelection(undefined);
    }, [setSelection, kind, id, name]);
}

/** Page context of the current route and selection (undefined on pages without one, such as /ai-agent). */
export function useCurrentPageContext(): PageContext | undefined {
    const { pathname } = useLocation();
    const selection = useContext(SelectionContext)?.selection;
    return useMemo(() => pageContextOf(pathname, selection), [pathname, selection]);
}
