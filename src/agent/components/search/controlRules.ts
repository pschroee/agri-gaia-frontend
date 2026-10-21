// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The rules behind the controls of a training search (gateway issue #168, G3, G8, G10, A13): which control is
// offered, how long a hint may be and what the gateway receives. Pure, so a test can pin them down.

import type { Search, Trial } from '../../experiments';
import { epochText, isOpen, minutesText } from '../../searchView';

export const HINT_MAX = 500;

/** The search still takes controls. */
export const searchIsOpen = (s: Pick<Search, 'state'>): boolean => s.state === 'running';

/** Stop trial is offered for a declared or running trial of a running search. */
export const canStopTrial = (s: Pick<Search, 'state'>, t: Pick<Trial, 'state'> | undefined): boolean =>
    !!t && searchIsOpen(s) && isOpen(t);

/** Adopt trial: only a finished trial of the running search (G8). */
export const canAdopt = (s: Pick<Search, 'state' | 'id'>, t: Pick<Trial, 'state' | 'search_id'> | undefined): boolean =>
    !!t && searchIsOpen(s) && t.state === 'done' && t.search_id === s.id;

/** "Stopping…" shows while a stop is requested and the gateway has not yet reported the trial as ended (G3). */
export const isStopping = (t: Pick<Trial, 'id' | 'state'> | undefined, requested: ReadonlySet<string>): boolean =>
    !!t && requested.has(t.id) && isOpen(t);

/** The trial ids still waiting for the gateway's `stopped`; ids of trials that have ended are dropped. */
export function pruneStopping(requested: ReadonlySet<string>, t: Pick<Trial, 'id' | 'state'> | undefined): Set<string> {
    const next = new Set(requested);
    if (t && !isOpen(t)) next.delete(t.id);
    return next;
}

export const hintTrimmed = (text: string): string => text.trim();

/** The reason a hint cannot be sent; undefined when it can. */
export function hintError(text: string): string | undefined {
    const t = hintTrimmed(text);
    if (t === '') return 'Write a hint first';
    if (text.length > HINT_MAX) return `At most ${HINT_MAX} characters`;
    return undefined;
}

export const hintCounter = (text: string): string => `${text.length} / ${HINT_MAX}`;

export const ADOPT_TEXT = (idx: number): { title: string; body: string; action: string } => ({
    title: `Adopt trial ${idx} as the result?`,
    body: 'The search ends; the final test runs for this trial.',
    action: `Adopt trial ${idx}`,
});

export const STOP_SEARCH_TEXT = {
    title: 'Stop the training search?',
    body: 'Results so far stay. The winner is chosen from finished trials.',
};

export const BUDGET_DIALOG_TEXT =
    'A limit below what is already used ends the search. A lower compute time also stops the running trial.';

const FINAL_TEST_TEXT = 'The final test runs once for the winner.';

/** The second line of the "Stop the training search?" dialog: what happens to the open trial. */
export function stopSearchDetail(trial?: Pick<Trial, 'idx' | 'state' | 'epoch' | 'epochs'>): string {
    if (trial && (trial.state === 'running' || trial.state === 'declared'))
        return `Trial ${trial.idx} (${epochText(trial).toLowerCase()}) is stopped and not considered. ${FINAL_TEST_TEXT}`;
    return FINAL_TEST_TEXT;
}

/** "Training search · tf-flowers · used so far: 3 runs, 1 h 12 min" under the title of the budget dialog. */
export function budgetUsedText(search: Pick<Search, 'used' | 'base'>): string {
    const runs = search.used?.runs ?? 0;
    const parts = ['Training search'];
    const ds = search.base?.dataset;
    if (ds) parts.push(ds.name || `dataset #${ds.id}`);
    parts.push(`used so far: ${runs} ${runs === 1 ? 'run' : 'runs'}, ${minutesText(search.used?.compute_minutes ?? 0)}`);
    return parts.join(' · ');
}

export const HINT_INTRO = 'The agent reads it before it chooses the next trial.';
export const HINT_SENT_AS = 'Sent as your message: “Hint for the training search: …”';
export const HINT_SENT_AS_INLINE = 'Sent as your message in this chat';
