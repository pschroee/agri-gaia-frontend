// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useState } from 'react';

import { useAgentOptional } from './AgentContext';
import { agentApi } from './api';
import { settingErrorText } from './settings';
import type { Setting } from './settings';
import type { Chat } from './types';

export type ChatSettings = {
    /** The setting being switched right now. */
    busy?: Setting;
    /** Last failure, cleared by the next action. */
    error?: string;
    /** The last "Compact now" was accepted (the compaction itself shows live in the transcript). */
    compactStarted: boolean;
    clearError: () => void;
    setInternet: (enabled: boolean) => Promise<void>;
    setAutoCompact: (enabled: boolean) => Promise<void>;
    compactNow: () => Promise<void>;
};

/**
 * Switches settings of a chat at the gateway. The answer (the chat) goes to the shared chat list, so the panel
 * header and the chat header follow at once; the open chat view gets the same state through the SSE event "chat"
 * and, with `onChat`, directly.
 */
export function useChatSettings(chat: Chat | undefined, onChat?: (c: Chat) => void): ChatSettings {
    const updateChat = useAgentOptional()?.updateChat;
    const [busy, setBusy] = useState<Setting>();
    const [error, setError] = useState<string>();
    const [compactStarted, setCompactStarted] = useState(false);
    const id = chat?.id;

    const run = useCallback(
        async (setting: Setting, call: (chatId: string) => Promise<Chat | undefined>) => {
            if (!id) return;
            setBusy(setting);
            setError(undefined);
            setCompactStarted(false);
            try {
                const c = await call(id);
                if (c && c.id === id) {
                    updateChat?.(c);
                    onChat?.(c);
                }
                if (setting === 'compact') setCompactStarted(true);
            } catch (e) {
                setError(settingErrorText(setting, e));
            } finally {
                setBusy(undefined);
            }
        },
        [id, updateChat, onChat],
    );

    return {
        busy,
        error,
        compactStarted,
        clearError: useCallback(() => setError(undefined), []),
        setInternet: useCallback((on: boolean) => run('internet', (c) => agentApi.setInternet(c, on)), [run]),
        setAutoCompact: useCallback((on: boolean) => run('autocompact', (c) => agentApi.setAutoCompact(c, on)), [run]),
        compactNow: useCallback(
            () =>
                run('compact', async (c) => {
                    await agentApi.runCommand(c, '/compact');
                    return undefined;
                }),
            [run],
        ),
    };
}
