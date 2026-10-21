// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The pure parts of the notebook-run views (own code C-E4): the files of an approval, the lines and cells of the code
// field, the state derived from an observed job, its facts, the log and the texts. The components only put these
// together; the wording and the rules are checked here.

import { describe, expect, it } from 'vitest';

import type { WatchJob } from './jobs';
import {
    approvalDeadline,
    approvalDecision,
    codeLines,
    datasetLabel,
    datasetsValue,
    decidedWithoutJob,
    entryTitle,
    exitCodeOf,
    failedCellOf,
    expiryMinutes,
    factText,
    formatDuration,
    formatRunClock,
    fullLog,
    isLive,
    isPreviewable,
    isResultFile,
    limitsLine,
    logLines,
    midTrunc,
    notebookApprovalOf,
    notebookCells,
    notebookJobsOf,
    orderFiles,
    outputName,
    outputSize,
    runFacts,
    runHeadTime,
    runSeconds,
    runViewOf,
    shortLog,
    shortSha,
    startingNote,
    stoppedByText,
    timeoutNote,
} from './notebook';
import type { NotebookApprovalData, NotebookDataset } from './notebook';

const data = (over: Partial<NotebookApprovalData> = {}): NotebookApprovalData => ({
    entry: 'train.py',
    files: [
        { name: 'train.py', size: 1740, sha256: 'b13f16240000000000000000000000000000228d', text: 'import torch\n' },
    ],
    datasets: [{ id: 1, name: 'mnist-mini' }],
    limits: { cpus: 2, mem_gb: 8, timeout_min: 120, internet: false },
    ...over,
});

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'w1',
    chat_id: 'c1',
    kind: 'notebook_run',
    tool_call_id: 't1',
    state: 'running',
    ...over,
});

const NOW = Date.parse('2026-10-16T14:10:08.000Z');

describe('the files of a run', () => {
    it('puts the entry file first and keeps the order of the rest', () => {
        const files = [
            { name: 'utils.py', size: 1, sha256: 'a' },
            { name: 'config.yaml', size: 2, sha256: 'b' },
            { name: 'train.py', size: 3, sha256: 'c' },
        ];
        expect(orderFiles(files, 'train.py').map((f) => f.name)).toEqual(['train.py', 'utils.py', 'config.yaml']);
    });

    it('keeps the gateway order when the entry is not among the files', () => {
        const files = [
            { name: 'a.py', size: 1, sha256: 'a' },
            { name: 'b.py', size: 2, sha256: 'b' },
        ];
        expect(orderFiles(files, 'gone.py').map((f) => f.name)).toEqual(['a.py', 'b.py']);
    });

    it('numbers the lines of the text from 1 and counts blank ones', () => {
        expect(codeLines('a\n\nb')).toEqual([
            { n: 1, text: 'a' },
            { n: 2, text: '' },
            { n: 3, text: 'b' },
        ]);
    });

    it('does not add a line for the newline at the end', () => {
        expect(codeLines('a\nb\n')).toHaveLength(2);
        expect(codeLines('')).toEqual([{ n: 1, text: '' }]);
    });

    it('reads the code cells of a notebook out of the gateway JSON', () => {
        const text = JSON.stringify({
            cells: [
                { cell_type: 'markdown', source: '# Title' },
                { cell_type: 'code', source: 'x = 1\ny = 2' },
                { cell_type: 'code', source: ['z = 3\n', 'w = 4'] },
                { cell_type: 'code', source: '   ' },
            ],
        });
        const cells = notebookCells(text);
        expect(cells?.map((c) => c.n)).toEqual([1, 2]);
        expect(cells?.[0].lines).toEqual([
            { n: 1, text: 'x = 1' },
            { n: 2, text: 'y = 2' },
        ]);
        // an array source is the notebook format's own: the parts belong together without a separator
        expect(cells?.[1].lines).toEqual([
            { n: 1, text: 'z = 3' },
            { n: 2, text: 'w = 4' },
        ]);
    });

    it('leaves cells undefined when the text is no notebook JSON', () => {
        expect(notebookCells('import torch')).toBeUndefined();
        expect(notebookCells('{"cells": "nope"}')).toBeUndefined();
    });

    it('shows known file types as code and says no to anything else', () => {
        expect(isPreviewable('train.py', 'x = 1')).toBe(true);
        expect(isPreviewable('config.yaml', 'a: 1')).toBe(true);
        expect(isPreviewable('analysis.ipynb', '{}')).toBe(true);
        expect(isPreviewable('weights.pt', '\u0000\u0001')).toBe(false);
        expect(isPreviewable('train.py', undefined)).toBe(false);
    });

    it('shortens a SHA-256 to its ends and keeps a short one as it is', () => {
        expect(shortSha('b13f16240000000000000000000000000000228d')).toBe('b13f1624…228d');
        expect(shortSha('abc')).toBe('abc');
        expect(shortSha('')).toBe('');
    });

    it('shortens a long name in the middle and keeps its ending', () => {
        expect(midTrunc('train.py', 22)).toBe('train.py');
        expect(midTrunc('preprocessing_utilities_for_grayscale_images.py', 30)).toContain('…');
        expect(midTrunc('preprocessing_utilities_for_grayscale_images.py', 30).endsWith('.py')).toBe(true);
        expect(midTrunc('train_efficientnet_b0_mnist_mini_augmented_v2.py', 28).length).toBeLessThanOrEqual(28);
        expect(midTrunc('a-very-long-name-without-dot-at-all-really', 20)).toContain('…');
    });
});

describe('the texts of an approval', () => {
    it('names the run and its limits as the design does', () => {
        expect(entryTitle('train.py')).toBe('Run train.py in your notebook server');
        expect(entryTitle('train.py', 28)).toBe('Run train.py in your notebook server');
        expect(limitsLine({ cpus: 2, mem_gb: 8, timeout_min: 120, internet: false })).toBe(
            '2 CPUs · 8 GB · no internet · max 120 min',
        );
        expect(limitsLine({ cpus: 2, mem_gb: 8, timeout_min: 120, internet: false, gpu: true })).toBe(
            '2 CPUs · 8 GB · GPU · no internet · max 120 min',
        );
        expect(limitsLine({ cpus: 2, mem_gb: 8, timeout_min: 120, internet: false, gpu: false })).toBe(
            '2 CPUs · 8 GB · no GPU · no internet · max 120 min',
        );
    });

    it('shows a dataset with its name and id, or only the id when the name is missing', () => {
        expect(datasetLabel({ id: 1, name: 'mnist-mini' })).toBe('mnist-mini · id 1');
        expect(datasetLabel({ id: 12 })).toBe('id 12');
        expect(datasetsValue([{ id: 1, name: 'mnist-mini' }, { id: 4 } as NotebookDataset])).toBe('mnist-mini, id 4');
        expect(datasetsValue([])).toBe('');
    });

    it('reads the minutes of the approval timeout out of the gateway config', () => {
        expect(expiryMinutes({ approval_timeout_s: 600 })).toBe(10);
        expect(expiryMinutes({ approval_timeout_s: 30 })).toBe(1);
        expect(expiryMinutes({})).toBeUndefined();
        expect(expiryMinutes(undefined)).toBeUndefined();
    });

    it('says what a decision means, with the count the gateway gave', () => {
        expect(approvalDecision({ state: 'approved', decided_at: '2026-10-16T14:58:00.000Z' })).toMatchObject({
            label: 'Approved',
            suffix: '',
            tone: 'ok',
        });
        expect(approvalDecision({ state: 'rejected' })).toMatchObject({
            label: 'Rejected',
            suffix: ' · not run',
            tone: 'error',
        });
        expect(approvalDecision({ state: 'expired' }, 30).suffix).toBe(' · no decision within 30 min, not run');
        expect(approvalDecision({ state: 'expired' }, undefined).suffix).toBe(
            ' · no decision within the time limit, not run',
        );
    });

    it('computes the deadline of an approval from its creation and the gateway timeout', () => {
        expect(approvalDeadline('2026-10-16T14:58:00.000Z', 30)).toBe('2026-10-16T15:28:00.000Z');
        expect(approvalDeadline('2026-10-16T14:58:00.000Z', undefined)).toBeUndefined();
        expect(approvalDeadline(undefined, 30)).toBeUndefined();
    });
});

describe('the state of a run', () => {
    it('reads the state out of the job of the gateway', () => {
        expect(runViewOf({ state: 'running' })).toBe('running');
        expect(runViewOf({ state: 'done' })).toBe('finished');
        expect(runViewOf({ state: 'failed', message: 'exit 1 after 41 s' })).toBe('failed');
        expect(runViewOf({ state: 'failed', message: 'exit 124 after 2 h 0 min' })).toBe('timeout');
        expect(runViewOf({ state: 'starting' })).toBe('starting');
    });

    it('shows a run the stop ended as stopped, with the gateway word for it', () => {
        expect(
            runViewOf({
                state: 'failed',
                message: 'the run ended without an exit code: the notebook server of this chat was stopped while it went',
            }),
        ).toBe('stopped');
        // anything else failed stays failed, with the gateway's line
        expect(runViewOf({ state: 'failed', message: 'the run ended without an exit code' })).toBe('failed');
    });

    it('tells a live run from an ended one', () => {
        expect(isLive('starting')).toBe(true);
        expect(isLive('running')).toBe(true);
        expect(isLive('finished')).toBe(false);
        expect(isLive('stopped')).toBe(false);
    });

    it('reads the exit code of the gateway line', () => {
        expect(exitCodeOf('exit 0 after 12 min 8 s')).toBe(0);
        expect(exitCodeOf('exit 124')).toBe(124);
        expect(exitCodeOf('running, at most 120 minutes')).toBeUndefined();
        expect(exitCodeOf(undefined)).toBeUndefined();
    });

    it('reads a notebook run that names its cell (issue #193)', () => {
        const fail = 'cell 2 failed (ZeroDivisionError) after 4 s';
        const limit = 'cell 1 was running at the time limit after 1 min 0 s';
        expect(exitCodeOf(fail)).toBe(1);
        expect(exitCodeOf(limit)).toBe(124);
        expect(runViewOf({ state: 'failed', message: fail })).toBe('failed');
        expect(runViewOf({ state: 'failed', message: limit })).toBe('timeout');
        expect(failedCellOf(fail)).toEqual({ cell: 2, what: 'ZeroDivisionError', limit: false });
        expect(failedCellOf('cell 3 failed after 5 s')).toEqual({ cell: 3, what: undefined, limit: false });
        expect(failedCellOf(limit)).toEqual({ cell: 1, limit: true });
        expect(failedCellOf('exit 1 after 41 s')).toBeUndefined();
        const facts = runFacts({ state: 'failed', message: fail, started_at: '2026-10-16T14:05:00.000Z', ended_at: '2026-10-16T14:05:04.000Z' }, undefined, Date.now());
        expect(facts.map((f) => f.label)).toEqual(['Exit code', 'Failed cell', 'Duration', 'Started']);
        expect(facts[1]).toEqual({ label: 'Failed cell', value: '2 (ZeroDivisionError)', tone: 'error' });
    });

    it('counts the seconds of a live run and of an ended one', () => {
        const started = '2026-10-16T14:05:00.000Z';
        expect(runSeconds({ state: 'running', started_at: started, message: 'running' }, NOW)).toBe(308);
        expect(
            runSeconds({ state: 'done', started_at: started, ended_at: '2026-10-16T14:17:08.000Z', message: 'exit 0' }, NOW),
        ).toBe(728);
        // without the two times the gateway's own line is what is left
        expect(runSeconds({ state: 'done', message: 'exit 0 after 12 min 8 s' }, NOW)).toBe(728);
        expect(runSeconds({ state: 'done', message: 'exit 0 after 41 s' }, NOW)).toBe(41);
        expect(runSeconds({ state: 'done', message: 'exit 0' }, NOW)).toBeUndefined();
    });

    it('writes the running time and the duration as the design does', () => {
        expect(formatRunClock(188)).toBe('3:08');
        expect(formatRunClock(222)).toBe('3:42');
        expect(formatRunClock(4327)).toBe('1:12:07');
        expect(formatDuration(41)).toBe('41 s');
        expect(formatDuration(728)).toBe('12 min 08 s');
    });
});

describe('the facts of a run', () => {
    it('shows the exit code, the duration and the start after the end', () => {
        const j = job({
            state: 'done',
            message: 'exit 0 after 12 min 8 s',
            started_at: '2026-10-16T14:05:00.000Z',
            ended_at: '2026-10-16T14:17:08.000Z',
        });
        const facts = runFacts(j, data(), NOW);
        expect(facts).toEqual([
            { label: 'Exit code', value: '0', tone: undefined },
            { label: 'Duration', value: '12 min 08 s' },
            { label: 'Started', value: '14:05' },
        ]);
        expect(facts.map(factText).join(' · ')).toBe('exit 0 · 12 min 08 s · started 14:05');
    });

    it('marks a failure red and a timeout orange', () => {
        expect(runFacts(job({ state: 'failed', message: 'exit 1 after 41 s' }), data(), NOW)[0]).toEqual({
            label: 'Exit code',
            value: '1',
            tone: 'error',
        });
        expect(runFacts(job({ state: 'failed', message: 'exit 124 after 2 h 0 min' }), data(), NOW)[0]).toEqual({
            label: 'Exit code',
            value: '124',
            tone: 'warning',
        });
    });

    it('shows the start, the limit and the datasets while the run goes', () => {
        const facts = runFacts(
            job({ state: 'running', started_at: '2026-10-16T14:05:00.000Z' }),
            data({ datasets: [{ id: 1, name: 'mnist-mini' }, { id: 4, name: 'mnist-mini-labeled' }] }),
            NOW,
        );
        expect(facts.map(factText).join(' · ')).toBe('started 14:05 · time limit 120 min · mnist-mini, mnist-mini-labeled');
    });

    it('shows only the duration and the start of a stopped run and no facts while it starts', () => {
        expect(
            runFacts(
                job({
                    state: 'failed',
                    message: 'stopped while it went',
                    started_at: '2026-10-16T14:05:00.000Z',
                    ended_at: '2026-10-16T14:07:15.000Z',
                }),
                data(),
                NOW,
            ).map(factText),
        ).toEqual(['2 min 15 s', 'started 14:05']);
        expect(runFacts(job({ state: 'starting' }), data(), NOW)).toEqual([]);
    });

    it('names who stopped a run, and nothing when the job does not say (gap L14, gateway issue #92)', () => {
        const stopped = job({
            state: 'failed',
            message: 'stopped while it went',
            started_at: '2026-10-16T14:05:00.000Z',
            ended_at: '2026-10-16T14:07:15.000Z',
            stopped_by: 'user',
        });
        expect(runFacts(stopped, data(), NOW).map(factText)).toEqual(['2 min 15 s', 'started 14:05', 'stopped by you']);
        expect(runFacts({ ...stopped, stopped_by: 'agent' }, data(), NOW).map(factText)).toContain('stopped by the agent');
        // without the field the card claims nothing: the state could have been reached either way
        expect(runFacts({ ...stopped, stopped_by: undefined }, data(), NOW).map(factText)).toEqual([
            '2 min 15 s',
            'started 14:05',
        ]);
        expect(stoppedByText('user')).toBe('you');
        expect(stoppedByText('agent')).toBe('the agent');
        expect(stoppedByText(undefined)).toBeUndefined();
        expect(stoppedByText('nobody')).toBeUndefined();
    });

    it('shows the time limit of a timed out run in its head', () => {
        expect(runHeadTime(job({ state: 'failed', message: 'exit 124' }), data(), NOW)).toBe('120 min');
        expect(runHeadTime(job({ state: 'running', started_at: '2026-10-16T14:05:00.000Z' }), data(), NOW)).toBe('5:08');
        expect(
            runHeadTime(
                job({ state: 'done', started_at: '2026-10-16T14:05:00.000Z', ended_at: '2026-10-16T14:17:08.000Z' }),
                data(),
                NOW,
            ),
        ).toBe('12 min 08 s');
    });

    it('writes the note of a start and of a timed out run', () => {
        expect(startingNote('14:58', 'train.py')).toBe(
            'Approved at 14:58. train.py starts as soon as the server is ready.',
        );
        expect(startingNote(undefined, 'train.py')).toBe('train.py starts as soon as the server is ready.');
        expect(timeoutNote(120)).toBe('Stopped at the 120 min time limit.');
        expect(timeoutNote(undefined)).toBe('Stopped at the time limit.');
    });
});

describe('the log of a run', () => {
    const tail = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n');

    it('drops the empty lines a trailing newline leaves', () => {
        expect(logLines('a\nb\n')).toEqual(['a', 'b']);
        expect(logLines('')).toEqual([]);
        expect(logLines(undefined)).toEqual([]);
    });

    it('shows the last three lines while the run goes, five when it failed', () => {
        expect(shortLog('running', tail)).toEqual({ label: 'Last 3 log lines', text: 'd\ne\nf', error: false });
        expect(shortLog('failed', tail)).toEqual({ label: 'Last log lines', text: 'b\nc\nd\ne\nf', error: true });
        expect(shortLog('timeout', tail)?.label).toBe('Last log lines');
        expect(shortLog('stopped', tail)?.text).toBe('d\ne\nf');
    });

    it('shows nothing while the server starts, and nothing without a log', () => {
        expect(shortLog('starting', tail)).toBeUndefined();
        expect(shortLog('finished', tail)).toBeUndefined();
        expect(shortLog('running', undefined)).toBeUndefined();
    });

    it('names the whole log with the count the gateway delivered', () => {
        expect(fullLog(tail)).toEqual({ label: 'Log · last 6 lines', text: tail, lines: 6 });
        expect(fullLog(undefined)).toBeUndefined();
    });
});

describe('finding a job and its approval', () => {
    it('takes only the runs whose tool call belongs to the answer', () => {
        const jobs = [
            job({ id: 'w1', tool_call_id: 't1' }),
            job({ id: 'w2', tool_call_id: 't2' }),
            job({ id: 'w3', tool_call_id: 't1', kind: 'training' }),
        ];
        expect(notebookJobsOf(jobs, ['t1']).map((j) => j.id)).toEqual(['w1']);
        expect(notebookJobsOf(jobs, ['t1', 't2']).map((j) => j.id)).toEqual(['w1', 'w2']);
        expect(notebookJobsOf(jobs, [])).toEqual([]);
    });

    it('takes the approval of the job that carries the run data', () => {
        const approvals = [
            { id: 'a0', tool_call_id: 't1' },
            { id: 'a1', tool_call_id: 't1', notebook: data() },
        ];
        expect(notebookApprovalOf(approvals, job())?.id).toBe('a1');
        expect(notebookApprovalOf(approvals, job({ tool_call_id: 't9' }))).toBeUndefined();
        expect(notebookApprovalOf(undefined, job())).toBeUndefined();
        expect(notebookApprovalOf(approvals, job({ tool_call_id: undefined }))).toBeUndefined();
    });

    it('names a result file without the outputs/ prefix', () => {
        expect(outputName({ label: 'outputs/model.onnx', id: 'r1/outputs/model.onnx' })).toBe('model.onnx');
        expect(outputName({ label: 'metrics.json' })).toBe('metrics.json');
        expect(outputName({ id: 'outputs/a/b.csv' })).toBe('a/b.csv');
        expect(outputName({})).toBe('');
    });

    it('lists only files in outputs/ as results, not the entry or the launcher markers (gap L12)', () => {
        expect(isResultFile({ label: 'outputs/model.pt' })).toBe(true);
        expect(isResultFile({ id: 'r1/outputs/metrics.json' })).toBe(true);
        expect(isResultFile({ label: 'acceptance_run.py' })).toBe(false);
        expect(isResultFile({ label: '.agw/run.sh' })).toBe(false);
        expect(isResultFile({ label: 'run.log' })).toBe(false);
        expect(isResultFile({})).toBe(false);
    });

    it('takes the size of a result file, and nothing from a kind that reports none (gateway issue #92)', () => {
        expect(outputSize({ size: 16357785 })).toBe(16357785);
        expect(outputSize({ size: 0 })).toBeUndefined();
        expect(outputSize({})).toBeUndefined();
    });

    it('shows a decided approval without a run at its call, and only that one (gap L8)', () => {
        const approvals = [
            { id: 'rej', state: 'rejected', tool_call_id: 't2', notebook: data() },
            { id: 'exp', state: 'expired', tool_call_id: 't3', notebook: data() },
            { id: 'ran', state: 'approved', tool_call_id: 't1', notebook: data() },
            { id: 'pending', state: 'pending', tool_call_id: 't4', notebook: data() },
            { id: 'other', state: 'rejected', tool_call_id: 't9', notebook: data() },
            { id: 'plain', state: 'rejected', tool_call_id: 't5' },
        ];
        const decided = decidedWithoutJob(approvals, ['t1'], ['t1', 't2', 't3', 't4', 't5']);
        expect(decided.map((d) => d.approval.id)).toEqual(['rej', 'exp']);
        expect(decided[0].data.entry).toBe('train.py');
        expect(decidedWithoutJob(undefined, [], [])).toEqual([]);
    });
});
