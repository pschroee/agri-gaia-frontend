// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The structured data of the approvals of a training search (gateway issue #168, API.md "The search service"): the
// approval of the proposal (`approval.search`, kind `proposal`, approval kind `search`) and the question that comes
// when a trial of a notebook search runs other code than the approved one (`approval.search`, kind `code_change`, on
// an ordinary `platform_write` approval of the notebook run). Everything in it is written by the gateway from what it
// read, except `note`, which is the agent's own text.

import type { NamedObject, SearchBase, SearchBudget, SearchObjective, SearchPath, SearchSpace } from './experiments';
import { compactNumber, paramValue } from './searchView';
import type { NotebookApprovalData } from './notebook';

/** The approval of a search proposal. */
export type SearchApprovalData = {
    kind: 'proposal';
    search_id: string;
    title: string;
    objective: SearchObjective;
    space: SearchSpace;
    /** The base configuration without the searched keys. */
    fixed?: Record<string, unknown>;
    budget: SearchBudget;
    compute: { needed: number; left: number; left_after: number };
    /** When the approval lapses undecided. */
    expires_at?: string;
    path: SearchPath;
    base?: SearchBase;
    /** The notebook way: the data of a notebook run (entry, files with SHA-256 and text, datasets, limits). */
    code?: NotebookApprovalData;
    holdout: { available: boolean; eval_dataset?: NamedObject; images?: number };
    autonomy: { max_auto_turns: number };
    note?: string;
};

/** One changed file of a code change: hashes of the approved and the new version and the difference. */
export type SearchFileChange = {
    name: string;
    old_sha256?: string;
    new_sha256?: string;
    added?: boolean;
    removed?: boolean;
    /** A unified diff with three lines of context; missing when it is too long or the file has no text. */
    diff?: string;
    diff_too_long?: boolean;
    /** The whole new file when the diff is too long. */
    new_text?: string;
};

/** The question to the user when a trial runs other code than the approved one (A17, G15). */
export type SearchCodeChange = {
    kind: 'code_change';
    search_id: string;
    title: string;
    trial: number;
    code_version_from: number;
    code_version_to: number;
    changed_files: string[];
    files: SearchFileChange[];
};

export type SearchApproval = SearchApprovalData | SearchCodeChange;

export const isCodeChange = (s: SearchApproval | undefined): s is SearchCodeChange =>
    !!s && (s.kind === 'code_change' || 'code_version_to' in s);

export const isProposal = (s: SearchApproval | undefined): s is SearchApprovalData => !!s && !isCodeChange(s);

/** The title of the approval card. */
export const approvalTitle = (s: SearchApproval): string =>
    isCodeChange(s) ? `Code changed in training search '${s.title}'` : 'Start a training search';

/** "Waiting for you · 9 min left" from the approval's own expiry (A9); without one only "Waiting for you". */
export function waitingText(expiresAt: string | undefined, now = Date.now()): string {
    const t = expiresAt ? Date.parse(expiresAt) : NaN;
    if (!Number.isFinite(t)) return 'Waiting for you';
    const min = Math.ceil((t - now) / 60_000);
    return min <= 0 ? 'Waiting for you · about to expire' : `Waiting for you · ${min} min left`;
}

/** The summary line of the proposal under the title ("Up to 6 training runs on dataset …"). */
export function proposalSummary(d: SearchApprovalData): string {
    const parts: string[] = [];
    const runs = d.budget?.max_runs;
    parts.push(typeof runs === 'number' ? `Up to ${runs} training runs` : 'Training runs');
    const ds = d.base?.dataset;
    if (ds) parts.push(`on dataset ${ds.name ? `${ds.name} (#${ds.id})` : `#${ds.id}`}`);
    const t = d.budget?.target;
    const ofMetric = d.objective?.metric === 'val_loss' ? 'val. loss' : d.objective?.metric === 'val_f1' ? 'val. F1' : 'val. accuracy';
    const sign = d.objective?.mode === 'min' ? '≤' : '≥';
    const head = parts.join(' ');
    return typeof t === 'number' ? `${head}, stops at ${ofMetric} ${sign} ${compactNumber(t)}` : head;
}

/** The fixed settings as `name value` pairs, sorted by name. */
export function fixedPairs(fixed: Record<string, unknown> | undefined): { name: string; value: string }[] {
    return Object.keys(fixed ?? {})
        .sort()
        .map((name) => ({ name, value: paramValue(fixed?.[name]) }));
}

/** "Fixed settings · 8 (optimizer AdamW, scheduler ReduceLROnPlateau, …)": the count and the first two. */
export function fixedSummary(fixed: Record<string, unknown> | undefined): string {
    const pairs = fixedPairs(fixed);
    if (pairs.length === 0) return 'Fixed settings · none';
    const head = pairs
        .slice(0, 2)
        .map((p) => `${p.name} ${p.value}`)
        .join(', ');
    return `Fixed settings · ${pairs.length} (${head}${pairs.length > 2 ? ', …' : ''})`;
}

/** The files of the approved code without `params.json`, which the search writes per trial (A7). */
export function codeFilesWithoutParams(code: NotebookApprovalData): NotebookApprovalData {
    return { ...code, files: code.files.filter((f) => f.name !== 'params.json') };
}

/** "Held-back test set: 92 images of tf-flowers-mini (#58). …" */
export function holdoutText(h: SearchApprovalData['holdout']): string {
    if (!h?.available) return 'No held-back test set — the final test is skipped.';
    const ds = h.eval_dataset;
    const n = h.images ?? ds?.images;
    const of = ds ? ` of ${ds.name ? `${ds.name} (#${ds.id})` : `#${ds.id}`}` : '';
    return `Held-back test set: ${n ? `${n} images` : 'images'}${of}. Used once, for the winner only, when the search ends.`;
}

/** The compute calls the search needs and what is left afterwards, in the words of the Runs row. */
export function computeNote(c: SearchApprovalData['compute'] | undefined): string {
    if (!c) return '';
    return `${c.left_after} compute call${c.left_after === 1 ? '' : 's'} left in this chat after the search`;
}

/** "Hours" shown for the search's time limit; the gateway sends none yet, so this is the neutral sentence. */
export const SEARCH_TIME_LIMIT_LINE = 'The search also ends when its time limit or your sign-in session ends.';

/** "The search ends after {h} h at the latest." where the instance names the number (A19). */
export function endsByText(hours: number | undefined): string {
    return hours && hours > 0 ? `The search ends after ${hours} h at the latest.` : SEARCH_TIME_LIMIT_LINE;
}

// ---------------------------------------------------------------------------------------------------------------
// The diff of a code change
// ---------------------------------------------------------------------------------------------------------------

export type DiffRow =
    | { kind: 'gap' }
    | { kind: 'line'; n: number; sign: '+' | '−' | ''; text: string };

/** The rows of a unified diff the gateway sends ("@@ -a +b @@", " ", "-", "+"): numbers, sign and text. */
export function diffRows(diff: string | undefined): DiffRow[] {
    if (!diff) return [];
    const rows: DiffRow[] = [];
    let oldN = 0;
    let newN = 0;
    let first = true;
    for (const line of diff.split('\n')) {
        const m = /^@@ -(\d+) \+(\d+) @@/.exec(line);
        if (m) {
            if (!first) rows.push({ kind: 'gap' });
            first = false;
            oldN = Number(m[1]);
            newN = Number(m[2]);
            continue;
        }
        const op = line[0];
        const text = line.slice(1);
        if (op === '+') rows.push({ kind: 'line', n: newN++, sign: '+', text });
        else if (op === '-') rows.push({ kind: 'line', n: oldN++, sign: '−', text });
        else {
            rows.push({ kind: 'line', n: newN, sign: '', text });
            oldN++;
            newN++;
        }
    }
    return rows;
}

/** "3 lines removed, 4 added" for the head of a file's diff. */
export function diffCounts(rows: DiffRow[]): string {
    let add = 0;
    let del = 0;
    for (const r of rows) {
        if (r.kind !== 'line') continue;
        if (r.sign === '+') add++;
        else if (r.sign === '−') del++;
    }
    return `${del} line${del === 1 ? '' : 's'} removed, ${add} added`;
}

/** The head of the code change: "Version 1 → 2 · train.py changed · applies to trial 6 and later". */
export function codeChangeSummary(c: SearchCodeChange): string {
    const files = c.changed_files.length ? c.changed_files.join(', ') : 'code';
    return `Version ${c.code_version_from} → ${c.code_version_to} · ${files} changed · applies to trial ${c.trial} and later`;
}

/** "Approving makes version 2 the code of the following trials. Trials 1–5 keep version 1." */
export function codeChangeFoot(c: SearchCodeChange): string {
    const keep = c.trial > 2 ? `Trials 1–${c.trial - 1}` : c.trial === 2 ? 'Trial 1' : 'Earlier trials';
    const verb = c.trial === 2 ? 'keeps' : 'keep';
    return `Approving makes version ${c.code_version_to} the code of the following trials. ${keep} ${verb} version ${c.code_version_from}.`;
}
