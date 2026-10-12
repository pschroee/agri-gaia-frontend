// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/**
 * Moving chats to the trash, restoring them, deleting for good and emptying the trash (issue #76): the calls, the
 * questions in front of them and the notice after each one. The lists follow through AgentContext.
 */

import { useState } from 'react';

import { agentApi } from './api';
import { useAgent } from './AgentContext';
import { needsTrashConfirm } from './trash';
import type { Chat } from './types';

/** A question in front of an action; the action runs only when the user confirms it. */
export type TrashDialog =
    | { kind: 'move'; chat: Pick<Chat, 'id' | 'title'> }
    | { kind: 'delete'; chat: { id: string; title: string } }
    | { kind: 'empty'; count: number };

/** A short message after an action; `undo` puts a chat back into the history. */
export type TrashNotice = { text: string; undo?: () => void };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useTrashActions(opts: { onRestored?: (id: string) => void } = {}) {
    const { trash, refreshChats, removeChat } = useAgent();
    const [dialog, setDialog] = useState<TrashDialog>();
    const [notice, setNotice] = useState<TrashNotice>();

    const restore = async (id: string) => {
        try {
            await agentApi.restoreChat(id);
            opts.onRestored?.(id);
        } catch (e) {
            setNotice({ text: `Restoring failed: ${errorText(e)}` });
        }
        void refreshChats();
    };

    const moveToTrash = async (chat: Pick<Chat, 'id' | 'title'>) => {
        // gone at once; if the gateway refuses, the refresh below brings it back
        removeChat(chat.id);
        try {
            await agentApi.trashChat(chat.id);
            setNotice({
                text: 'Chat moved to trash',
                undo: () => {
                    setNotice(undefined);
                    void restore(chat.id);
                },
            });
        } catch (e) {
            setNotice({ text: `Moving to trash failed: ${errorText(e)}` });
        }
        void refreshChats();
    };

    const deletePermanently = async (id: string) => {
        try {
            await agentApi.deleteChat(id);
        } catch (e) {
            setNotice({ text: `Deleting failed: ${errorText(e)}` });
        }
        void refreshChats();
    };

    const emptyTrash = async () => {
        try {
            const r = await agentApi.emptyTrash();
            setNotice({ text: `${r.deleted} ${r.deleted === 1 ? 'chat' : 'chats'} deleted permanently` });
        } catch (e) {
            setNotice({ text: `Emptying the trash failed: ${errorText(e)}` });
        }
        void refreshChats();
    };

    return {
        trash,
        dialog,
        notice,
        dismissNotice: () => setNotice(undefined),
        closeDialog: () => setDialog(undefined),
        /** Runs the action behind the open question. */
        confirm: () => {
            const d = dialog;
            setDialog(undefined);
            if (!d) return;
            if (d.kind === 'move') void moveToTrash(d.chat);
            else if (d.kind === 'delete') void deletePermanently(d.chat.id);
            else void emptyTrash();
        },
        /** "Move to trash" from the history: asks only while the agent works in the chat. */
        requestMove: (chat: Chat) => {
            if (needsTrashConfirm(chat)) setDialog({ kind: 'move', chat });
            else void moveToTrash(chat);
        },
        requestDelete: (chat: { id: string; title: string }) => setDialog({ kind: 'delete', chat }),
        requestEmpty: () => setDialog({ kind: 'empty', count: trash?.chats.length ?? 0 }),
        restore: (id: string) => void restore(id),
    };
}
