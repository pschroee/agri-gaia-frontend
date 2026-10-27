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
 * The summary of a search step as table rows. The gateway writes (`platform/summary_search.go`) one head line
 * "Training search on the training container of step 2: lr 0.0001 to 0.01 (log), batch_size one of 16, 32; up to
 * 3 trials, 30 compute minutes, objective val_acc (stop at ≥ 0.99); trials run without asking inside this space" and
 * one detail line per further line. Rows: one Parameter per range, Budget, Goal, and a Note per remaining part or
 * detail line. Anything unreadable stays out; nothing is invented.
 */
export function searchSummaryRows(step: PlanStep): SearchRow[] {
    const text = (step.summary_run ?? step.summary ?? '').trim();
    if (!text) return [];
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    const segs = lines[0].split(';').map((p) => p.trim()).filter((p) => p !== '');
    if (!/^training search\b/i.test(segs[0] ?? '')) return [];
    const rows: SearchRow[] = [];
    const note = (p: string) => rows.push({ label: 'Note', value: p.charAt(0).toUpperCase() + p.slice(1) });
    // the head names the step; the ranges follow its colon (a search without a space has none)
    const colon = segs[0].indexOf(':');
    const ranges = colon >= 0 ? segs[0].slice(colon + 1).trim() : '';
    const parts = [ranges, ...segs.slice(1)];
    parts.forEach((p, i) => {
        if (p === '') return;
        if (/^up to \d+/i.test(p) || /\bcompute minutes?\b/i.test(p) || /^objective\b/i.test(p)) {
            // "up to 3 trials, 30 compute minutes, objective val_acc (stop at ≥ 0.99)"
            const goal = /(?:^|,\s*)(objective\b.*)$/i.exec(p);
            const budget = (goal ? p.slice(0, goal.index) : p).replace(/^up to\s+/i, '').trim();
            if (budget) rows.push({ label: 'Budget', value: `up to ${budget}` });
            if (goal) rows.push({ label: 'Goal', value: goal[1].replace(/^objective\s+/i, '') });
        } else if (i === 0) {
            // the ranges: "lr 0.0001 to 0.01 (log), batch_size one of 16, 32" – a comma starts a new parameter only
            // where a name and its range follow, the values of a choice keep theirs
            for (const r of p.split(/,\s+(?=[A-Za-z_][\w.-]*\s+(?:one of\b|-?[\d.]+(?:e[-+]?\d+)?\s+to\b|\())/)) {
                const m = /^(\S+)\s+(.+)$/.exec(r.trim());
                rows.push({ label: 'Parameter', value: m ? `${m[1]} · ${m[2]}` : r.trim() });
            }
        } else {
            note(p);
        }
    });
    for (const l of lines.slice(1)) note(l);
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
