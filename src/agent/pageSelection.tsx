// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { PageContext, PageSelection, pageContextOf } from './pageContext';

type Store = { selection: readonly PageSelection[]; setSelection: (s: readonly PageSelection[]) => void };

const SelectionContext = createContext<Store | null>(null);

const NONE: readonly PageSelection[] = [];

/** Holds what the current platform page has open or selected (several objects on the datasets page). */
export function PageSelectionProvider({ children }: { children: ReactNode }) {
    const [selection, setSelection] = useState<readonly PageSelection[]>(NONE);
    const value = useMemo(() => ({ selection, setSelection }), [selection]);
    return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/**
 * Called by a platform page with the object it has open or the objects selected there (undefined or empty: none).
 * The selection ends when the page unmounts. Without the agent (no provider) it does nothing, so pages need no agent
 * check. The page may pass a new array on every render: the selection only changes when its content does.
 */
export function usePublishPageSelection(selection: PageSelection | readonly PageSelection[] | undefined) {
    const setSelection = useContext(SelectionContext)?.setSelection;
    const list = (Array.isArray(selection) ? selection : selection ? [selection] : NONE) as readonly PageSelection[];
    const key = JSON.stringify(list.map(({ kind, id, name }) => [kind, id, name]));
    useEffect(() => {
        if (!setSelection) return;
        const items = JSON.parse(key) as [PageSelection['kind'], PageSelection['id'], string | undefined][];
        setSelection(items.length ? items.map(([kind, id, name]) => ({ kind, id, name: name ?? undefined })) : NONE);
        return () => setSelection(NONE);
    }, [setSelection, key]);
}

/** Page context of the current route and selection (undefined on pages without one, such as /ai-agent). */
export function useCurrentPageContext(): PageContext | undefined {
    const { pathname } = useLocation();
    const selection = useContext(SelectionContext)?.selection;
    return useMemo(() => pageContextOf(pathname, selection), [pathname, selection]);
}
