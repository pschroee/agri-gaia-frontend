// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Data for the tests of the tab "Experiments": searches and trials as the gateway sends them. The search space is
// valid for the platform template (G12): learning_rate, batch_size, epochs, img_size; nothing outside the schema.

import type { EpochRow, Search, SearchSpace, Trial } from './experiments';

export const space: SearchSpace = {
    learning_rate: { type: 'float', min: 0.0001, max: 0.01, scale: 'log' },
    batch_size: { type: 'choice', values: [16, 32, 64] },
    epochs: { type: 'int', min: 5, max: 20 },
    img_size: { type: 'choice', values: [224, 300] },
};

export function makeSearch(over: Partial<Search> = {}): Search {
    return {
        id: 's1',
        chat_id: 'c1',
        title: 'tf-flowers',
        state: 'running',
        path: 'template',
        objective: { metric: 'val_acc', mode: 'max' },
        space: { ...space },
        budget: { max_runs: 6, max_compute_minutes: 180, target: 0.9, patience: 3 },
        base: { container_id: 63, architecture: 'efficientnet_v2_s', config: { pretrained: true, optimizer: 'AdamW', epochs: 12 } } as Search['base'],
        created_at: '2026-10-20T08:40:00Z',
        started_at: '2026-10-20T08:46:00Z',
        used: { runs: 4, compute_minutes: 72, since_improvement: 1 },
        best_idx: 2,
        compute_left: 5,
        running_trial: 4,
        ...over,
    };
}

export function makeTrial(idx: number, over: Partial<Trial> = {}): Trial {
    return {
        id: `t${idx}`,
        chat_id: 'c1',
        search_id: 's1',
        seq: idx,
        idx,
        path: 'template',
        state: 'done',
        params: { learning_rate: 0.0003, batch_size: 32, epochs: 20, img_size: 300 },
        epoch: 20,
        epochs: 20,
        score: 0.8 + idx / 100,
        score_epoch: 14,
        figures: 'ok',
        gpu_available: true,
        declared_at: '2026-10-20T08:46:00Z',
        duration_s: 600 + idx * 60,
        ...over,
    };
}

export const trials = (): Trial[] => [
    makeTrial(1, { score: 0.71, params: { learning_rate: 0.001, batch_size: 32, epochs: 15, img_size: 224 }, note: 'Baseline with the template defaults' }),
    makeTrial(2, { score: 0.86, note: 'Larger images' }),
    makeTrial(3, { score: 0.83, params: { learning_rate: 0.0001, batch_size: 16, epochs: 20, img_size: 300 } }),
    makeTrial(4, { state: 'running', epoch: 7, score: 0.62, score_epoch: 7, ended_at: undefined, duration_s: 660, note: 'Trial 2 is the best so far at batch 32.', eta: '2026-10-20T11:30:00Z' }),
];

export const lossSearch = (): Search =>
    makeSearch({ id: 's2', title: 'loss-search', objective: { metric: 'val_loss', mode: 'min' }, budget: { max_runs: 4, target: 0.3 }, best_idx: 2 });

export const lossTrials = (): Trial[] =>
    [0.52, 0.41, 0.47].map((score, i) => makeTrial(i + 1, { id: `l${i + 1}`, search_id: 's2', score }));

export const epochRows = (n: number): EpochRow[] =>
    Array.from({ length: n }, (_, i) => ({
        epoch: i + 1,
        train_loss: 1.6 - i * 0.07,
        val_loss: 1.7 - i * 0.06,
        train_acc: 0.4 + i * 0.03,
        val_acc: 0.38 + i * 0.025,
    }));
