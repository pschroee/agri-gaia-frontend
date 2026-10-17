// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke test of the card of a pre-annotation run or a result check (issue #112): the head with its effect chip,
// the read-only rule (only "Show more/less", "Show all" and the tooltips are controls), the gateway's texts set as
// text, the CVAT links and the image list. The wording and the figures are checked in annotation.test.ts and
// assess.test.ts; here the card only has to put them together.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { jobCard, runCard } from '../annotation';
import { checkCard } from '../assess';
import type { AnnotationJob, AnnotationRun, AssessCheck, DeploymentFigures, VerifyResult } from '../types';
import AnnotationCard from './AnnotationCard';

afterEach(() => cleanup());

const NOW = Date.parse('2026-10-16T12:00:00Z');
const BASE = 'https://cvat.example';

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
    cvat_url: `${BASE}/tasks/318`,
    ...over,
});

const job = (over: Partial<AnnotationJob> = {}): AnnotationJob => ({
    job_id: 'job-1',
    kind: 'verify',
    dataset_id: 12,
    task_id: 318,
    function: 'yolov8-weeds',
    state: 'finished',
    done: 12,
    total: 12,
    created_at: '2026-10-16T11:00:00Z',
    ended_at: '2026-10-16T11:01:02Z',
    cvat_url: `${BASE}/tasks/318`,
    ...over,
});

/** A finished verification with a questionable verdict and one suspicious image. */
const verify = (over: Partial<VerifyResult> = {}): VerifyResult => ({
    kind: 'annotation',
    verdict: 'questionable',
    final: true,
    set: 'holdout',
    measured_images: 24,
    image_review: { done: false, reason: 'the chat runs no vision model' },
    reasons: ['Recall for weed is 0.62, below the limit of 0.50.'],
    hints: ['stop: no improvement in the last round'],
    suggestions: [{ id: 'remap', text: 'map the labels again' }],
    header: 'Result: questionable (held-out images, statistics only, no image review)',
    source_id: 'run-1',
    calibration_images: 10,
    per_class: { '7': { precision: 0.8, recall: 0.62, f1: 0.7, support: 148, below: ['recall'] } },
    overall: { macro_f1: 0.7 },
    plausibility: {
        filled_images: 4,
        manual_images: 3,
        class_share_auto: { '7': 0.6 },
        class_share_manual: { '7': 0.5 },
        tvd: 0.1,
        empty_share_auto: 0.1,
        empty_share_manual: 0.2,
        boxes_per_image_auto: 1.5,
        boxes_per_image_manual: 1.2,
        median_rel_area_ratio: 0.9,
        measured: true,
    },
    suspicious: [
        { frame: 5, file: 'field-03_row-05.jpg', reason: '3 weeds missed', cvat_url: `${BASE}/tasks/318?frame=5` },
    ],
    ...over,
});

/** A deployment check that is usable. */
const deployment = (): AssessCheck => ({
    check_id: 'chk-9',
    kind: 'deployment',
    subject: 'deployment:agw-mnist-v1',
    final: true,
    state: 'finished',
    created_at: '2026-10-16T11:00:00Z',
    ended_at: '2026-10-16T11:00:04Z',
    report: {
        kind: 'deployment',
        verdict: 'usable',
        final: true,
        set: 'synthetic',
        measured_images: 6,
        image_review: { done: false },
        reasons: ['every request named the same top class as the model file'],
        figures: {
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
            model_check: null,
        } as DeploymentFigures,
        note: 'no real images; whether the model is good comes from the model check',
        header: 'Result: usable (synthetic test requests)',
    },
});

/** A training check (R4): interim, so the image review may look at misclassified validation images. */
const training = (over: Partial<AssessCheck> = {}): AssessCheck => ({
    check_id: 'chk-t1',
    kind: 'training_model',
    subject: 'model:7',
    final: false,
    state: 'finished',
    created_at: '2026-10-16T11:00:00Z',
    started_at: '2026-10-16T11:00:00Z',
    ended_at: '2026-10-16T11:01:05Z',
    report: {
        kind: 'training_model',
        verdict: 'questionable',
        final: false,
        set: 'validation',
        measured_images: 12,
        image_review: { done: true, model: 'deepseek-flash', of: 12, checked: 4, flagged: 2 },
        reasons: ['not better than the majority baseline (0.55 vs 0.50, p = 0.42)'],
        header: 'Result: questionable (validation images, interim, image review with deepseek-flash)',
        note: 'validation split held back from the weights',
    },
    ...over,
});

describe('AnnotationCard', () => {
    it('shows the head of a running run and nothing to press', () => {
        const { container } = render(
            <AnnotationCard view={runCard({ key: 'run-1', what: 'run', run: run() }, BASE, NOW)} layout="panel" />,
        );
        const card = screen.getByTestId('agent-annotation-card');
        expect(card.getAttribute('aria-label')).toBe('Pre-annotation run: running');
        expect(card.getAttribute('data-state')).toBe('running');
        expect(screen.getByTestId('agent-annotation-status').textContent).toBe('running · 2:14');
        expect(screen.getByText('Pre-annotation run')).toBeTruthy();
        expect(screen.getByTestId('agent-effect-chip').textContent).toBe('Compute');
        expect(container.textContent).toContain('CVAT task #318');
        // read-only: a running run has nothing to press at all
        expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    it('marks a run that replaces the annotations of the task', () => {
        const { container } = render(
            <AnnotationCard
                view={runCard({ key: 'run-1', what: 'run', run: run({ existing: 'replace', progress: 63 }) }, BASE, NOW)}
                layout="panel"
            />,
        );
        expect(screen.getByTestId('agent-effect-chip').textContent).toBe('Irreversible');
        expect(container.textContent).toContain('Replaces the existing annotations on these frames');
    });

    it('gives every card the effect chip of its own kind', () => {
        const annotation = render(
            <AnnotationCard view={jobCard({ key: 'job-1', what: 'job', job: job({ result: verify() }) }, BASE, NOW)} layout="panel" />,
        );
        expect(screen.getByTestId('agent-effect-chip').textContent).toBe('Compute');
        annotation.unmount();
        render(<AnnotationCard view={checkCard(deployment(), undefined, NOW)} layout="page" />);
        expect(screen.getByTestId('agent-effect-chip').textContent).toBe('Read');
        expect(screen.getByText('simulated')).toBeTruthy();
    });

    it('sets the words of the gateway as text, not as markup', () => {
        const { container } = render(
            <AnnotationCard
                view={jobCard(
                    {
                        key: 'job-1',
                        what: 'job',
                        job: job({
                            result: verify({
                                reasons: ['Recall for <b>weed</b> is 0.62 & the limit is 0.50.'],
                                header: 'Result: questionable (<script>alert(1)</script>)',
                            }),
                        }),
                    },
                    BASE,
                    NOW,
                )}
                layout="panel"
            />,
        );
        expect(container.textContent).toContain('Recall for <b>weed</b> is 0.62 & the limit is 0.50.');
        expect(container.textContent).toContain('<script>alert(1)</script>');
        expect(container.querySelector('b')).toBeNull();
        expect(container.querySelector('script')).toBeNull();
    });

    it('offers a CVAT link in a new tab and none without a base', () => {
        const item = { key: 'job-1', what: 'job' as const, job: job({ result: verify() }) };
        const first = render(<AnnotationCard view={jobCard(item, BASE, NOW)} layout="panel" />);
        const link = screen.getByLabelText('Open frame field-03_row-05.jpg in CVAT (opens in a new tab)');
        expect(link.getAttribute('href')).toBe(`${BASE}/tasks/318?frame=5`);
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
        first.unmount();
        // the gateway names the base; without it the card offers no link at all
        render(<AnnotationCard view={jobCard(item, '', NOW)} layout="panel" />);
        expect(screen.queryByLabelText('Open frame field-03_row-05.jpg in CVAT (opens in a new tab)')).toBeNull();
    });

    it('shows five image rows and expands the rest', () => {
        const many = Array.from({ length: 7 }, (_, i) => ({
            frame: i + 1,
            file: `field-0${i}.jpg`,
            reason: 'counted as weed',
        }));
        render(
            <AnnotationCard
                view={jobCard({ key: 'job-1', what: 'job', job: job({ result: verify({ suspicious: many }) }) }, BASE, NOW)}
                layout="page"
            />,
        );
        expect(screen.getAllByTestId('agent-annotation-image')).toHaveLength(5);
        fireEvent.click(screen.getByTestId('agent-annotation-images-more'));
        expect(screen.getAllByTestId('agent-annotation-image')).toHaveLength(7);
        expect(screen.getByTestId('agent-annotation-images-more').textContent).toBe('Show less');
    });

    it('keeps the columns of a table and the details behind their link', () => {
        render(<AnnotationCard view={jobCard({ key: 'job-1', what: 'job', job: job({ result: verify() }) }, BASE, NOW)} layout="panel" />);
        expect(screen.getByTestId('agent-annotation-table').textContent).toContain('Class');
        expect(screen.getByTestId('agent-annotation-table').textContent).toContain('Objects');
        // the plausibility values stand behind "Show details"; the agent's report carries them anyway
        expect(screen.queryByTestId('agent-annotation-details-toggle')?.textContent).toBe('Show details');
        expect(screen.queryByTestId('agent-annotation-details-rows')).toBeNull();
        fireEvent.click(screen.getByTestId('agent-annotation-details-toggle'));
        expect(screen.getByTestId('agent-annotation-details-rows').textContent).toContain('Class distance (TVD)');
        expect(screen.getByTestId('agent-annotation-details-rows').textContent).toContain('Median box area ratio');
    });

    it('shows the error of a failed run as the gateway wrote it', () => {
        render(
            <AnnotationCard
                view={runCard(
                    { key: 'run-1', what: 'run', run: run({ state: 'failed', error: 'CVAT returned 502 Bad Gateway', ended_at: '2026-10-16T12:00:00Z' }) },
                    BASE,
                    NOW,
                )}
                layout="panel"
            />,
        );
        expect(screen.getByTestId('agent-error-block-text').textContent).toBe('CVAT returned 502 Bad Gateway');
        expect(screen.getByTestId('agent-annotation-card').getAttribute('data-state')).toBe('failed');
    });

    it('shows the image review of a finished check', () => {
        const { container } = render(<AnnotationCard view={checkCard(training(), undefined, NOW)} layout="panel" />);
        expect(container.textContent).toContain('Image review: 4 of 12 misclassified validation images checked, 2 flagged');
        expect(container.textContent).toContain('Statistics and image review (deepseek-flash)');
        expect(container.textContent).toContain('Measured on 12 validation images');
        // the gateway's note stays under the sample
        expect(container.textContent).toContain('validation split held back from the weights');
    });

    it('names the reason when no image review was allowed', async () => {
        const view = training();
        const { container } = render(
            <AnnotationCard
                view={checkCard(
                    {
                        ...view,
                        report: { ...view.report!, image_review: { done: false, reason: 'the dataset name is not allowed' } },
                    },
                    undefined,
                    NOW,
                )}
                layout="panel"
            />,
        );
        expect(container.textContent).not.toContain('Image review:');
        expect(container.textContent).toContain('Statistics only, no image review');
        fireEvent.mouseOver(screen.getByText('Statistics only, no image review'));
        expect((await screen.findByRole('tooltip')).textContent).toBe('the dataset name is not allowed');
    });

    it('leaves the image review out when none ran', () => {
        // a hold-out check never shows images to a model; its report carries done:false and no figures
        const view = training();
        const { container } = render(
            <AnnotationCard
                view={checkCard(
                    {
                        ...view,
                        final: true,
                        report: {
                            ...view.report!,
                            final: true,
                            image_review: { done: false, reason: 'the held-out images are never shown to a model' },
                        },
                    },
                    undefined,
                    NOW,
                )}
                layout="panel"
            />,
        );
        expect(container.textContent).not.toContain('Image review:');
        expect(container.textContent).toContain('Statistics only, no image review');
    });

    it('shows the steps of the image review while the check runs', () => {
        const { container } = render(
            <AnnotationCard
                view={checkCard(
                    {
                        ...training(),
                        state: 'running',
                        report: null,
                        ended_at: undefined,
                        progress: {
                            set: 'validation',
                            images: 12,
                            review_model: 'deepseek-flash',
                            steps: [
                                { name: 'statistics', done: true, seconds: 41, k: 12, m: 12 },
                                { name: 'image_review', done: false, k: 5, m: 12 },
                            ],
                        },
                    },
                    undefined,
                    NOW,
                )}
                layout="panel"
            />,
        );
        expect(container.textContent).toContain('Measured on 12 validation images');
        expect(container.textContent).toContain('Statistics and image review (deepseek-flash)');
        expect(container.textContent).toContain('Statistics · 12 validation images');
        expect(container.textContent).toContain('0:41');
        expect(container.textContent).toContain('Image review (deepseek-flash)');
        expect(container.textContent).toContain('image 5 of 12');
        const bar = screen.getByRole('progressbar', { name: 'Model check · Trained model progress' });
        expect(bar.getAttribute('aria-valuenow')).toBe('42');
    });
});
