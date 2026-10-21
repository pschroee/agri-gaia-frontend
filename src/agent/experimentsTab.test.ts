// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    ALL_RUNS,
    compareCaption,
    compareData,
    curveCaption,
    curveData,
    defaultShow,
    fixedSettings,
    gpuCaption,
    gpuData,
    groupRows,
    proposedCount,
    resolveShow,
    rowMenu,
    rowsOf,
    showOptions,
    sourceText,
    spaceColumns,
    trialLink,
    trialTitle,
} from './experimentsTab';
import { epochRows, lossSearch, lossTrials, makeSearch, makeTrial, trials } from './experimentsFixtures';
import { bestTrialOf } from './searchView';

describe('show choice', () => {
    const running = makeSearch();
    const ended = makeSearch({ id: 's0', title: 'old', state: 'ended', created_at: '2026-10-19T08:00:00Z' });
    const proposed = makeSearch({ id: 's9', state: 'proposed' });
    const refused = makeSearch({ id: 's8', state: 'rejected' });

    it('lists running and ended searches, the running one first, plus all runs; proposed and refused are not listed (G9)', () => {
        const opts = showOptions([ended, proposed, running, refused], trials());
        expect(opts.map((o) => o.value)).toEqual(['s1', 's0', ALL_RUNS]);
        expect(opts[0].label).toBe('Training search · tf-flowers (running)');
        expect(opts[1].label).toBe('Training search · old (ended)');
    });

    it('counts the searches that wait for approval as a chip, not a row', () => {
        expect(proposedCount([running, proposed, proposed])).toBe(2);
    });

    it('defaults to the running search, else the newest ended one, else all runs; a vanished choice falls back', () => {
        expect(defaultShow([ended, running])).toBe('s1');
        expect(defaultShow([ended])).toBe('s0');
        expect(defaultShow([])).toBe(ALL_RUNS);
        expect(resolveShow('gone', [running])).toBe('s1');
        expect(resolveShow(ALL_RUNS, [running])).toBe(ALL_RUNS);
        expect(resolveShow('s0', [ended, running])).toBe('s0');
    });
});

describe('table', () => {
    it('takes the columns strictly from the space, in its order, with real names (G9, G12)', () => {
        expect(spaceColumns(makeSearch())).toEqual(['learning_rate', 'batch_size', 'epochs', 'img_size']);
        expect(spaceColumns(undefined)).toEqual([]);
    });

    it('writes the fixed settings as the base without the searched keys (G19)', () => {
        // epochs is searched, so it is not fixed
        expect(fixedSettings(makeSearch())).toBe('pretrained yes · optimizer AdamW');
        expect(fixedSettings(makeSearch({ base: undefined, path: 'notebook' }))).toBe('');
    });

    it('marks the best and the winner and labels single runs S<seq> in all runs', () => {
        const s = makeSearch({ state: 'ended', winner_idx: 2 });
        const all = [...trials(), makeTrial(1, { id: 'x1', search_id: undefined, idx: 0, seq: 7 })];
        const rows = rowsOf(s, all, bestTrialOf(s, trials()));
        expect(rows.map((r) => [r.label, r.best, r.winner])).toEqual([
            ['1', false, false],
            ['2', true, true],
            ['3', false, false],
            ['4', false, false],
        ]);
        const groups = groupRows([s], all, bestTrialOf);
        expect(groups.map((g) => g.key)).toEqual(['s1', 'single']);
        expect(groups[1].rows[0].label).toBe('S7');
    });

    it('leaves a search without trials out of all runs', () => {
        expect(groupRows([makeSearch()], [], bestTrialOf)).toEqual([]);
    });

    it('titles a trial with the architecture only when it has one (G9)', () => {
        expect(trialTitle(makeTrial(4))).toBe('Trial 4');
        expect(trialTitle(makeTrial(4, { params: { architecture: 'resnet18' } }))).toBe('Trial 4 · resnet18');
        expect(trialTitle(makeTrial(0, { idx: 0, seq: 3, search_id: undefined }))).toBe('Single run 3');
    });

    it('offers Adopt only for a finished trial of a running search and Stop only for the open one (G8)', () => {
        const s = makeSearch();
        const [t1, , , t4] = rowsOf(s, trials());
        expect(rowMenu(t1, s)).toEqual({ adopt: true, stop: false });
        expect(rowMenu(t4, s)).toEqual({ adopt: false, stop: true });
        expect(rowMenu(t1, makeSearch({ state: 'ended' }))).toEqual({ adopt: false, stop: false });
        expect(rowMenu({ ...t1, trial: makeTrial(0, { idx: 0 }) }, undefined)).toEqual({ adopt: false, stop: false });
    });
});

describe('comparison chart', () => {
    it('runs "best so far" in the direction of the objective, failed trials do not count (G7)', () => {
        const s = makeSearch();
        const list = [...trials().slice(0, 3), makeTrial(4, { state: 'failed', score: undefined })];
        const data = compareData(s, list, bestTrialOf(s, list));
        expect(data.map((d) => d.bestSoFar)).toEqual([0.71, 0.86, 0.86, 0.86]);
        expect(data[3].failed).toBe(true);
        expect(data[3].score).toBeUndefined();
        expect(data[1].best).toBe(true);
    });

    it('takes the lowest value as best for a val_loss search (G7)', () => {
        const s = lossSearch();
        const list = lossTrials();
        expect(compareData(s, list, bestTrialOf(s, list)).map((d) => d.bestSoFar)).toEqual([0.52, 0.41, 0.41]);
        expect(compareCaption(s, list, bestTrialOf(s, list))).toContain('Validation loss per trial. Best so far: trial 2 with 0.410.');
    });

    it('shows a running trial as a bar but not in best-so-far', () => {
        const s = makeSearch();
        const data = compareData(s, trials(), bestTrialOf(s, trials()));
        expect(data[3].running).toBe(true);
        expect(data[3].score).toBe(0.62);
        expect(data[3].bestSoFar).toBe(0.86);
    });

    it('writes every value as words, with the target', () => {
        const s = makeSearch();
        const text = compareCaption(s, trials(), bestTrialOf(s, trials()));
        expect(text).toContain('Best so far: trial 2 with 0.86.');
        expect(text).toContain('Trial 4 is running (0.62 at epoch 7)');
        expect(text).toContain('trials 1 and 3 reached 0.71, 0.83');
        expect(text).toContain('Target 0.9 not reached.');
    });
});

describe('curves', () => {
    it('builds the rows of a kind and drops rows without a value; no value at all gives no chart', () => {
        const rows = epochRows(3);
        expect(curveData(rows, 'loss')).toHaveLength(3);
        expect(curveData([{ epoch: 1, val_loss: 1 }], 'acc')).toEqual([]);
    });

    it('captions the last value and the best validation value (lowest loss, highest accuracy)', () => {
        const rows = epochRows(7);
        expect(curveCaption(curveData(rows, 'loss'), 'loss')).toBe(
            'Last (epoch 7): training 1.180, validation 1.340 · lowest validation 1.340 (epoch 7)',
        );
        expect(curveCaption(curveData(rows, 'acc'), 'acc')).toBe('Last (epoch 7): training 0.58, validation 0.53 · best validation 0.53 (epoch 7)');
        expect(curveCaption([], 'acc')).toBe('');
    });

    it('turns GPU samples into minutes, GB and a caption (now while running, range afterwards)', () => {
        const pts = [
            { at: '2026-10-20T10:00:00Z', util: 80, mem_used_mb: 10240, mem_total_mb: 32768 },
            { at: '2026-10-20T10:05:00Z', util: 90, mem_used_mb: 11264, mem_total_mb: 32768 },
        ];
        const { rows, totalGb } = gpuData(pts);
        expect(rows.map((r) => [r.min, r.util, r.memGb])).toEqual([
            [0, 80, 10],
            [5, 90, 11],
        ]);
        expect(totalGb).toBe(32);
        expect(gpuCaption(rows, totalGb, true)).toBe('Now: utilisation 90 %, memory 11 of 32 GB · peak 90 %');
        expect(gpuCaption(rows, totalGb, false)).toBe('Range: utilisation 80–90 %, memory 10–11 of 32 GB');
        expect(gpuData([]).rows).toEqual([]);
    });

    it('says where the figures come from', () => {
        expect(sourceText(makeTrial(1), makeSearch())).toBe('Figures written by the platform template');
        const nb = makeSearch({ path: 'notebook', code: { version: 1, entry: 'train.py', files: [{ name: 'train.py', sha256: '3f9a' + '0'.repeat(56) + 'c21e', size: 10 }] } });
        expect(sourceText(makeTrial(1, { path: 'notebook', code_version: 1 }), nb)).toBe("Figures written by the run's code (code version 1, 3f9a…c21e)");
    });
});

describe('trial link and name (issue #194)', () => {
    it('accepts https addresses only', () => {
        expect(trialLink({ link: 'https://hub.example/lab' })).toBe('https://hub.example/lab');
        expect(trialLink({ link: 'javascript:alert(1)' })).toBeUndefined();
        expect(trialLink({ link: 'http://hub.example/lab' })).toBeUndefined();
        expect(trialLink({ link: '' })).toBeUndefined();
        expect(trialLink({})).toBeUndefined();
    });

    it('offers Open only with a link and names a single run', () => {
        const t = makeTrial(0, { idx: 0, seq: 2, search_id: undefined, name: 'train.ipynb', link: 'https://hub.example/x' });
        expect(rowMenu({ trial: t, label: 'S2', best: false, winner: false } as never, undefined).open).toBe(true);
        expect(rowMenu({ trial: { ...t, link: undefined }, label: 'S2', best: false, winner: false } as never, undefined).open).toBe(false);
        expect(trialTitle(t)).toBe('Single run 2 · train.ipynb');
    });
});
