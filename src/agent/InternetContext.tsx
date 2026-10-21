// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { createContext, useContext, type ReactNode } from 'react';

import { useInternet, type InternetBlocked, type InternetHandle } from './internet';

const InternetContext = createContext<InternetHandle | undefined>(undefined);

/**
 * Holds the internet state of ONE chat for header, panel and transcript. `useInternet` opens a stream, so it is called
 * here exactly once per chat; everything below reads the handle with `useInternetContext`.
 */
export function InternetProvider({
    chatId,
    initialBlocked,
    enabled = true,
    children,
}: {
    chatId: string | undefined;
    initialBlocked?: InternetBlocked;
    /** False for a read-only view (trash): no stream. */
    enabled?: boolean;
    children: ReactNode;
}) {
    const handle = useInternet(chatId, initialBlocked, enabled);
    return <InternetContext.Provider value={handle}>{children}</InternetContext.Provider>;
}

/** The handle of the surrounding chat; undefined outside an `InternetProvider`, so callers stay defensive. */
export function useInternetContext(): InternetHandle | undefined {
    return useContext(InternetContext);
}
