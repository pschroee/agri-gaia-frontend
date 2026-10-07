// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    acceptanceSummary,
    acceptanceSummaryText,
    commandResult,
    criterionStatus,
    isAcceptanceFence,
    parseAcceptanceReport,
    prettyJson,
} from './acceptance';
import { readFence } from './mermaid';

/** parseAcceptanceReport for bodies that must parse. */
function parse(body: string) {
    const r = parseAcceptanceReport(body);
    if (!r) throw new Error(`not a report: ${body}`);
    return r;
}

const camel = {
    criteriaSatisfied: [
        { id: 'criterion-1', status: 'satisfied', evidence: 'tests pass' },
        { id: 'criterion-2', status: 'satisfied', evidence: 'build is green' },
    ],
    changedFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    testsAddedOrUpdated: ['a.test.ts'],
    commandsRun: [1, 2, 3, 4, 5].map((n) => ({ command: `cmd ${n}`, result: 'passed', summary: 'ok' })),
    validationOutput: ['all good'],
    residualRisks: ['none'],
    noStagedFiles: true,
    diffSummary: 'added things',
    reviewFindings: ['no blockers'],
    manualNotes: 'see PR',
};

const snake = {
    criteria_satisfied: camel.criteriaSatisfied,
    changed_files: camel.changedFiles,
    tests_added_or_updated: camel.testsAddedOrUpdated,
    commands_run: camel.commandsRun,
    validation_output: camel.validationOutput,
    residual_risks: camel.residualRisks,
    no_staged_files: true,
    diff_summary: camel.diffSummary,
    review_findings: camel.reviewFindings,
    manual_notes: camel.manualNotes,
};

describe('isAcceptanceFence', () => {
    it('knows the tags pi-subagents writes and accepts', () => {
        for (const t of [
            'acceptance-report',
            'acceptance',
            'acceptance_report',
            'acceptanceReport',
            'ACCEPTANCE-REPORT',
        ])
            expect(isAcceptanceFence(t)).toBe(true);
    });
    it('leaves other fences alone', () => {
        for (const t of ['json', '', 'mermaid', 'acceptance-reports', 'report'])
            expect(isAcceptanceFence(t)).toBe(false);
    });
    it('matches the tag readFence gives for a fenced block', () => {
        const lines = ['```acceptanceReport', '{}', '```'];
        expect(isAcceptanceFence(readFence(lines, 0)?.lang ?? '')).toBe(true);
    });
});

describe('parseAcceptanceReport', () => {
    it('reads camelCase and snake_case fields alike', () => {
        const a = parse(JSON.stringify(camel));
        const b = parse(JSON.stringify(snake));
        expect(b).toEqual(a);
        expect(a.changedFiles).toHaveLength(4);
        expect(a.tests).toEqual(['a.test.ts']);
        expect(a.commands[0]).toEqual({ command: 'cmd 1', result: 'passed', summary: 'ok' });
        expect(a.notes).toEqual(['see PR']);
        expect(a.noStagedFiles).toBe(true);
        expect(a.residualRisks).toEqual([]);
    });

    it('unwraps the wrapper keys', () => {
        for (const w of ['acceptance', 'acceptance-report', 'acceptance_report', 'acceptanceReport']) {
            const r = parseAcceptanceReport(JSON.stringify({ [w]: snake }));
            expect(r?.changedFiles).toEqual(camel.changedFiles);
        }
    });

    it('returns undefined for invalid JSON, non-objects and objects without known fields', () => {
        expect(parseAcceptanceReport('{ "criteriaSatisfied": [ ')).toBeUndefined();
        expect(parseAcceptanceReport('not json')).toBeUndefined();
        expect(parseAcceptanceReport('[1, 2]')).toBeUndefined();
        expect(parseAcceptanceReport('"text"')).toBeUndefined();
        expect(parseAcceptanceReport('{"foo": 1}')).toBeUndefined();
        expect(parseAcceptanceReport('{"acceptanceReport": 3}')).toBeUndefined();
    });

    it('normalizes status words like pi-subagents and keeps odd values readable', () => {
        const r = parse(
            JSON.stringify({
                criteria_satisfied: [
                    { id: 'a', status: 'Not met' },
                    { id: 'b', status: 'n/a' },
                    { id: 'c', status: 'DONE' },
                    { id: 'd', status: 'maybe' },
                ],
                commands_run: [
                    { command: 'x', result: 'Error' },
                    { command: 'y', result: 'skipped' },
                    { command: 'z', result: 'OK' },
                ],
                changed_files: ['a.ts', '', { path: 'b.ts' }],
                notes: 'n',
            }),
        );
        expect(r.criteria.map((c) => c.status)).toEqual(['not-satisfied', 'unknown', 'satisfied', 'unknown']);
        expect(r.commands.map((c) => c.result)).toEqual(['failed', 'not-run', 'passed']);
        expect(r.changedFiles).toEqual(['a.ts', '{"path":"b.ts"}']);
        expect(r.notes).toEqual(['n']);
    });

    it('takes the first spelling when both are given', () => {
        const r = parse('{"changedFiles": ["a"], "changed_files": ["b"]}');
        expect(r.changedFiles).toEqual(['a']);
    });
});

describe('status words', () => {
    it('criteria', () => {
        expect(criterionStatus('not_satisfied')).toBe('not-satisfied');
        expect(criterionStatus('na')).toBe('not-applicable');
        expect(criterionStatus(1)).toBe('unknown');
    });
    it('commands', () => {
        expect(commandResult('not run')).toBe('not-run');
        expect(commandResult('failure')).toBe('failed');
        expect(commandResult(undefined)).toBe('unknown');
    });
});

describe('acceptanceSummary', () => {
    it('summarizes a clean report in one line', () => {
        expect(acceptanceSummaryText(parse(JSON.stringify(camel)))).toBe(
            '2/2 criteria satisfied · 4 files changed · 5 commands passed',
        );
    });

    it('marks not-satisfied criteria and failed commands as errors', () => {
        const r = parse(
            JSON.stringify({
                criteriaSatisfied: [
                    { id: 'a', status: 'satisfied' },
                    { id: 'b', status: 'not-satisfied' },
                    { id: 'c', status: 'not-applicable' },
                ],
                changedFiles: ['x.ts'],
                commandsRun: [
                    { command: 'a', result: 'passed' },
                    { command: 'b', result: 'passed' },
                    { command: 'c', result: 'failed' },
                    { command: 'd', result: 'not-run' },
                ],
                residualRisks: ['flaky test'],
            }),
        );
        expect(acceptanceSummary(r)).toEqual([
            { text: '1/2 criteria satisfied', error: true },
            { text: '1 file changed' },
            { text: '2 commands passed' },
            { text: '1 failed', error: true },
            { text: '1 not run' },
        ]);
    });

    it('names the commands when none passed', () => {
        const r = parse('{"commands_run": [{"command": "npm test", "result": "failed"}]}');
        expect(acceptanceSummary(r)).toEqual([{ text: '1 command failed', error: true }]);
        const s = parse('{"commandsRun": [{"command": "a", "result": "not-run"}]}');
        expect(acceptanceSummaryText(s)).toBe('1 command not run');
    });

    it('is empty for a report without counted items', () => {
        expect(acceptanceSummary(parse('{"criteriaSatisfied": [], "notes": "x"}'))).toEqual([]);
        const one = parse('{"criteriaSatisfied": [{"id": "a", "status": "met"}]}');
        expect(acceptanceSummaryText(one)).toBe('1/1 criterion satisfied');
    });
});

describe('prettyJson', () => {
    it('indents valid JSON and keeps invalid text', () => {
        expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(prettyJson('{oops')).toBe('{oops');
    });
});
