// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The stream of the current chat, shared by the agent page and the context panel (issue #50). One host above both
// views keeps it (sharedChatStream.tsx); a view takes it only when it is the stream of its own chat, so a view of
// another chat never shows foreign messages for a frame. Pure parts, unit-tested.

/** A stream published by the host, with the chat it belongs to. */
export type Published<T> = { chatId: string; stream: T };

/** The published stream when it belongs to `chatId`, otherwise undefined (the host has not caught up yet). */
export function streamFor<T>(published: Published<T> | undefined, chatId: string): T | undefined {
    return published && published.chatId === chatId ? published.stream : undefined;
}

/**
 * Should the host run a stream, and for which chat? Only once signed in, with a chat selected, and where the chat is
 * on screen (panelCarry.ts, chatShownAt).
 */
export function hostChat(opts: { ready: boolean; chatId?: string; shown: boolean }): string | undefined {
    return opts.ready && opts.shown && opts.chatId ? opts.chatId : undefined;
}

/**
 * Unsent text per chat, so a draft moves with the chat from the agent page to the panel and back. Kept in memory
 * only (a reload starts empty); an empty draft is removed.
 */
export class DraftStore {
    private drafts = new Map<string, string>();

    get(chatId: string): string {
        return this.drafts.get(chatId) ?? '';
    }

    set(chatId: string, text: string) {
        if (text) this.drafts.set(chatId, text);
        else this.drafts.delete(chatId);
    }
}
