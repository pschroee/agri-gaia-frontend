// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The stream of the current chat, shared by the agent page and the context panel (issue #50). One host above both
// views keeps it (sharedChatStream.tsx); a view takes it only when it is the stream of its own chat, so a view of
// another chat never shows foreign messages for a frame. Pure parts, unit-tested.

import { emptyStaged, stagedReducer } from './files';
import type { StagedAction, StagedState } from './files';

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

/**
 * Attachments staged in the input field, per chat, next to the draft (issue L4/#121): a file the user attached is
 * user data, so moving from /ai-agent into the panel must not lose it — not the uploaded ones and not one that is
 * still uploading. Kept above both views like the stream (`sharedChatStream.tsx`), in memory only: a reload starts
 * empty, and a running upload ends with the page anyway.
 *
 * The controllers of the running uploads live here too, so the cross on a tile can still abort after a remount;
 * the gateway is told about it by the hook (`useStagedAttachments`), which owns the request. Pure, unit-tested.
 */
export class StagedStore {
    private states = new Map<string, StagedState>();
    private controllers = new Map<string, AbortController>();
    private listeners = new Set<() => void>();

    /** Registers a listener; returns the function that removes it again (stable, for useSyncExternalStore). */
    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    };

    /** The state of one chat; the same object until it changes (useSyncExternalStore compares by identity). */
    get(chatId: string): StagedState {
        return this.states.get(chatId) ?? emptyStaged;
    }

    /** Applies an action to one chat's state and tells the listeners. */
    dispatch(chatId: string, action: StagedAction) {
        const before = this.get(chatId);
        const after = stagedReducer(before, action);
        if (after === before) return;
        this.states.set(chatId, after);
        for (const l of [...this.listeners]) l();
    }

    /**
     * Starts the bookkeeping of one upload and returns its controller; the caller hands `signal` to the request.
     * Without a signal (XMLHttpRequest missing) an upload cannot be cancelled, and the cross only takes the tile.
     */
    beginUpload(chatId: string, id: string): AbortController {
        const c = new AbortController();
        this.controllers.set(uploadKey(chatId, id), c);
        return c;
    }

    /** The signal of a running upload, for a caller that only knows the tile (else undefined). */
    signalOf(chatId: string, id: string): AbortSignal | undefined {
        return this.controllers.get(uploadKey(chatId, id))?.signal;
    }

    /** Aborts the request of one upload (the cross on the tile). */
    abort(chatId: string, id: string) {
        const c = this.controllers.get(uploadKey(chatId, id));
        if (!c) return;
        this.controllers.delete(uploadKey(chatId, id));
        c.abort();
    }

    /** The request has ended (arrived, failed or was cancelled); its controller is not needed any more. */
    endUpload(chatId: string, id: string) {
        this.controllers.delete(uploadKey(chatId, id));
    }
}

const uploadKey = (chatId: string, id: string) => `${chatId}\u0000${id}`;
