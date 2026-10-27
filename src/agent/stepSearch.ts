// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The search step of a plan (issue #245): before the approval the rows of the gateway's summary (space, budget,
// goal), after the start the line "Trials 2/3 · best val_acc 0.97 (trial 2)" from the chat's search data.

import type { SearchBook } from './searchChip';
import { bestTrialOf, scoreText, trialsOf } from './searchView';
import type { PlanStep } from './plan';

/** Does the step start a training search? */
export const isSearchStep = (step: PlanStep): boolean => step.tool === 'propose_search';

export type SearchRow = { label: string; value: string };

/**
 * The summary of a search step as table rows. The gateway writes one line ("Training search on the training
 * container of step 2: lr 1e-4..1e-2 log; up to 6 trials, 30 compute minutes, objective val_acc (stop at >= 0.97);
 * trials run without asking inside this space"); details on lines of their own are read alike. Rows: Parameter,
 * Budget, Goal and Note. Anything unreadable stays out; nothing is invented.
 */
export function searchSummaryRows(step: PlanStep): SearchRow[] {
    const text = (step.summary_run ?? step.summary ?? '').trim();
    if (!text) return [];
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    let first = lines[0];
    const rest = lines.slice(1);
    // the head names the step; the first parts follow its colon
    const colon = /^training search\b[^:]*:\s*/i.exec(first);
    first = colon ? first.slice(colon[0].length) : '';
    const parts = [first, ...rest].flatMap((l) => l.split(';')).map((p) => p.trim().replace(/^[-•]\s*/, '')).filter((p) => p !== '');
    const rows: SearchRow[] = [];
    for (const p of parts) {
        if (/^up to \d+/i.test(p) || /\bcompute minutes?\b/i.test(p)) {
            // "up to 6 trials, 30 compute minutes, objective val_acc (stop at >= 0.97)"
            const goal = /,?\s*(objective\b.*)$/i.exec(p);
            const budget = (goal ? p.slice(0, goal.index) : p).replace(/^up to\s+/i, '').trim();
            if (budget) rows.push({ label: 'Budget', value: `up to ${budget}` });
            if (goal) rows.push({ label: 'Goal', value: goal[1].replace(/^objective\s+/i, '') });
        } else if (/^objective\b/i.test(p)) {
            rows.push({ label: 'Goal', value: p.replace(/^objective\s+/i, '') });
        } else if (/^trials run\b/i.test(p)) {
            rows.push({ label: 'Note', value: p.charAt(0).toUpperCase() + p.slice(1) });
        } else {
            const m = /^(\S+)\s+(.+)$/.exec(p);
            rows.push(m ? { label: 'Parameter', value: `${m[1]} · ${m[2]}` } : { label: 'Parameter', value: p });
        }
    }
    return rows;
}

/**
 * "Trials 2/3 · best val_acc 0.97 (trial 2)" for the search a step started; '' while the chat has no data on that
 * search yet (the step then shows only the link).
 */
export function searchProgressLine(step: PlanStep, book: SearchBook | undefined): string {
    const id = step.search_id;
    const search = id ? book?.searches.find((s) => s.id === id) : undefined;
    if (!search) return '';
    const max = search.budget?.max_runs;
    const runs = search.used?.runs ?? 0;
    const parts = [`Trials ${runs}${typeof max === 'number' ? `/${max}` : ''}`];
    const best = bestTrialOf(search, trialsOf(book?.trials ?? [], search.id));
    if (best && typeof best.score === 'number')
        parts.push(`best ${search.objective?.metric ?? 'val_acc'} ${scoreText(best.score, search.objective)} (trial ${best.idx})`);
    return parts.join(' · ');
}
