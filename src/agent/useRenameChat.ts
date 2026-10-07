// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/** Inline rename of a chat in the history list (issue #49); rules and state in rename.ts. */
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { useAgent } from './AgentContext';
import { agentApi } from './api';
import { initialRename, renameCommand, renameDecision, renameErrorText, renameReducer, withTitle } from './rename';
import type { Chat } from './types';

export function useRenameChat() {
    const { chats, updateChat } = useAgent();
    const [state, dispatch] = useReducer(renameReducer, initialRename);
    const chatsRef = useRef(chats);
    useEffect(() => {
        chatsRef.current = chats;
    }, [chats]);
    const stateRef = useRef(state);
    stateRef.current = state;

    const start = useCallback(
        (chat: Chat) => dispatch({ type: 'start', chatId: chat.id, title: chat.title ?? '' }),
        [],
    );
    const change = useCallback((draft: string) => dispatch({ type: 'change', draft }), []);
    // the field closes at once for a blur that follows Enter or Escape before the next render
    const close = useCallback((type: 'commit' | 'cancel') => {
        stateRef.current = renameReducer(stateRef.current, { type });
        dispatch({ type });
    }, []);
    const cancel = useCallback(() => close('cancel'), [close]);
    const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), []);

    /** Enter or blur: closes the field and saves a changed, non-empty title through the gateway's /rename. */
    const commit = useCallback(async () => {
        const { chatId, draft } = stateRef.current;
        if (chatId === undefined) return;
        close('commit');
        const chat = chatsRef.current.find((c) => c.id === chatId);
        if (!chat) return;
        const d = renameDecision(chat.title ?? '', draft);
        if (!d.save) return;
        const before = chat.title;
        // shown at once in history, chat header and the panel's chat selector; the gateway's chat event follows
        updateChat(withTitle(chat, d.title));
        try {
            // /rename only stores the title: it neither resumes a dormant chat nor takes a slot
            await agentApi.runCommand(chatId, renameCommand(d.title));
        } catch (e) {
            const latest = chatsRef.current.find((c) => c.id === chatId);
            if (latest && latest.title === d.title) updateChat(withTitle(latest, before));
            dispatch({ type: 'failed', chatId, text: renameErrorText(e) });
        }
    }, [close, updateChat]);

    return { state, start, change, commit, cancel, dismiss };
}
