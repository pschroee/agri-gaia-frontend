// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The acceptance report of a subagent (issue #53): pi-subagents asks subagents with acceptance criteria to end their
// answer with a fenced JSON block tagged `acceptance-report` and checks it itself (its runs/shared/acceptance.js). For
// the user it is raw material, so the transcript shows it as one collapsed line. Field names and status words follow
// pi-subagents (camelCase and snake_case, wrapper keys, normalized status tokens); the checks of pi-subagents are not
// repeated here: whatever parses as a JSON object with at least one known field is summarized.

/** Fence tags of an acceptance report (compared in lower case; readFence lowers the tag). */
const FENCE_TAGS = new Set(['acceptance', 'acceptance-report', 'acceptance_report', 'acceptancereport']);

/** Keys pi-subagents accepts as a wrapper around the report. */
const WRAPPERS = ['acceptance', 'acceptance-report', 'acceptance_report', 'acceptanceReport'];

/** Field names in both spellings, as ACCEPTANCE_REPORT_FIELDS of pi-subagents. */
const FIELDS: Record<string, keyof RawReport> = {
    criteriaSatisfied: 'criteriaSatisfied',
    criteria_satisfied: 'criteriaSatisfied',
    changedFiles: 'changedFiles',
    changed_files: 'changedFiles',
    testsAddedOrUpdated: 'testsAddedOrUpdated',
    tests_added_or_updated: 'testsAddedOrUpdated',
    commandsRun: 'commandsRun',
    commands_run: 'commandsRun',
    validationOutput: 'validationOutput',
    validation_output: 'validationOutput',
    residualRisks: 'residualRisks',
    residual_risks: 'residualRisks',
    noStagedFiles: 'noStagedFiles',
    no_staged_files: 'noStagedFiles',
    diffSummary: 'diffSummary',
    diff_summary: 'diffSummary',
    reviewFindings: 'reviewFindings',
    review_findings: 'reviewFindings',
    manualNotes: 'manualNotes',
    manual_notes: 'manualNotes',
    notes: 'notes',
};

type RawReport = {
    criteriaSatisfied: unknown;
    changedFiles: unknown;
    testsAddedOrUpdated: unknown;
    commandsRun: unknown;
    validationOutput: unknown;
    residualRisks: unknown;
    noStagedFiles: unknown;
    diffSummary: unknown;
    reviewFindings: unknown;
    manualNotes: unknown;
    notes: unknown;
};

export type CriterionStatus = 'satisfied' | 'not-satisfied' | 'not-applicable' | 'unknown';
export type CommandResult = 'passed' | 'failed' | 'not-run' | 'unknown';

export type Criterion = { id: string; status: CriterionStatus; evidence: string };
export type Command = { command: string; result: CommandResult; summary: string };

/** A report reduced to what the UI shows; lists hold no empty entries. */
export type AcceptanceReport = {
    criteria: Criterion[];
    changedFiles: string[];
    tests: string[];
    commands: Command[];
    validation: string[];
    residualRisks: string[];
    reviewFindings: string[];
    diffSummary: string;
    notes: string[];
    noStagedFiles?: boolean;
};

/** Whether a fence tag marks an acceptance report. */
export function isAcceptanceFence(lang: string): boolean {
    return FENCE_TAGS.has(lang.trim().toLowerCase());
}

const token = (v: string) =>
    v
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-');

/** Status of a criterion, with the synonyms pi-subagents accepts. */
export function criterionStatus(v: unknown): CriterionStatus {
    if (typeof v !== 'string') return 'unknown';
    const t = token(v);
    if (['satisfied', 'met', 'complete', 'completed', 'done', 'pass', 'passed', 'success', 'succeeded'].includes(t))
        return 'satisfied';
    if (['not-satisfied', 'not-met', 'unmet', 'incomplete', 'fail', 'failed'].includes(t)) return 'not-satisfied';
    if (['not-applicable', 'n-a', 'na', 'skip', 'skipped'].includes(t)) return 'not-applicable';
    return 'unknown';
}

/** Result of a command, with the synonyms pi-subagents accepts. */
export function commandResult(v: unknown): CommandResult {
    if (typeof v !== 'string') return 'unknown';
    const t = token(v);
    if (['passed', 'pass', 'success', 'successful', 'succeeded', 'ok'].includes(t)) return 'passed';
    if (['failed', 'fail', 'failure', 'error'].includes(t)) return 'failed';
    if (['not-run', 'not-executed', 'skip', 'skipped'].includes(t)) return 'not-run';
    return 'unknown';
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Any value as display text; strings stay, other values as compact JSON. */
const text = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
};

/** A list field: strings (or anything) as text, empty entries dropped; a single string counts as one entry. */
const list = (v: unknown): string[] => {
    if (v === undefined || v === null) return [];
    const items = Array.isArray(v) ? v : [v];
    return items.map(text).filter((s) => s !== '');
};

const objects = (v: unknown): Record<string, unknown>[] =>
    (Array.isArray(v) ? v : []).map((x) => (isObject(x) ? x : { value: x }));

/**
 * Parses the body of an acceptance fence. Undefined when it is not JSON, not an object or carries none of the known
 * fields; the caller then shows the body as code.
 */
export function parseAcceptanceReport(body: string): AcceptanceReport | undefined {
    let value: unknown;
    try {
        value = JSON.parse(body);
    } catch {
        return undefined;
    }
    if (!isObject(value)) return undefined;
    const outer = value;
    const wrapper = WRAPPERS.find((k) => k in outer);
    if (wrapper) value = outer[wrapper];
    if (!isObject(value)) return undefined;

    const raw: Partial<RawReport> = {};
    for (const [k, v] of Object.entries(value)) {
        const field = FIELDS[k];
        if (field && !(field in raw)) raw[field] = v;
    }
    if (Object.keys(raw).length === 0) return undefined;

    return {
        criteria: objects(raw.criteriaSatisfied).map((c) => ({
            id: text(c.id ?? c.value),
            status: criterionStatus(c.status),
            evidence: text(c.evidence),
        })),
        changedFiles: list(raw.changedFiles),
        tests: list(raw.testsAddedOrUpdated),
        commands: objects(raw.commandsRun).map((c) => ({
            command: text(c.command ?? c.value),
            result: commandResult(c.result),
            summary: text(c.summary),
        })),
        validation: list(raw.validationOutput),
        residualRisks: list(raw.residualRisks).filter((r) => !/^(none|n\/?a|-)\.?$/i.test(r)),
        reviewFindings: list(raw.reviewFindings),
        diffSummary: text(raw.diffSummary),
        notes: [text(raw.manualNotes), text(raw.notes)].filter((s) => s !== ''),
        noStagedFiles: typeof raw.noStagedFiles === 'boolean' ? raw.noStagedFiles : undefined,
    };
}

/** One piece of the summary line; `error` pieces show in the error colour. */
export type SummaryPart = { text: string; error?: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The summary line after "Acceptance report": criteria satisfied of those that apply (in the error colour when one is
 * not satisfied), changed files, commands by result (failed ones as a piece of their own in the error colour). Risks,
 * tests and notes show only when opened, so the line stays short in the 400 px panel.
 */
export function acceptanceSummary(r: AcceptanceReport): SummaryPart[] {
    const out: SummaryPart[] = [];
    const counted = r.criteria.filter((c) => c.status !== 'not-applicable');
    if (counted.length > 0) {
        const sat = counted.filter((c) => c.status === 'satisfied').length;
        const notSat = counted.some((c) => c.status === 'not-satisfied');
        const label = counted.length === 1 ? 'criterion' : 'criteria';
        out.push({ text: `${sat}/${counted.length} ${label} satisfied`, ...(notSat ? { error: true } : {}) });
    }
    if (r.changedFiles.length > 0) out.push({ text: `${plural(r.changedFiles.length, 'file')} changed` });
    const passed = r.commands.filter((c) => c.result === 'passed').length;
    const failed = r.commands.filter((c) => c.result === 'failed').length;
    const notRun = r.commands.filter((c) => c.result === 'not-run').length;
    if (passed > 0) out.push({ text: `${plural(passed, 'command')} passed` });
    if (failed > 0)
        out.push({ text: passed > 0 ? `${failed} failed` : `${plural(failed, 'command')} failed`, error: true });
    if (notRun > 0)
        out.push({ text: passed + failed > 0 ? `${notRun} not run` : `${plural(notRun, 'command')} not run` });
    return out;
}

/** The summary as plain text, e.g. "2/2 criteria satisfied · 4 files changed · 5 commands passed". */
export function acceptanceSummaryText(r: AcceptanceReport): string {
    return acceptanceSummary(r)
        .map((p) => p.text)
        .join(' · ');
}

/** The body for "Show raw JSON": pretty-printed when it parses, else as written. */
export function prettyJson(body: string): string {
    try {
        return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
        return body;
    }
}
