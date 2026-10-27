// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The check cards of the gateway (issue #112): the numbers and times, the wording of a report, the state of a
// check and the figures of the three kinds. Everything here is pure — the card only puts it together.

import { describe, expect, it } from 'vitest';

import {
    basicChecks,
    checkCard,
    checkCardState,
    checkIdOfStep,
    checkImageReviewLine,
    checkSubtitle,
    classRows,
    compareRows,
    confusionView,
    sampleTip,
    deploymentRows,
    fmt2,
    fmtDiff,
    fmtDuration,
    fmtNum,
    fmtP,
    fmtStarted,
    imageReviewLine,
    mergeChecks,
    modeLine,
    modelCheckText,
    platformFigure,
    preprocessText,
    progressReviewText,
    progressStepRows,
    sampleText,
    verdictView,
    visibleReasons,
} from './assess';
import type { CardView, CheckItem, Section } from './assess';
import type { AssessCheck, DeploymentFigures, OwnModelFigures, TrainingFigures } from './types';
import type { Step } from './transcript';
import type { WatchJob } from './jobs';

/** One section of a card by its kind (the builders return them in the design's order). */
const section = <K extends Section['kind']>(view: CardView, kind: K) =>
    view.sections.find((s): s is Extract<Section, { kind: K }> => s.kind === kind);

const step = (over: Partial<Step> = {}): Step => ({ id: 's1', tool: 'bash', status: 'done', ...over });

/** A tool result text as the transcript stores it. */
const result = (text: string) => ({ isError: false, text });

const check = (over: Partial<AssessCheck> = {}): AssessCheck => ({
    check_id: 'chk-1',
    kind: 'training_model',
    subject: 'model:7',
    final: true,
    state: 'finished',
    report: null,
    created_at: '2026-10-16T10:00:00Z',
    ...over,
});

const watch = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'assessment',
    ref: 'chk-1',
    state: 'running',
    ...over,
});

/** A training report the way R1 writes it. */
const trainingCheck = (): AssessCheck =>
    check({
        ended_at: '2026-10-16T10:01:05Z',
        started_at: '2026-10-16T10:00:00Z',
        report: {
            kind: 'training_model',
            verdict: 'usable',
            final: true,
            set: 'holdout',
            measured_images: 24,
            image_review: { done: false, reason: 'no vision model in this chat' },
            reasons: ['F1 is 0.82 or higher for every class.'],
            hints: ['likely overfitting: the seen accuracy is far above the held-out one'],
            suggestions: [{ id: 'more_epochs', text: 'train longer' }],
            figures: {
                model: { id: 7, name: 'yolov8-weeds-ft' },
                eval_dataset: { id: 41, name: 'mnist-check-120' },
                seen_datasets: [{ id: 12, name: 'mnist-train' }],
                measured_images: 24,
                per_class: {
                    '3': { precision: 0.95, recall: 0.93, f1: 0.94, support: 212 },
                    '7': { precision: null, recall: 0.4, f1: 0.4, support: 9, below: ['recall'] },
                },
                overall: { accuracy: 0.92, macro_f1: 0.91 },
                baseline: { kind: 'majority', class: '3', accuracy: 0.5, macro_f1: 0.33, p_value: 0.00014 },
                seen_sample: { images: 96, accuracy: 0.99 },
                mapping: { '3': '3', '7': '7' },
                platform_figure: { name: 'MulticlassAccuracy', value: 0.92, source: 'training log', note: '' },
            },
            note: 'Images of dataset mnist-check-120 that the model did not see.',
            header: 'Result: usable (held-out images, statistics only, no image review)',
        },
    });

describe('numbers, times and words', () => {
    it('writes integers with a thin space as thousands separator', () => {
        expect(fmtNum(999)).toBe('999');
        expect(fmtNum(1000)).toBe('1 000');
        expect(fmtNum(2870)).toBe('2 870');
    });

    it('writes figures with two decimals and a missing one as the dash', () => {
        expect(fmt2(0.923)).toBe('0.92');
        expect(fmt2(null)).toBe('–');
        expect(fmt2(undefined)).toBe('–');
    });

    it('writes a p value with two significant digits', () => {
        expect(fmtP(0.42)).toBe('p = 0.42');
        expect(fmtP(0.00014)).toBe('p = 0.00014');
        expect(fmtP(1)).toBe('p = 1.0');
        expect(fmtP(0.00002)).toBe('p < 0.0001');
    });

    it('writes a difference below 0.01 in exponential form', () => {
        expect(fmtDiff(0.0000031)).toBe('3.1e-6');
        expect(fmtDiff(0.41)).toBe('0.41');
        expect(fmtDiff(null)).toBe('–');
    });

    it('writes durations as m:ss and from an hour as h:mm:ss', () => {
        expect(fmtDuration(65)).toBe('1:05');
        expect(fmtDuration(600)).toBe('10:00');
        expect(fmtDuration(3600)).toBe('1:00:00');
    });

    it('writes a moment as today, yesterday or the date', () => {
        const now = Date.parse('2026-10-16T12:00:00');
        expect(fmtStarted('2026-10-16T09:12:00', now)).toBe('today, 09:12');
        expect(fmtStarted('2026-10-15T09:12:00', now)).toBe('yesterday, 09:12');
        expect(fmtStarted('2026-10-12T09:12:00', now)).toBe('12.10.2026, 09:12');
    });
});

describe('the shell of a report', () => {
    it('names the verdict of every chip', () => {
        expect(verdictView('usable')).toMatchObject({ label: 'Usable', color: 'success' });
        expect(verdictView('questionable')).toMatchObject({ label: 'Questionable', color: 'warning' });
        expect(verdictView('not_measured')).toMatchObject({ label: 'Not measured', color: 'default' });
        expect(verdictView('')).toBeUndefined();
    });

    it('names the set the sample rests on', () => {
        expect(sampleText('holdout', 24)).toBe('Measured on 24 held-out images');
        expect(sampleText('validation', 12)).toBe('Measured on 12 validation images');
        expect(sampleText('synthetic', 6)).toBe('6 synthetic test requests');
    });

    it('leaves the first reason away when it stands in the header', () => {
        const report = trainingCheck().report!;
        expect(visibleReasons({ ...report, verdict: 'usable' })).toEqual(report.reasons);
        expect(visibleReasons({ ...report, verdict: 'not_measured', reasons: ['too few held-out images (12 of at least 20)', 'second'] })).toEqual([
            'second',
        ]);
    });

    it('tells whether a model looked at the images', () => {
        const report = trainingCheck().report!;
        expect(modeLine(report)).toMatchObject({ text: 'Statistics only, no image review', icon: 'stats' });
        expect(modeLine(report).reason).toBe('no vision model in this chat');
        expect(modeLine({ ...report, image_review: { done: true, model: 'Qwen2.5-VL 72B', checked: 12 } })).toMatchObject({
            text: 'Statistics and image review (Qwen2.5-VL 72B)',
            icon: 'image',
        });
    });

    it('names the reviewed images only when the gateway reports them', () => {
        const report = trainingCheck().report!;
        expect(imageReviewLine(report)).toBeUndefined();
        expect(imageReviewLine({ ...report, image_review: { done: true, checked: 12 } })).toBe(
            'Image review: 12 filled images checked',
        );
        expect(imageReviewLine({ ...report, image_review: { done: true, checked: 12, flagged_share: 0.25 } })).toBe(
            'Image review: 12 filled images checked, 3 flagged',
        );
    });

    it('leaves the image review line of a result check out when no review ran', () => {
        const report = trainingCheck().report!;
        // done: false carries a reason for the mode line, never a line of its own — no "0 of 0"
        expect(checkImageReviewLine(report)).toBeUndefined();
        expect(
            checkImageReviewLine({ ...report, image_review: { done: false, reason: 'the dataset name is not allowed' } }),
        ).toBeUndefined();
        // a report without the figures of the review is not guessed either
        expect(checkImageReviewLine({ ...report, image_review: { done: true, checked: 4 } })).toBeUndefined();
    });

    it('names what the image review of a result check found', () => {
        const report = trainingCheck().report!;
        expect(
            checkImageReviewLine({
                ...report,
                image_review: { done: true, model: 'deepseek-flash', of: 12, checked: 4, flagged: 2 },
            }),
        ).toBe('Image review: 4 of 12 misclassified validation images checked, 2 flagged');
        expect(
            checkImageReviewLine({ ...report, image_review: { done: true, model: 'deepseek-flash', of: 4, checked: 4 } }),
        ).toBe('Image review: 4 of 4 misclassified validation images checked');
    });
});

describe('the figures of a check', () => {
    it('keeps the class order of the gateway and names what is below its limit', () => {
        const rows = classRows((trainingCheck().report!.figures as TrainingFigures).per_class);
        expect(rows.map((r) => r.name)).toEqual(['3', '7']);
        expect(rows[1]).toMatchObject({ precision: null, recall: 0.4, below: ['recall'] });
    });

    it('paints only what the gateway marked as below its limit', () => {
        const view = checkCard(trainingCheck(), undefined, Date.now());
        const table = section(view, 'table')!;
        expect(table.rows[1][2]).toMatchObject({ text: '0.40', color: 'error.main' });
        expect(table.rows[0][2].color).toBeUndefined();
    });

    it('names the majority baseline in one line', () => {
        const view = checkCard(trainingCheck(), undefined, Date.now());
        const kv = section(view, 'kv')!;
        expect(kv.rows.find((r) => r.label === 'Majority baseline')?.value).toBe('0.50 (always “3”) · p = 0.00014');
    });

    it('compares the rounds with the previous check', () => {
        const rows = compareRows({ accuracy: 0.88, macro_f1: 0.86 }, { accuracy: 0.92, macro_f1: 0.91 });
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ label: 'Accuracy', before: '0.88', after: '0.92' });
        expect(rows[0].change).toBeCloseTo(0.04, 6);
    });

    it('shows the platform figure only when the gateway read the log', () => {
        expect(platformFigure(undefined)).toBeUndefined();
        expect(platformFigure({} as TrainingFigures)).toBeUndefined();
        expect(platformFigure({ platform_figure: null } as TrainingFigures)).toEqual({
            label: 'platform figure (not checked by the gateway)',
            text: 'No platform figure in the training log',
        });
        expect(platformFigure({ platform_figure: { name: 'mAP50-95', value: 0.41, source: 'training log', note: 'last value' } } as TrainingFigures)).toEqual({
            label: 'platform figure (not checked by the gateway)',
            text: 'mAP50-95 0.41 · from the training log · last value',
        });
    });

    it('names the basic checks of a file that are there', () => {
        expect(basicChecks(null)).toEqual([]);
        const fig = {
            loads: true,
            inputs: [{ name: 'input', shape: [1, 3, 64, 64], type: 'float32' }],
            outputs: [{ name: 'output', shape: [1, 2], type: 'float32' }],
            classes: 2,
            varied: true,
            class_order: null,
        };
        expect(basicChecks(fig).map((c) => c.label)).toEqual([
            'Loads in onnxruntime',
            'One input [1, 3, 64, 64] float32',
            'Output [1, 2] – 2 classes',
            'Different outputs for different images',
        ]);
        // the class order is only compared when the agent declared class_names (R2.4)
        expect(basicChecks({ ...fig, class_order: true }).map((c) => c.label)).toContain(
            'Class order matches the declared class_names',
        );
        expect(basicChecks({ ...fig, loads: false }).find((c) => c.label === 'Loads in onnxruntime')?.ok).toBe(false);
    });

    it('writes the preprocessing with the source it came from', () => {
        expect(
            preprocessText({ color: 'RGB', size: [64, 64], scale: 1 / 255, layout: 'NCHW', declared: true }),
        ).toBe('RGB · 64×64 · scale 1/255 · NCHW (declared by the agent)');
        expect(
            preprocessText({ color: 'RGB', size: [64, 64], scale: 1 / 255, layout: 'NCHW', declared: false }),
        ).toBe('RGB · 64×64 · scale 1/255 · NCHW (template default)');
    });

    it('reads the rows of a deployment check out of the figures', () => {
        const fig: DeploymentFigures = {
            deployment: { id: 7, name: 'agw-mnist-v1' },
            device: { name: 'sim-edge-01', simulated: true },
            image: 'agent-test/mnist-triton:v1',
            model: { id: 3, name: 'mnist_demo' },
            ready: true,
            served_model: 'mnist_demo',
            io: {
                same: true,
                triton: { inputs: [{ name: 'input', shape: [1, 3, 64, 64], type: 'FP32' }], outputs: [] },
                platform: { inputs: [{ name: 'input', shape: [1, 3, 64, 64], type: 'FP32' }], outputs: [] },
                file: { inputs: [{ name: 'input', shape: [1, 3, 64, 64], type: 'FP32' }], outputs: [] },
            },
            requests: 6,
            max_abs_diff: 0.0000031,
            argmax_same: 6,
            roundtrip_ms: { median: 182, max: 240 },
            model_check: { found: true, final: true, verdict: 'usable', measured_images: 24, accuracy: 0.92 },
        };
        const rows = deploymentRows(fig);
        const value = (label: string) => rows.find((r) => r.label === label)?.value;
        expect(value('Ready')).toBe('yes');
        expect(value('Model served')).toBe('mnist_demo – as expected');
        expect(value('Inputs and outputs')).toBe('same on the device, in the platform and in the model file');
        expect(value('Requests')).toBe('6');
        expect(value('Largest difference to the model file')).toBe('3.1e-6');
        expect(value('Same top class')).toBe('6 of 6');
        expect(value('Round trip (incl. docker exec)')).toBe('median 182 ms · max 240 ms');
        expect(value('Model check')).toBe('usable (24 held-out images, accuracy 0.92)');
    });

    it('names no inference server in the rows of a deployment check', () => {
        const tensor = (shape: number[]) => ({ inputs: [{ name: 'input', shape, type: 'FP32' }], outputs: [] });
        const base = {
            deployment: { id: 7, name: 'd' },
            device: { name: 'sim-edge-01', simulated: true },
            image: 'agent-test/mnist-ovms:v1-ovms',
            model: { id: 3, name: 'mnist_demo' },
            ready: true,
            requests: 6,
            max_abs_diff: 0.0000031,
            argmax_same: 6,
            roundtrip_ms: { median: 182, max: 240 },
            model_check: null,
        };
        const same = deploymentRows({
            ...base,
            io: { same: true, triton: tensor([1, 3, 64, 64]), platform: tensor([1, 3, 64, 64]), file: tensor([1, 3, 64, 64]) },
        } as DeploymentFigures);
        expect(JSON.stringify(same)).not.toMatch(/triton/i);
        const differs = deploymentRows({
            ...base,
            io: { same: false, triton: tensor([1, 3, 64, 64]), platform: tensor([1, 3, 32, 32]), file: tensor([1, 3, 64, 64]) },
        } as DeploymentFigures);
        expect(JSON.stringify(differs)).not.toMatch(/triton/i);
        expect(differs.find((r) => r.label === 'Inputs')?.value).toBe(
            'device [1, 3, 64, 64] · platform [1, 3, 32, 32] · model file [1, 3, 64, 64]',
        );
    });

    it('shows the share of the scale and the ties of a deployment check', () => {
        const base = {
            deployment: { id: 7, name: 'd' },
            device: { name: 'sim-edge-01', simulated: true },
            model: { id: 3, name: 'm' },
            ready: true,
            io: { same: true, triton: { inputs: [], outputs: [] }, platform: { inputs: [], outputs: [] }, file: { inputs: [], outputs: [] } },
            requests: 6,
            max_abs_diff: 0.0826,
            argmax_same: 5,
            roundtrip_ms: { median: 1, max: 2 },
            model_check: null,
        } as DeploymentFigures;
        const value = (fig: DeploymentFigures, label: string) => deploymentRows(fig).find((r) => r.label === label)?.value;
        const fig: DeploymentFigures = {
            ...base,
            max_rel_diff: 2.8e-4,
            tolerance: { abs: 1e-4, scale: 1e-2 },
            per_request: [{ input: 'drawn 1', max_abs_diff: 0.002, scale: 0.5, rel_diff: 0.004, tolerance_used: 0.4, argmax_same: false, tie: true }],
        };
        expect(value(fig, 'Largest difference to the model file')).toBe('0.08 · 2.8e-4 of the largest output value (allowed 1.0e-2)');
        expect(value(fig, 'Same top class')).toBe('5 of 6 (1 tie within the tolerance)');
        // an old report has neither field
        expect(value(base, 'Largest difference to the model file')).toBe('0.08');
        expect(value(base, 'Same top class')).toBe('5 of 6');
    });

    it('leaves a deployment row away instead of inventing it', () => {
        const rows = deploymentRows({
            deployment: { id: 7, name: 'd' },
            device: { name: 'sim-edge-01', simulated: false },
            model: { id: 3, name: 'mnist_a' },
            ready: false,
            io: { same: true, triton: { inputs: [], outputs: [] }, platform: { inputs: [], outputs: [] }, file: { inputs: [], outputs: [] } },
            requests: 0,
            max_abs_diff: null,
            argmax_same: null,
            roundtrip_ms: { median: 0, max: 0 },
            model_check: null,
        });
        const labels = rows.map((r) => r.label);
        expect(labels).not.toContain('Same top class');
        expect(labels).not.toContain('Largest difference to the model file');
        expect(rows.find((r) => r.label === 'Requests')?.value).toBe('not sent');
        expect(rows.find((r) => r.label === 'Model check')?.value).toBe('none in this chat');
        expect(rows.find((r) => r.label === 'Model served')).toBeUndefined();
        expect(modelCheckText({ found: true, final: false })).toBe('none in this chat (interim only)');
        expect(modelCheckText({ found: true, final: true, verdict: 'not_measured', reason: 'too few images' })).toBe(
            'not measured (too few images)',
        );
    });
});

describe('the state and the place of a check', () => {
    it('takes the state of the row', () => {
        expect(checkCardState(check({ state: 'queued' }))).toBe('queued');
        expect(checkCardState(check({ state: 'running' }))).toBe('running');
        expect(checkCardState(check({ state: 'finished' }))).toBe('finished');
        expect(checkCardState(check({ state: 'failed' }))).toBe('failed');
        expect(checkCardState(check({ state: 'expired' }))).toBe('expired');
    });

    it('merges the route with the watcher and the calls of the answer', () => {
        const items: CheckItem[] = mergeChecks(
            [check({ tool_call_id: 'call-1' })],
            [
                watch({ tool_call_id: 'call-1' }),
                watch({ id: 'j2', ref: 'chk-2', state: 'running', started_at: '2026-10-16T09:00:00Z' }),
            ],
        );
        // oldest first, and the observation of a check hangs on its own card
        expect(items.map((i) => i.check.check_id)).toEqual(['chk-2', 'chk-1']);
        expect(items[1].watch?.id).toBe('j1');
        expect(items[0].check.state).toBe('running');
    });

    it('adds a card for a check the route does not know and none for assess_status', () => {
        const expired = mergeChecks(
            [],
            [],
            [
                step({
                    args: { deployment_id: 7, model_id: 3 },
                    result: result('{"status":"error","message":"check 4f2a1b2c-9d3e not found in this chat"}'),
                }),
            ],
        );
        expect(expired).toHaveLength(1);
        expect(expired[0].check).toMatchObject({ check_id: '4f2a1b2c-9d3e', state: 'expired', subject: 'deployment #7 · model #3' });
        // an assess_status call names the check of the card, it does not add one of its own
        const again = mergeChecks(
            [check({ tool_call_id: 'call-1' })],
            [],
            [step({ result: result('{"check_id":"chk-1","state":"finished"}') })],
        );
        expect(again).toHaveLength(1);
        expect(checkIdOfStep(step({ result: result('{"check_id":"chk-1"}') }))).toBe('chk-1');
    });

    it('names the checked object in the subtitle, also while the report is missing', () => {
        const trained = checkSubtitle(trainingCheck());
        expect(trained.lines[0]).toEqual([{ text: 'yolov8-weeds-ft (#7)', mono: true }]);
        expect(trained.lines[1]).toEqual([{ text: 'on ' }, { text: 'mnist-check-120 (#41)', mono: true }]);
        const own = checkSubtitle(
            check({
                kind: 'own_model',
                subject: 'sha:9a3f0000e012',
                report: {
                    kind: 'own_model',
                    verdict: 'usable',
                    final: true,
                    set: 'holdout',
                    measured_images: 24,
                    image_review: { done: false },
                    figures: {
                        file: { name: 'model.onnx', sha256: '9a3f1111e012', run_id: '3' },
                        model: null,
                        eval_dataset: { id: 41, name: 'mnist-check-120' },
                    } as OwnModelFigures,
                    header: '',
                },
            }),
        );
        expect(own.lines[0]).toEqual([
            { text: 'model.onnx', mono: true },
            { text: ' · sha256 9a3f…e012' },
            { text: ' · from notebook run 3' },
        ]);
        // queued: the report that names the model and the dataset does not stand yet, so the subject stands there
        const queued = checkSubtitle(check({ kind: 'training_model', state: 'queued', subject: 'model:7' }));
        expect(queued.lines[0]).toEqual([{ text: 'model #7', mono: true }]);
    });

    it('marks a simulated device and its deployment', () => {
        const fig: DeploymentFigures = {
            deployment: { id: 7, name: 'agw-mnist-v1' },
            device: { name: 'sim-edge-01', simulated: true },
            model: { id: 3, name: 'mnist_demo' },
            image: 'agent-test/mnist-triton:v1',
            ready: true,
            io: { same: true, triton: { inputs: [], outputs: [] }, platform: { inputs: [], outputs: [] }, file: { inputs: [], outputs: [] } },
            requests: 6,
            max_abs_diff: 0,
            argmax_same: 6,
            roundtrip_ms: { median: 182, max: 240 },
            model_check: null,
        };
        const view = checkCard(
            check({
                kind: 'deployment',
                subject: 'deployment:agw-mnist-v1',
                report: {
                    kind: 'deployment',
                    verdict: 'usable',
                    final: true,
                    set: 'synthetic',
                    measured_images: 6,
                    image_review: { done: false },
                    figures: fig,
                    note: 'no real images; whether the model is good comes from the model check',
                    header: 'Result: usable (synthetic test requests)',
                },
            }),
            undefined,
            Date.now(),
        );
        expect(view.title).toBe('Deployment check');
        expect(view.kindLabel).toBe(' · Edge');
        expect(view.effect).toBe('read');
        expect(view.simulated).toBe(true);
        expect(section(view, 'mode')?.text).toBe('Synthetic test requests, no images');
        expect(section(view, 'table')).toBeUndefined();
    });
});

describe('the card of a check', () => {
    it('shows the verdict, the sample and the figures of a finished training check', () => {
        const now = Date.parse('2026-10-16T10:01:05Z');
        const view = checkCard(trainingCheck(), undefined, now);
        expect(view.state).toBe('finished');
        expect(view.status).toBe('finished · 1:05');
        expect(view.statusColor).toBe('success');
        expect(section(view, 'verdict')).toMatchObject({ header: 'Result: usable (held-out images, statistics only, no image review)' });
        expect(section(view, 'sample')).toMatchObject({ text: 'Measured on 24 held-out images' });
        expect(section(view, 'table')?.columns.map((c) => c.text)).toEqual(['Class', 'Precision', 'Recall', 'F1', 'Support']);
        const list = section(view, 'list');
        expect(list?.title).toBe('Reasons');
        expect(section(view, 'note')?.text).toContain('MulticlassAccuracy');
        expect(view.kindLabel).toBe(' · Trained model');
        expect(view.effect).toBe('write');
    });

    it('leaves the counts away where the report has none and shows the platform figure', () => {
        const view = checkCard(
            check({
                report: {
                    kind: 'training_model',
                    verdict: 'not_measured',
                    final: true,
                    set: 'holdout',
                    measured_images: 12,
                    image_review: { done: false },
                    reasons: ['too few held-out images (12 of at least 20)'],
                    hints: ['Too few held-out images (12 of at least 20)'],
                    figures: { platform_figure: { name: 'mAP50-95', value: 0.41, source: 'training log', note: '' } } as TrainingFigures,
                    header: 'Result: not measured – too few held-out images (12 of at least 20)',
                },
            }),
            undefined,
            Date.now(),
        );
        expect(section(view, 'verdict')?.view.label).toBe('Not measured');
        expect(view.accent).toBe('warning.main');
        // the sample and the table of a not measured check say nothing: there was nothing to measure
        expect(section(view, 'sample')).toBeUndefined();
        expect(section(view, 'table')).toBeUndefined();
        // the line about the too few images comes from the gateway's hints (its first reason stands in the header)
        expect(section(view, 'list')?.title).toBe('Hints');
        expect(section(view, 'note')?.text).toContain('mAP50-95');
    });

    it('shows the error of a failed check and its partial figures', () => {
        const view = checkCard(
            check({ state: 'failed', error: 'the check container stopped after 10 min', tool_call_id: 'call-1' }),
            undefined,
            Date.now(),
        );
        expect(view.state).toBe('failed');
        expect(view.accent).toBe('error.main');
        expect(section(view, 'error')).toMatchObject({ text: 'the check container stopped after 10 min' });
        // no report, no verdict chip: nothing was measured
        expect(section(view, 'verdict')).toBeUndefined();
    });

    it('says what it can about a check the gateway no longer has', () => {
        const view = checkCard(
            check({ state: 'expired', kind: 'deployment', subject: 'deployment #7 · model #3', created_at: '2026-10-15T09:12:00' }),
            undefined,
            Date.parse('2026-10-16T12:00:00'),
        );
        expect(view.status).toBe('expired');
        expect(view.accent).toBe('grey.400');
        expect(section(view, 'kv')?.rows).toEqual([
            { label: 'Started', value: 'yesterday, 09:12' },
            { label: 'Kind', value: 'Edge deployment' },
        ]);
        const texts = view.sections.filter((s) => s.kind === 'hint');
        expect(texts).toHaveLength(2);
    });

    it('shows a running check with the line the gateway reports', () => {
        const view = checkCard(
            check({ state: 'running', started_at: '2026-10-16T10:00:00Z', progress: { set: 'holdout', images: 5, note: 'images 5 of 24' } }),
            watch({ progress: 21, message: 'training_model: 5 of 24 images' }),
            Date.parse('2026-10-16T10:00:41Z'),
        );
        expect(view.status).toBe('running · 0:41');
        const progress = section(view, 'progress')!;
        expect(progress.percent).toBe(21);
        expect(progress.left).toBe('images 5 of 24');
        expect(progress.right).toBe('0:41 elapsed');
    });

    it('shows the image review of a finished check next to the sample', () => {
        const base = trainingCheck();
        const view = checkCard(
            {
                ...base,
                report: {
                    ...base.report!,
                    image_review: { done: true, model: 'deepseek-flash', of: 12, checked: 4, flagged: 2 },
                },
            },
            undefined,
            Date.parse('2026-10-16T12:00:00Z'),
        );
        expect(section(view, 'sample')?.sub).toBe(
            'Image review: 4 of 12 misclassified validation images checked, 2 flagged',
        );
        expect(section(view, 'mode')).toMatchObject({ text: 'Statistics and image review (deepseek-flash)', icon: 'image' });
    });

    it('looks as before when no image review ran', () => {
        const base = trainingCheck();
        const view = checkCard(base, undefined, Date.parse('2026-10-16T12:00:00Z'));
        expect(section(view, 'sample')?.sub).toBeUndefined();
        expect(section(view, 'sample')?.captions?.[0]).toContain('Images of dataset mnist-check-120');
        expect(section(view, 'mode')).toMatchObject({ text: 'Statistics only, no image review', icon: 'stats' });
        expect(section(view, 'mode')?.reason).toBe('no vision model in this chat');
    });

    it('shows the steps and the model of the image review while a check runs', () => {
        const view = checkCard(
            check({
                state: 'running',
                started_at: '2026-10-16T10:00:00Z',
                progress: {
                    set: 'validation',
                    images: 12,
                    review_model: 'deepseek-flash',
                    steps: [
                        { name: 'statistics', done: true, seconds: 41, k: 12, m: 12 },
                        { name: 'image_review', done: false, k: 5, m: 12 },
                    ],
                },
            }),
            watch(),
            Date.parse('2026-10-16T10:02:01Z'),
        );
        expect(view.status).toBe('running · 2:01');
        expect(section(view, 'sample')?.text).toBe('Measured on 12 validation images');
        expect(section(view, 'mode')).toMatchObject({ text: 'Statistics and image review (deepseek-flash)', icon: 'image' });
        const steps = section(view, 'steps')!.items;
        expect(steps[0]).toMatchObject({ text: 'Statistics · 12 validation images', right: '0:41', done: true });
        expect(steps[1]).toMatchObject({ text: 'Image review (deepseek-flash)', right: 'image 5 of 12', running: true });
        const progress = section(view, 'progress')!;
        expect(progress.percent).toBe(42);
        expect(progress.left).toBe('image 5 of 12');
        expect(progress.right).toBe('2:01 elapsed');
    });

    it('shows only the statistics step while no image review is allowed', () => {
        const progress = { set: 'validation', images: 12, steps: [{ name: 'statistics', done: true, seconds: 41, k: 12, m: 12 }] };
        expect(progressStepRows(progress)).toEqual([{ text: 'Statistics · 12 validation images', right: '0:41', done: true, running: false }]);
        expect(progressReviewText(progress)).toBeUndefined();
        const view = checkCard(
            check({ state: 'running', started_at: '2026-10-16T10:00:00Z', progress }),
            watch(),
            Date.parse('2026-10-16T10:00:41Z'),
        );
        expect(section(view, 'mode')).toMatchObject({ text: 'Statistics only, no image review', icon: 'stats' });
        expect(section(view, 'progress')?.percent).toBeNull();
        expect(section(view, 'progress')?.left).toBe('');
    });
});

describe('the confusion matrix of a check (#249)', () => {
    it('counts rows as true and columns as predicted class, with the share of the row', () => {
        const v = confusionView({ '3': { '3': 9, '7': 1 }, '7': { '3': 2, '7': 3 } })!;
        expect(v.classes).toEqual(['3', '7']);
        expect(v.folded).toBe(false);
        expect(v.rows[0]).toMatchObject({ name: '3', total: 10 });
        expect(v.rows[0].cells).toEqual([
            { count: 9, share: 0.9, diagonal: true },
            { count: 1, share: 0.1, diagonal: false },
        ]);
        expect(v.rows[1].cells[0]).toMatchObject({ count: 2, share: 0.4, diagonal: false });
        expect(v.rows[1].cells[1]).toMatchObject({ count: 3, share: 0.6, diagonal: true });
    });

    it('reads a cell the gateway left out as 0 and takes classes from the per-class map too', () => {
        const perClass = { '3': { precision: 1, recall: 1, f1: 1, support: 4 }, '5': { precision: null, recall: 0, f1: 0, support: 0 } };
        const v = confusionView({ '3': { '3': 4 } }, perClass)!;
        expect(v.classes).toEqual(['3', '5']);
        expect(v.rows[1]).toMatchObject({ name: '5', total: 0 });
        expect(v.rows[1].cells.map((c) => c.count)).toEqual([0, 0]);
        expect(v.rows[1].cells.every((c) => c.share === 0)).toBe(true);
    });

    it('starts folded from 11 classes on, not at 10', () => {
        const make = (n: number) =>
            Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${String(i).padStart(2, '0')}`, { [`c${String(i).padStart(2, '0')}`]: 3 }]));
        expect(confusionView(make(10))!.folded).toBe(false);
        expect(confusionView(make(10))!.classes).toHaveLength(10);
        expect(confusionView(make(11))!.folded).toBe(true);
    });

    it('has no matrix without confusion (an old report) or without any count', () => {
        expect(confusionView(undefined)).toBeUndefined();
        expect(confusionView({})).toBeUndefined();
        expect(confusionView({ '3': { '3': 0 } })).toBeUndefined();
    });

    it('puts the matrix after the per-class table, and only when the report has it', () => {
        const old = checkCard(trainingCheck(), undefined, Date.now());
        expect(section(old, 'confusion')).toBeUndefined();
        expect(section(old, 'table')).toBeDefined();
        const c = trainingCheck();
        (c.report!.figures as TrainingFigures).confusion = { '3': { '3': 20, '7': 1 }, '7': { '3': 5, '7': 4 } };
        const view = checkCard(c, undefined, Date.now());
        const kinds = view.sections.map((x) => x.kind);
        expect(kinds.indexOf('confusion')).toBe(kinds.indexOf('table') + 1);
    });

    it('explains the held-back sets in a tooltip of the sample line', () => {
        expect(sampleTip('holdout')).toBe('Images the split held back; never used in training');
        expect(sampleTip('validation')).toBe('Images the split held back; never used in training');
        expect(sampleTip('synthetic')).toBeUndefined();
        expect(section(checkCard(trainingCheck(), undefined, Date.now()), 'sample')?.tip).toBe('Images the split held back; never used in training');
    });
});
