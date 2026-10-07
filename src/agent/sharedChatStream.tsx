// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode, createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useAgent } from './AgentContext';
import { chatShownAt } from './panelCarry';
import { DraftStore, Published, hostChat, streamFor } from './sharedChat';
import { ChatStream, useChatStream } from './useChatStream';

type Shared = {
    published?: Published<ChatStream>;
    drafts: DraftStore;
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
    const chatId = hostChat({ ready: status === 'ready', chatId: selectedChatId, shown: chatShownAt(pathname, search) });

    // on the agent page before paint, so the panel of the next page already knows whether to show
    useLayoutEffect(() => noteRoute(pathname, search), [noteRoute, pathname, search]);

    const value = useMemo<Shared>(() => ({ published, drafts }), [published, drafts]);
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
 * before paint), it renders the idle stream.
 */
export function useSharedChatStream(chatId: string): ChatStream {
    const shared = useContext(SharedChatContext);
    const own = useChatStream(shared ? undefined : chatId);
    return (shared && streamFor(shared.published, chatId)) || own;
}

/** Draft of a chat's input, kept across the move between page and panel; without the provider nothing is kept. */
export function useChatDraft(chatId: string): { initial: string; save: (text: string) => void } {
    const drafts = useContext(SharedChatContext)?.drafts;
    const [initial] = useState(() => drafts?.get(chatId) ?? '');
    const save = useMemo(() => (text: string) => drafts?.set(chatId, text), [drafts, chatId]);
    return { initial, save };
}
