// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { WatchJob } from './jobs';
import { historyRows, phasesOf } from './stepHistory';

const NOW = Date.parse('2026-10-27T10:20:00.000Z');
const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'platform_task',
    state: 'running',
    ...over,
});

describe('phasesOf', () => {
    it('lists the phases per kind and none where they are not known', () => {
        expect(phasesOf('image_build', false)).toEqual([
            'Preparing the build',
            'Building the image',
            'Pushing the image to the registry',
        ]);
        expect(phasesOf('platform_task', true).at(-1)).toBe('Creating the training container');
        expect(phasesOf('platform_task', false)).toEqual([]);
        expect(phasesOf('training_run', false)).toEqual([]);
    });
});

describe('historyRows', () => {
    it('reads the backend build phase "· step n/m · cmd" as one phase and shows the latest line (#247 wording)', () => {
        const rows = historyRows(
            job({
                message: 'Building the image · step 5/9 · RUN pip install -r requirements.txt',
                history: [
                    { at: '2026-10-27T10:00:00.000Z', text: 'Preparing the build' },
                    { at: '2026-10-27T10:02:00.000Z', text: 'Building the image · step 1/9 · FROM python:3.10' },
                ],
            }),
            NOW,
            { trainingBuild: true },
        );
        expect(rows.map((r) => [r.text, r.state])).toEqual([
            ['Preparing the build', 'done'],
            ['Building the image · step 5/9 · RUN pip install -r requirements.txt', 'running'],
            ['Pushing the image to the registry', 'pending'],
            ['Creating the training container', 'pending'],
        ]);
    });

    it('has no rows without history', () => {
        expect(historyRows(undefined, NOW)).toEqual([]);
        expect(historyRows(job(), NOW)).toEqual([]);
        expect(historyRows(job({ history: [] }), NOW)).toEqual([]);
    });

    it('marks done, current and pending phases in order', () => {
        const rows = historyRows(
            job({
                history: [
                    { at: '2026-10-27T10:00:00.000Z', text: 'Preparing the build' },
                    { at: '2026-10-27T10:02:00.000Z', text: 'Building the image (step 3/9)', percent: 30 },
                ],
            }),
            NOW,
            { trainingBuild: true },
        );
        expect(rows.map((r) => [r.text, r.state])).toEqual([
            ['Preparing the build', 'done'],
            ['Building the image (step 3/9)', 'running'],
            ['Pushing the image to the registry', 'pending'],
            ['Creating the training container', 'pending'],
        ]);
        expect(rows[1].percent).toBe(30);
        expect(rows[1].when).toBe('18 min'); // how long the current phase lasts
        expect(rows[0].when).toMatch(/^\d\d:\d\d:\d\d$/);
        expect(rows[2].when).toBe('');
    });

    it('marks every phase done once the job ended and adds no pending ones', () => {
        const rows = historyRows(
            job({
                state: 'done',
                history: [
                    { at: '2026-10-27T10:00:00.000Z', text: 'Preparing the build' },
                    { at: '2026-10-27T10:02:00.000Z', text: 'Pushing the image to the registry' },
                ],
            }),
            NOW,
            { trainingBuild: true },
        );
        expect(rows.map((r) => r.state)).toEqual(['done', 'done']);
    });

    it('survives an entry without a usable time or text', () => {
        const rows = historyRows(
            job({ history: [{ at: 'nonsense', text: 'Preparing the build' }, { at: '', text: ' ' }] }),
            NOW,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].when).toBe('');
    });

    it('reads "Train Container #N created." as the last phase: a build from the cache leaves nothing pending (B27)', () => {
        const rows = historyRows(
            job({
                message: 'Train Container #179 created.',
                history: [{ at: '2026-10-27T10:19:50.000Z', text: 'Train Container #179 created.' }],
            }),
            NOW,
            { trainingBuild: true },
        );
        expect(rows.map((r) => r.state)).toEqual(['running']);
        expect(rows[0].text).toBe('Train Container #179 created.');
    });

    it('shows an entry that repeats the one before only once, with the earlier time (B27)', () => {
        const rows = historyRows(
            job({
                state: 'done',
                history: [
                    { at: '2026-10-27T10:19:27.000Z', text: 'Train Container #179 created.' },
                    { at: '2026-10-27T10:19:42.000Z', text: 'Train Container #179 created.' },
                ],
            }),
            NOW,
            { trainingBuild: true },
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].state).toBe('done');
    });
});
