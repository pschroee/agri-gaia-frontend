// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import {
    ReactNode,
    createContext,
    memo,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import { useLocation } from 'react-router-dom';

import { agentApi } from './api';
import { useAgent } from './AgentContext';
import { alreadySent, emptyStaged, removeErrorText } from './files';
import type { StagedAction, StagedState } from './files';
import { chatShownAt } from './panelCarry';
import { DraftStore, Published, StagedStore, hostChat, streamFor } from './sharedChat';
import { ChatStream, useChatStream } from './useChatStream';

type Shared = {
    published?: Published<ChatStream>;
    drafts: DraftStore;
    /** Attachments staged in the field, per chat (issue L4/#121); they move with the chat like the draft text. */
    staged: StagedStore;
};

const SharedChatContext = createContext<Shared | null>(null);

/** Runs the stream of one chat and hands every new state up; keyed by chat, so a new chat starts fresh. */
const StreamHost = memo(function StreamHost({
    chatId,
    publish,
}: {
    chatId: string;
    publish: (p: Published<ChatStream> | undefined) => void;
}) {
    const stream = useChatStream(chatId);
    // before paint: a view mounted in the same commit gets the stream before the browser shows anything
    useLayoutEffect(() => publish({ chatId, stream }), [chatId, stream, publish]);
    useLayoutEffect(() => () => publish(undefined), [publish]);
    return null;
});

/**
 * The current chat's stream, above the agent page and the context panel (issue #50). Moving from /ai-agent to a
 * platform page swaps the view (page → panel), but not the stream: no new load, no second resume, a streaming answer
 * keeps streaming. Also tells the panel rule where the user is (AgentContext.noteRoute).
 */
export function SharedChatStreamProvider({ children }: { children: ReactNode }) {
    const { status, selectedChatId, noteRoute } = useAgent();
    const { pathname, search } = useLocation();
    const [published, setPublished] = useState<Published<ChatStream>>();
    const drafts = useRef(new DraftStore()).current;
    const staged = useRef(new StagedStore()).current;
    const chatId = hostChat({ ready: status === 'ready', chatId: selectedChatId, shown: chatShownAt(pathname, search) });

    // on the agent page before paint, so the panel of the next page already knows whether to show
    useLayoutEffect(() => noteRoute(pathname, search), [noteRoute, pathname, search]);

    const value = useMemo<Shared>(() => ({ published, drafts, staged }), [published, drafts, staged]);
    return (
        <SharedChatContext.Provider value={value}>
            {chatId && <StreamHost key={chatId} chatId={chatId} publish={setPublished} />}
            {children}
        </SharedChatContext.Provider>
    );
}

/**
 * The stream for a chat view: the shared one when the view shows the current chat, otherwise (no provider) its own.
 * Within the provider a view never opens a stream of its own; until the host has published its chat (same commit,
 * before paint), it renders the idle stream. `apart`: a view of a chat that is not the current one (the trash, read
 * only) always opens its own stream and never touches the shared one.
 */
export function useSharedChatStream(chatId: string, apart = false): ChatStream {
    const shared = useContext(SharedChatContext);
    const useShared = !!shared && !apart;
    const own = useChatStream(useShared ? undefined : chatId);
    return (useShared && streamFor(shared.published, chatId)) || own;
}

/** Draft of a chat's input, kept across the move between page and panel; without the provider nothing is kept. */
export function useChatDraft(chatId: string): { initial: string; save: (text: string) => void } {
    const drafts = useContext(SharedChatContext)?.drafts;
    const [initial] = useState(() => drafts?.get(chatId) ?? '');
    const save = useMemo(() => (text: string) => drafts?.set(chatId, text), [drafts, chatId]);
    return { initial, save };
}

/**
 * What the input field needs for its attachments (issue L4/#121): the staged state of this chat from the shared
 * store, and the four ways it changes. The store lives above the agent page and the panel, so the tiles (and the
 * uploads behind them) survive the move between them; without a provider the hook keeps its own store for the
 * lifetime of the field, which is what a ChatInput on its own needs.
 *
 * `cancel` is the cross on a tile that is still uploading: the request is aborted, the tile goes, and the gateway
 * is told to delete the input of that name (it may have arrived anyway; a staged file of the same name goes too,
 * because it is the same input there). `remove` is the cross on a finished tile: same call, but a failure is shown
 * below the field — except the gateway's "already sent", where the file belongs to an earlier message and stays.
 */
export function useStagedAttachments(chatId?: string): {
    state: StagedState;
    dispatch: (action: StagedAction) => void;
    beginUpload: (id: string) => AbortSignal | undefined;
    endUpload: (id: string) => void;
    cancel: (id: string) => void;
    remove: (name: string) => void;
} {
    const shared = useContext(SharedChatContext)?.staged;
    const own = useRef<StagedStore | null>(null);
    own.current ??= new StagedStore();
    const store = shared ?? own.current;
    const key = chatId ?? '';

    const subscribe = useCallback((fn: () => void) => store.subscribe(fn), [store]);
    const snapshot = useCallback(() => store.get(key), [store, key]);
    const state = useSyncExternalStore(subscribe, snapshot);

    const dispatch = useCallback((action: StagedAction) => store.dispatch(key, action), [store, key]);
    const beginUpload = useCallback(
        (id: string) => (chatId ? store.beginUpload(key, id).signal : undefined),
        [store, key, chatId],
    );
    const endUpload = useCallback((id: string) => store.endUpload(key, id), [store, key]);

    /** Tells the gateway to delete an unsent input; a failure is only shown for `remove` (see above). */
    const drop = useCallback(
        (name: string, showFailure: boolean) => {
            if (!chatId) return;
            agentApi.removeInput(chatId, name).catch((e: unknown) => {
                if (alreadySent(e)) return;
                if (showFailure) dispatch({ type: 'error', error: removeErrorText(e, name) });
            });
        },
        [chatId, dispatch],
    );

    const cancel = useCallback(
        (id: string) => {
            const u = store.get(key).uploads.find((x) => x.id === id);
            store.abort(key, id);
            dispatch({ type: 'upload_cancel', id });
            if (u) drop(u.name, false);
        },
        [store, key, dispatch, drop],
    );

    const remove = useCallback(
        (name: string) => {
            dispatch({ type: 'remove', name });
            drop(name, true);
        },
        [dispatch, drop],
    );

    return { state: state ?? emptyStaged, dispatch, beginUpload, endUpload, cancel, remove };
}
