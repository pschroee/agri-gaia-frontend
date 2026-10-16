// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The cards of pre-annotation (issue #112): the runs and jobs of a chat, the order they are placed in, the small
// helpers of the design (percent, links, shortening) and what each card shows — including the lines that are left
// out because the gateway does not store them.

import { describe, expect, it } from 'vitest';

import {
    annotationCardsIn,
    cardStateOf,
    isCvatLink,
    jobCard,
    mergeAnnotation,
    midTrunc,
    percent,
    rollbackText,
    rollbacksIn,
    runCard,
    thresholdText,
} from './annotation';
import type { AnnotationItem } from './annotation';
import type { CardView, Section } from './assess';
import type { AnnotationAnswer, AnnotationJob, AnnotationRun, Plausibility, VerifyResult } from './types';
import type { Step } from './transcript';
import type { WatchJob } from './jobs';

/** One section of a card by its kind (the builders return them in the design's order). */
const section = <K extends Section['kind']>(view: CardView, kind: K) =>
    view.sections.find((s): s is Extract<Section, { kind: K }> => s.kind === kind);

/** Every section of one kind, in the order of the card. */
const sectionsOf = <K extends Section['kind']>(view: CardView, kind: K) =>
    view.sections.filter((s): s is Extract<Section, { kind: K }> => s.kind === kind);

const NOW = Date.parse('2026-10-16T12:00:00Z');

/** A plausibility the gateway did not measure; the card then shows no details at all. */
const EMPTY_PLAUSIBILITY: Plausibility = {
    filled_images: 0,
    manual_images: 0,
    class_share_auto: {},
    class_share_manual: {},
    tvd: 0,
    empty_share_auto: 0,
    empty_share_manual: 0,
    boxes_per_image_auto: 0,
    boxes_per_image_manual: 0,
    median_rel_area_ratio: 0,
    measured: false,
};

const run = (over: Partial<AnnotationRun> = {}): AnnotationRun => ({
    run_id: 'run-1',
    dataset_id: 12,
    task_id: 318,
    function: 'yolov8-weeds',
    min_confidence: 50,
    mapping: {},
    existing: 'keep',
    state: 'running',
    created_at: '2026-10-16T11:57:46Z',
    cvat_url: 'https://cvat.example/tasks/318',
    ...over,
});

const job = (over: Partial<AnnotationJob> = {}): AnnotationJob => ({
    job_id: 'job-1',
    kind: 'calibrate',
    dataset_id: 12,
    task_id: 318,
    function: 'yolov8-weeds',
    state: 'finished',
    done: 10,
    total: 10,
    created_at: '2026-10-16T11:00:00Z',
    ended_at: '2026-10-16T11:01:02Z',
    cvat_url: 'https://cvat.example/tasks/318',
    ...over,
});

type RunItem = Extract<AnnotationItem, { what: 'run' }>;
type JobItem = Extract<AnnotationItem, { what: 'job' }>;

const runItem = (over: Partial<AnnotationRun> = {}): RunItem => {
    const r = run(over);
    return { key: r.run_id, what: 'run', run: r };
};

const jobItem = (over: Partial<AnnotationJob> = {}): JobItem => {
    const j = job(over);
    return { key: j.job_id, what: 'job', job: j };
};

const answer = (runs: AnnotationRun[] = [], jobs: AnnotationJob[] = []): AnnotationAnswer => ({
    cvat_url: 'https://cvat.example',
    runs,
    jobs,
});

const step = (over: Partial<Step> = {}): Step => ({ id: 's1', tool: 'bash', status: 'done', ...over });

const watch = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'w1',
    chat_id: 'c1',
    kind: 'annotation_run',
    ref: 'run-1',
    tool_call_id: 'call-1',
    state: 'running',
    progress: 41,
    ...over,
});

describe('the small helpers of the design', () => {
    it('rounds the percent of a job', () => {
        expect(percent(0, 100)).toBe(0);
        expect(percent(41, 100)).toBe(41);
        expect(percent(1, 3)).toBe(33);
        expect(percent(100, 100)).toBe(100);
        expect(percent(5, 0)).toBeNull();
        expect(percent(undefined, 10)).toBeNull();
    });

    it('opens only CVAT links', () => {
        const base = 'https://cvat.example';
        expect(isCvatLink('https://cvat.example/tasks/318', base)).toBe(true);
        expect(isCvatLink('https://cvat.example/tasks/318', `${base}/`)).toBe(true);
        // a foreign host that merely begins with the base is none
        expect(isCvatLink('https://cvat.example.evil/tasks/1', base)).toBe(false);
        expect(isCvatLink('javascript:alert(1)', base)).toBe(false);
        expect(isCvatLink('https://cvat.example/tasks/1', 'https://cvat.example/other')).toBe(false);
        expect(isCvatLink('https://cvat.example/tasks/1', '')).toBe(false);
    });

    it('shortens only a long file name and keeps its end', () => {
        expect(midTrunc('a.jpg')).toEqual({ head: 'a.jpg', tail: '' });
        expect(midTrunc('12345678901234567890')).toEqual({ head: '12345678901234567890', tail: '' });
        const file = 'field-07_row-12_2026-06-14T09-41-27_cam-left_DJI_0412.jpg';
        const cut = midTrunc(file);
        expect(cut.tail).toBe('DJI_0412.jpg');
        expect(cut.head + cut.tail).toBe(file);
    });

    it('writes a threshold the gateway stores in whole percent as a share', () => {
        expect(thresholdText(45)).toBe('0.45');
        expect(thresholdText(undefined)).toBe('–');
    });

    it('writes the line of a rollback', () => {
        expect(rollbackText({ deleted: 4, changed_kept: 0, frames_emptied: 3 })).toBe(
            'Rolled back 4 auto annotations · 3 images emptied',
        );
        expect(rollbackText({ deleted: 4, changed_kept: 2, frames_emptied: 3 })).toBe(
            'Rolled back 4 auto annotations · 3 images emptied · 2 changed by hand, kept',
        );
    });
});

describe('the runs and jobs of a chat', () => {
    it('takes the state of the row', () => {
        expect(cardStateOf(runItem({ state: 'queued' }))).toBe('queued');
        expect(cardStateOf(runItem({ state: 'expired' }))).toBe('expired');
        expect(cardStateOf(jobItem({ kind: 'fill', state: 'running' }))).toBe('running');
        expect(cardStateOf(jobItem({ kind: 'fill', state: 'failed' }))).toBe('failed');
    });

    it('orders the runs and jobs of a chat oldest first', () => {
        const items = mergeAnnotation(
            answer(
                [run({ run_id: 'run-2', created_at: '2026-10-16T11:00:00Z' })],
                [job({ job_id: 'job-1', created_at: '2026-10-16T09:00:00Z' })],
            ),
        );
        expect(items.map((i) => i.key)).toEqual(['job-1', 'run-2']);
    });

    it('hangs the observation of a run on its card', () => {
        const items = mergeAnnotation(answer([run()]), [watch()]);
        expect(items[0].what).toBe('run');
        expect(items[0].what === 'run' && items[0].watch?.id).toBe('w1');
    });

    it('reads a rollback out of the calls and hangs it on the run it took back', () => {
        const taken = step({
            result: {
                isError: false,
                text: 'HTTP 200\n{"source_id":"run-1","scope":"all","deleted":4,"changed_kept":2,"frames_emptied":3}',
            },
        });
        expect(rollbacksIn([taken]).get('run-1')).toEqual({ deleted: 4, changed_kept: 2, frames_emptied: 3 });
        const items = mergeAnnotation(answer([run()]), [], [taken]);
        expect(items[0].rollback?.deleted).toBe(4);
    });

    it('places every card at the call that started it', () => {
        const steps = [step({ id: 's1', callId: 'call-1' }), step({ id: 's2', callId: 'call-2' })];
        const items = mergeAnnotation(answer([run({ tool_call_id: 'call-2' })], [job({ tool_call_id: 'call-1' })]));
        const placed = annotationCardsIn(steps, items);
        expect(placed.map((p) => p.key)).toEqual(['s1', 's2']);
        expect(placed[0].item.key).toBe('job-1');
    });
});

describe('the card of a run', () => {
    const BASE = 'https://cvat.example';

    it('waits for CVAT while it queues', () => {
        const view = runCard(runItem({ state: 'queued', created_at: '2026-10-16T11:59:48Z' }), BASE, NOW);
        const progress = section(view, 'progress')!;
        expect(progress.percent).toBeNull();
        expect(progress.left).toBe('Waiting for CVAT to start the job');
        expect(progress.right).toBe('queued 0:12');
        expect(view.status).toBe('queued · 0:12');
        expect(view.effect).toBe('compute');
        expect(view.subtitle[0]).toEqual([{ text: 'yolov8-weeds', mono: true }, { text: ' on ' }, { text: '#12' }]);
        expect(section(view, 'link')?.pre).toBe('CVAT task #318');
    });

    it('shows the percent while it runs and no frame numbers', () => {
        const view = runCard(runItem({ state: 'running', progress: 41, created_at: '2026-10-16T11:57:46Z' }), BASE, NOW);
        const progress = section(view, 'progress')!;
        expect(progress.percent).toBe(41);
        expect(progress.left).toBe('41 %');
        expect(progress.right).toBe('2:14 elapsed');
        expect(view.status).toBe('running · 2:14');
        // the watcher keeps a percent, not frames: the card does not claim a frame count
        expect(JSON.stringify(view)).not.toMatch(/frame \d+/);
    });

    it('warns about a run that replaces the annotations of the task', () => {
        const view = runCard(runItem({ state: 'running', existing: 'replace' }), BASE, NOW);
        expect(view.effect).toBe('irreversible');
        // how many annotations it wipes is not stored, so the warning stays general
        expect(section(view, 'warn')?.text).toBe('Replaces the existing annotations on these frames (irreversible).');
    });

    it('names the task of a finished run and leaves the counts to the agent', () => {
        const view = runCard(runItem({ state: 'finished', ended_at: '2026-10-16T12:00:00Z' }), BASE, NOW);
        expect(view.status).toBe('finished · 2:14');
        expect(view.statusColor).toBe('success');
        // no table: counting a finished run's annotations would be a CVAT call of its own
        expect(section(view, 'table')).toBeUndefined();
        expect(section(view, 'link')?.pre).toBe('CVAT task #318');
        expect(section(view, 'hint')?.text).toContain('Write back to dataset');
    });

    it('shows the error of a failed run', () => {
        const view = runCard(
            runItem({ state: 'failed', error: 'CVAT returned 502 Bad Gateway while calling the function', ended_at: '2026-10-16T12:00:00Z' }),
            BASE,
            NOW,
        );
        expect(view.accent).toBe('error.main');
        expect(section(view, 'kv')?.rows).toEqual([{ label: 'Ran for', value: '2:14' }]);
        expect(section(view, 'error')?.text).toContain('502 Bad Gateway');
    });

    it('says what it can about a run CVAT no longer has', () => {
        const view = runCard(runItem({ state: 'expired', created_at: '2026-10-16T09:12:00Z' }), BASE, NOW);
        expect(view.status).toBe('expired');
        expect(view.accent).toBe('grey.400');
        expect(section(view, 'kv')?.rows).toEqual([{ label: 'Started', value: 'today, 09:12' }]);
        const hints = sectionsOf(view, 'hint');
        expect(hints).toHaveLength(2);
        // how long CVAT keeps a run is not documented, so the card claims nothing about it
        expect(JSON.stringify(view)).not.toContain('24 hours');
    });

    it('offers no link without a CVAT base', () => {
        const view = runCard(runItem({ state: 'finished' }), '', NOW);
        expect(section(view, 'link')?.url).toBeUndefined();
        expect(section(view, 'link')?.pre).toBe('CVAT task #318');
    });

    it('shows the rollback line of the run it took back', () => {
        const item: RunItem = runItem();
        item.rollback = { deleted: 4, changed_kept: 0, frames_emptied: 3 };
        const view = runCard(item, BASE, NOW);
        expect(sectionsOf(view, 'hint').map((s) => s.text)).toContain(
            'Rolled back 4 auto annotations · 3 images emptied',
        );
    });
});

describe('the cards of the check jobs', () => {
    const BASE = 'https://cvat.example';

    it('shows the calibration with its mapping and its proposed threshold', () => {
        const view = jobCard(
            jobItem({
                kind: 'calibrate',
                result: {
                    images: 10,
                    mapping: { beet: 'sugar_beet' },
                    confusion: { beet: { sugar_beet: 9 }, soil_crust: {} },
                    accuracy: null,
                    precision: 0.96,
                    recall: 0.93,
                    f1: 0.94,
                    proposed_min_confidence: 45,
                    coverage: 0.8,
                    note: '',
                },
            }),
            BASE,
            NOW,
        );
        expect(view.title).toBe('Annotation check');
        expect(view.kindLabel).toBe(' · Calibrate');
        // every check of pre-annotation is a compute call, whatever the design's draft chips said
        expect(view.effect).toBe('compute');
        expect(section(view, 'sample')).toMatchObject({ text: 'Measured on 10 manually annotated images', sub: 'calibration set' });
        const table = section(view, 'table')!;
        expect(table.columns.map((c) => c.text)).toEqual(['Function label → class', 'Images']);
        expect(table.rows[0].map((c) => c.text)).toEqual(['beet → sugar_beet', '9']);
        expect(table.rows[1].map((c) => c.text)).toEqual(['soil_crust', 'not mapped']);
        const kv = section(view, 'kv')!;
        expect(kv.boldLabels).toEqual(['Proposed min. confidence']);
        expect(kv.rows.find((r) => r.label === 'Proposed min. confidence')?.value).toBe('0.45');
        expect(kv.rows.find((r) => r.label === 'Mean F1 at 0.45')?.value).toBe('0.94');
    });

    it('lists the uncertain images lowest confidence first', () => {
        const view = jobCard(
            jobItem({
                kind: 'uncertain',
                params: { uncertain_below: 45 },
                result: {
                    checked: 200,
                    uncertain: [
                        { frame: 1, file: 'a.jpg', top_label: 'beet', confidence: 0.42, boxes: 1 },
                        { frame: 2, file: 'b.jpg', top_label: 'weed', confidence: 0.31, boxes: 2 },
                        { frame: 3, file: 'c.jpg', top_label: 'weed', confidence: 0.36, boxes: 0 },
                        { frame: 4, file: 'd.jpg', top_label: 'beet', confidence: 0.39, boxes: 1 },
                        { frame: 5, file: 'e.jpg', top_label: 'beet', confidence: 0.44, boxes: 1 },
                        { frame: 6, file: 'f.jpg', top_label: 'stone', confidence: 0.34, boxes: 3 },
                    ],
                },
            }),
            BASE,
            NOW,
        );
        expect(section(view, 'sample')).toMatchObject({
            text: '6 uncertain images',
            sub: 'top confidence below 0.45 · measured on 200 images',
        });
        const images = section(view, 'images')!;
        expect(images.title).toBe('Lowest confidence first');
        expect(images.rows.map((r) => r.confidence)).toEqual([0.31, 0.34, 0.36, 0.39, 0.42, 0.44]);
        expect(images.more).toBe('Show all 6');
        // the bar turns to the warning colour under the threshold of the check
        expect(images.rows[0].threshold).toBe(0.45);
    });

    it('counts what a fill wrote, left alone and found nothing on', () => {
        const view = jobCard(
            jobItem({
                kind: 'fill',
                params: { min_confidence: 45 },
                result: { filled: 186, skipped_annotated: 42, empty_results: 9 },
            }),
            BASE,
            NOW,
        );
        const table = section(view, 'table')!;
        expect(table.rows.map((r) => r.map((c) => c.text))).toEqual([
            ['Filled · 186 new annotations', '186'],
            ['Skipped · already annotated', '42'],
            ['Empty · no detection above 0.45', '9'],
            ['Total', '237'],
        ]);
        expect(section(view, 'link')?.pre).toBe('CVAT task #318');
    });

    it('shows a running fill with the images that carry no annotation', () => {
        const view = jobCard(jobItem({ kind: 'fill', state: 'running', done: 120, total: 237 }), BASE, NOW);
        const progress = section(view, 'progress')!;
        expect(progress.left).toBe('51 % · image 120 of 237');
        expect(section(view, 'link')?.pre).toBe('CVAT task #318 · 237 images without annotations');
    });

    it('shows a verification with its verdict, its figures and its round', () => {
        const result: VerifyResult = {
            kind: 'annotation',
            verdict: 'questionable',
            final: false,
            set: 'validation',
            measured_images: 12,
            image_review: { done: true, model: 'Qwen2.5-VL 72B', checked: 12 },
            reasons: ['Recall for weed is 0.62, below the limit of 0.50.', 'A second reason.'],
            hints: ['stop: no improvement'],
            suggestions: [{ id: 'remap', text: 'map the labels again' }],
            header: 'Result: questionable (validation images, image review with Qwen2.5-VL 72B)',
            source_id: 'run-1',
            calibration_images: 10,
            per_class: {
                '3': { precision: 0.91, recall: 0.94, f1: 0.92, support: 212, below: [] },
                '7': { precision: 0.8, recall: 0.62, f1: 0.7, support: 148, below: ['recall'] },
            },
            overall: { accuracy: 0.86 },
            plausibility: {
                filled_images: 4,
                manual_images: 3,
                class_share_auto: {},
                class_share_manual: {},
                tvd: 0.1,
                empty_share_auto: 0,
                empty_share_manual: 0,
                boxes_per_image_auto: 1,
                boxes_per_image_manual: 1,
                median_rel_area_ratio: 1,
                measured: true,
            },
            suspicious: [{ frame: 5, file: 'field-03_row-05.jpg', reason: '3 weeds missed' }],
            round: 2,
            previous: { source_id: 'run-1', round: 1, verdict: 'questionable', score: 0.7 },
            delta: { score: 0.13, per_class_f1: { '7': 0.13 } },
        };
        const view = jobCard(jobItem({ kind: 'verify', result }), BASE, NOW);
        expect(section(view, 'round')?.text).toBe('Round 2 of 3');
        expect(section(view, 'verdict')).toMatchObject({ header: 'Result: questionable (validation images, image review with Qwen2.5-VL 72B)' });
        expect(view.accent).toBe('warning.main');
        expect(section(view, 'sample')).toMatchObject({
            text: 'Measured on 12 validation images',
            sub: 'Image review: 12 filled images checked',
        });
        expect(section(view, 'mode')?.text).toBe('Statistics and image review (Qwen2.5-VL 72B)');
        // a classification carries the images and no F1 column (L15)
        const table = section(view, 'table')!;
        expect(table.columns.map((c) => c.text)).toEqual(['Class', 'Images', 'Precision', 'Recall']);
        expect(section(view, 'kv')?.rows).toEqual([{ label: 'Accuracy', value: '0.86' }]);
        const reasons = sectionsOf(view, 'list');
        expect(reasons.map((s) => s.title)).toEqual(['Reasons', 'Hints', 'Suggestions']);
        expect(section(view, 'images')?.rows[0].note).toBe('3 weeds missed');
    });

    it('leaves the first reason out of a report that carries it in its header', () => {
        const result = {
            kind: 'annotation',
            verdict: 'not_measured',
            final: true,
            set: 'holdout',
            measured_images: 12,
            image_review: { done: false },
            reasons: ['too few held-out images (12 of at least 20)'],
            hints: ['Too few held-out images (12 of at least 20)'],
            header: 'Result: not measured – too few held-out images (12 of at least 20)',
            source_id: 'run-1',
            calibration_images: 10,
            per_class: {},
            overall: { accuracy: 0.5, macro_f1: 0.4 },
            plausibility: EMPTY_PLAUSIBILITY,
            suspicious: [],
        } as unknown as VerifyResult;
        const view = jobCard(jobItem({ kind: 'verify', result }), BASE, NOW);
        expect(section(view, 'verdict')?.view.label).toBe('Not measured');
        const lists = sectionsOf(view, 'list');
        // only the hint stands there; the header already carries the reason (D10)
        expect(lists.map((s) => s.title)).toEqual(['Hints']);
        expect(section(view, 'table')).toBeUndefined();
    });
});
