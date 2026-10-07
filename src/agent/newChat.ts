// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// "New chat" without a dialog (issue #30): the chat is created right away with the gateway's defaults (model
// AGW_DEFAULT_MODEL, the model's thinking level, bindings from AGW_TOOLSETS, no delegation, title from the first
// message), selected, and its input gets the focus. Model and thinking level stay switchable below the input.
// Pure parts, unit-tested; the request itself runs in AgentContext.

import type { CreateChatRequest } from './types';

/**
 * Request body for a new chat: only the browser language and `async`, so the gateway answers at once even when its
 * pool has no free sandbox (the chat then shows "Starting" until one is there). Everything else is the gateway's
 * default.
 */
export function newChatRequest(language?: string): CreateChatRequest {
    return language ? { async: true, language } : { async: true };
}

/** Message for a failed "New chat" (503: no free sandbox on a gateway without `async`). */
export function newChatErrorText(status: number | undefined, message: string): string {
    if (status === 503) return 'No free agent sandbox right now. Please try again in a moment.';
    if (status === 401) return 'Your agent session has ended. Sign in again, then start the chat.';
    return `Could not start a new chat: ${message}`;
}

/**
 * The chat just created by "New chat" (or by dropping files without an open chat): its input takes the focus and
 * the dropped files once it is shown, then the entry is cleared.
 */
export type FreshChat = { chatId: string; files: File[] };

/** The fresh-chat entry for the input of `chatId`, if it is meant for it. */
export function freshChatFor(fresh: FreshChat | undefined, chatId: string): FreshChat | undefined {
    return fresh && fresh.chatId === chatId ? fresh : undefined;
}

/**
 * Should the "New chat" button be usable? Not before the session is ready and not while a creation is on its way
 * (a double click would create two chats and take two sandboxes).
 */
export function canStartNewChat(status: string, creating: boolean): boolean {
    return status === 'ready' && !creating;
}
