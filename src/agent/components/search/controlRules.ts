// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The rules behind the controls of a training search (gateway issue #168, G3, G8, G10, A13): which control is
// offered, how long a hint may be and what the gateway receives. Pure, so a test can pin them down.

import type { Search, Trial } from '../../experiments';
import { isOpen } from '../../searchView';

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

export const hintCounter = (text: string): string => `${text.length}/${HINT_MAX}`;

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
