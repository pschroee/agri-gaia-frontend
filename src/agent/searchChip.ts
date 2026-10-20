// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The chip "Search" in the header of the chat and its popover (gateway issue #168, design d): the searches of the chat
// in one short line, the running one first. Pure, so the labels of all states are unit-tested.

import type { EndReason, Search, Trial } from './experiments';
import type { ChipKind } from './searchView';
import { bestTrialOf, scoreText, trialsOf } from './searchView';

/** The searches and trials of one chat as the views publish them. */
export type SearchBook = { searches: Search[]; trials: Trial[] };

export type PopoverRow = { id: string; title: string; sub: string; kind: ChipKind };

export type ChipView = {
    kind: ChipKind;
    /** The label on the page ("Search · 3/6 · best 0.86") and in the panel ("Search 3/6 · 0.86"). */
    label: string;
    short: string;
    aria: string;
    rows: PopoverRow[];
    /** The search the chip stands for: the running one, else the newest. */
    mainId: string;
};

const END_WORDS: Record<EndReason, string> = {
    target_reached: 'target reached',
    budget_runs: 'budget used up',
    budget_time: 'budget used up',
    patience: 'no improvement',
    time_limit: 'time limit reached',
    compute_limit: 'no compute calls left',
    stopped_by_user: 'stopped by you',
    adopted: 'trial adopted',
    ended_by_agent: 'ended by the agent',
    start_failed: 'failed',
};

const RANK: Record<string, number> = { running: 0, proposed: 1, ended: 2 };

/** The searches the chip counts: running, waiting for approval, ended — not the refused or the expired ones. */
export function visibleSearches(book: SearchBook | undefined): Search[] {
    return (book?.searches ?? [])
        .filter((s) => s.state === 'running' || s.state === 'proposed' || s.state === 'ended')
        .sort((a, b) => RANK[a.state] - RANK[b.state] || Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** The chip of a chat; undefined while it has no search (then there is no chip, A15). */
export function chipOf(book: SearchBook | undefined): ChipView | undefined {
    const list = visibleSearches(book);
    if (list.length === 0 || !book) return undefined;
    const rowOf = (s: Search): { row: PopoverRow; best?: string } => {
        const mine = trialsOf(book.trials, s.id);
        const best = bestTrialOf(s, mine);
        const bestText = best && typeof best.score === 'number' ? scoreText(best.score, s.objective) : undefined;
        const max = s.budget?.max_runs;
        const runs = `${s.used?.runs ?? 0}${typeof max === 'number' ? ` of ${max}` : ''} runs`;
        let sub: string;
        let kind: ChipKind;
        if (s.state === 'running') {
            sub = `Running · ${runs}${best && bestText ? ` · best ${bestText} (trial ${best.idx})` : ''}`;
            kind = 'live';
        } else if (s.state === 'proposed') {
            sub = 'Waiting for your approval';
            kind = 'wait';
        } else {
            const reason = END_WORDS[(s.end_reason || 'ended_by_agent') as EndReason] ?? 'ended';
            sub = `Ended · ${reason}${bestText ? ` · best ${bestText}` : ''}`;
            kind = s.end_reason === 'start_failed' ? 'error' : 'ok';
        }
        return { row: { id: s.id, title: `Training search · ${s.title}`, sub, kind }, best: bestText };
    };
    const rows = list.map((s) => rowOf(s).row);
    const main = list[0];
    const m = rowOf(main);
    let label: string;
    let short: string;
    let aria: string;
    if (main.state === 'running') {
        const max = main.budget?.max_runs;
        const r = `${main.used?.runs ?? 0}${typeof max === 'number' ? `/${max}` : ''}`;
        label = `Search · ${r}${m.best ? ` · best ${m.best}` : ''}`;
        short = `Search ${r}${m.best ? ` · ${m.best}` : ''}`;
        aria = `Search, ${r.replace('/', ' of ')} runs${m.best ? `, best ${m.best}` : ''}. Show searches`;
    } else if (main.state === 'proposed') {
        label = 'Search · Waiting for you';
        short = 'Search · Waiting';
        aria = 'Search, waiting for your approval. Show searches';
    } else if (main.end_reason === 'start_failed') {
        label = short = 'Search · Failed';
        aria = 'Search, failed. Show searches';
    } else {
        label = short = 'Search · Ended';
        aria = 'Search, ended. Show searches';
    }
    if (list.length > 1) {
        label = `Searches · ${list.length}`;
        short = `Searches ${list.length}`;
        aria = `${list.length} searches. Show searches`;
    }
    return { kind: rows[0].kind, label, short, aria, rows, mainId: main.id };
}
