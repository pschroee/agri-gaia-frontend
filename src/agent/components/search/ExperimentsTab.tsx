// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The tab "Experiments" of /ai-agent (gateway issues #168, #222): the overview of all runs of the user across all
// chats, or, when the address names one (`chat` + `run`, the older `search`), the detail of that run. The tab only
// switches between the two and keeps the address: opening a run adds `chat` and `run` to the state of the overview,
// "Back to overview" removes just these, so the filters stay.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAgent } from '../../AgentContext';
import type { RunRow } from '../../experimentRuns';
import { closeRunParams, detailOf, openRunParams } from '../../experimentRuns';
import ExperimentDetail from './ExperimentDetail';
import ExperimentsOverview from './ExperimentsOverview';

export default function ExperimentsTab({ onOpenChat }: { onOpenChat?: (chatId: string) => void }) {
    const { selectedChatId } = useAgent();
    const [params, setParams] = useSearchParams();
    const detail = detailOf(params, selectedChatId);
    // the row the detail was opened from; an address opened directly has none
    const [opened, setOpened] = useState<RunRow>();
    const chat = (id: string) => onOpenChat?.(id);

    if (detail) {
        const row = opened && opened.id === detail.runId && opened.chat_id === detail.chatId ? opened : undefined;
        return (
            <ExperimentDetail
                chatId={detail.chatId}
                runId={detail.runId}
                trialId={detail.trialId}
                row={row}
                onBack={() => setParams(closeRunParams(params))}
                onOpenChat={chat}
                onSelectTrial={(id) => {
                    const next = new URLSearchParams(params);
                    // an older link that named the search only: the address now names the run
                    next.delete('search');
                    next.set('chat', detail.chatId);
                    next.set('run', detail.runId);
                    next.set('trial', id);
                    setParams(next, { replace: true });
                }}
                onAllRuns={(chatId) => {
                    const next = closeRunParams(params);
                    next.set('in_chat', chatId);
                    next.delete('page');
                    setParams(next);
                }}
            />
        );
    }
    return (
        <ExperimentsOverview
            onOpenRun={(row) => {
                setOpened(row);
                setParams(openRunParams(params, row.chat_id, row.id));
            }}
            onOpenChat={chat}
        />
    );
}
