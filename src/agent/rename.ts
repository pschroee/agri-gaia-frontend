// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Renaming a chat in the history list (issue #49): the title's rules (as the gateway's /rename) and the state of the
 * inline edit field. The gateway's /rename only stores the title and publishes the chat; it neither resumes a
 * dormant chat nor takes a slot, so the history uses it too.
 */
import type { Chat } from './types';

/** Longest title in characters (code points), as the gateway's `maxTitle`; it cuts longer ones. */
export const MAX_TITLE = 120;

/** Title as the gateway stores it: whitespace collapsed, trimmed, cut to MAX_TITLE characters. */
export function normalizeTitle(text: string): string {
    const t = text.split(/\s+/).filter(Boolean).join(' ');
    const chars = Array.from(t);
    return chars.length > MAX_TITLE ? chars.slice(0, MAX_TITLE).join('').trimEnd() : t;
}

/** What committing a draft does: nothing for an empty or unchanged title, otherwise save the normalized title. */
export function renameDecision(current: string, draft: string): { save: false } | { save: true; title: string } {
    const title = normalizeTitle(draft);
    if (!title || title === normalizeTitle(current)) return { save: false };
    return { save: true, title };
}

/** The slash command that renames (gateway: POST /chats/{id}/commands). */
export const renameCommand = (title: string): string => `/rename ${title}`;

/** The chat with the new title, shown at once (the gateway's chat event follows). */
export const withTitle = (chat: Chat, title: string): Chat => ({ ...chat, title });

/** Inline edit of one history entry; only one entry is edited at a time. */
export type RenameState = {
    /** Chat whose title is being edited. */
    chatId?: string;
    draft: string;
    /** Last failure, shown under its entry until the next action. */
    error?: { chatId: string; text: string };
};

export type RenameAction =
    | { type: 'start'; chatId: string; title: string }
    | { type: 'change'; draft: string }
    /** Enter or blur: closes the field; the caller saves when renameDecision says so. */
    | { type: 'commit' }
    | { type: 'cancel' }
    | { type: 'failed'; chatId: string; text: string }
    | { type: 'dismiss' };

export const initialRename: RenameState = { draft: '' };

export function renameReducer(state: RenameState, action: RenameAction): RenameState {
    switch (action.type) {
        case 'start':
            // prefilled with the stored title; an untitled chat starts empty (placeholder "Untitled chat")
            return { chatId: action.chatId, draft: action.title };
        case 'change':
            return state.chatId === undefined ? state : { ...state, draft: action.draft };
        case 'commit':
        case 'cancel':
            // a blur after Enter or Escape finds the field closed and does nothing
            return state.chatId === undefined ? state : { draft: '', error: state.error };
        case 'failed':
            return { ...state, error: { chatId: action.chatId, text: action.text } };
        case 'dismiss':
            return state.error ? { ...state, error: undefined } : state;
        default:
            return state;
    }
}

/** Why a rename failed, in words. */
export function renameErrorText(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    return `Rename failed: ${msg}`;
}
