// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Test data for the training search (gateway issue #168): searches and trials as the gateway sends them. The space is
// one the gateway accepts (learning_rate, batch_size, epochs, img_size — keys of the Torchvision template, G12); a
// second search minimises the validation loss (G7).

import type { Search, Trial } from './experiments';
import type { SearchApprovalData, SearchCodeChange } from './searchApproval';

export const mockSearch = (over: Partial<Search> = {}): Search => ({
    id: 's1',
    chat_id: 'c1',
    title: 'tf-flowers',
    state: 'running',
    path: 'template',
    objective: { metric: 'val_acc', mode: 'max' },
    space: {
        learning_rate: { type: 'float', min: 1e-4, max: 1e-2, scale: 'log' },
        batch_size: { type: 'choice', values: [16, 32, 64] },
        epochs: { type: 'int', min: 10, max: 30 },
        img_size: { type: 'choice', values: [224, 300] },
    },
    budget: { max_runs: 6, max_compute_minutes: 180, target: 0.9, patience: 3 },
    base: { container_id: 63, provider: 'Torchvision', category: 'Classification', architecture: 'EfficientNet', dataset: { id: 59, name: 'tf-flowers-mini-train', classes: 5, images: 450 } },
    holdout: { available: true, eval_dataset: { id: 58, name: 'tf-flowers-mini', images: 92 }, images: 92, final_state: '' },
    note: 'Search over learning rate and batch size.',
    tool_call_id: 'call-1',
    created_at: '2026-10-20T08:46:00Z',
    started_at: '2026-10-20T08:46:30Z',
    ends_by: '2026-10-20T20:46:30Z',
    used: { runs: 3, compute_minutes: 72, since_improvement: 1 },
    best_idx: 2,
    compute_left: 5,
    running_trial: 4,
    ...over,
});

export const mockTrial = (idx: number, over: Partial<Trial> = {}): Trial => ({
    id: `t${idx}`,
    chat_id: 'c1',
    search_id: 's1',
    seq: idx,
    idx,
    path: 'template',
    state: 'done',
    params: { learning_rate: 3e-4, batch_size: 32, epochs: 20, img_size: 300 },
    note: 'Trial note of the agent.',
    epoch: 20,
    epochs: 20,
    score: 0.8,
    score_epoch: 20,
    figures: 'ok',
    gpu_available: true,
    declared_at: '2026-10-20T08:47:00Z',
    started_at: '2026-10-20T08:47:10Z',
    ended_at: '2026-10-20T09:01:00Z',
    duration_s: 840,
    ...over,
});

/** Three finished trials and a fourth that runs. */
export const mockTrials = (): Trial[] => [
    mockTrial(1, { score: 0.71 }),
    mockTrial(2, { score: 0.86 }),
    mockTrial(3, { score: 0.83, params: { learning_rate: 1e-4, batch_size: 16, epochs: 20, img_size: 300 } }),
    mockTrial(4, { state: 'running', epoch: 7, epochs: 20, score: 0.62, ended_at: null, eta: '2099-01-01T00:00:00Z', params: { learning_rate: 3e-4, batch_size: 64, epochs: 20, img_size: 300 } }),
];

/** A search that minimises the validation loss. */
export const mockLossSearch = (): Search =>
    mockSearch({ id: 's2', objective: { metric: 'val_loss', mode: 'min' }, budget: { max_runs: 4, target: 0.4 }, best_idx: 2 });

export const mockProposal = (over: Partial<SearchApprovalData> = {}): SearchApprovalData => ({
    kind: 'proposal',
    search_id: 's1',
    title: 'tf-flowers',
    objective: { metric: 'val_acc', mode: 'max' },
    space: mockSearch().space,
    fixed: { optimizer: 'AdamW', scheduler: 'ReduceLROnPlateau', weight_decay: 0.01 },
    budget: { max_runs: 6, max_compute_minutes: 180, target: 0.9, patience: null },
    compute: { needed: 6, left: 11, left_after: 5 },
    expires_at: '2099-01-01T00:00:00Z',
    path: 'template',
    base: mockSearch().base,
    holdout: { available: true, eval_dataset: { id: 58, name: 'tf-flowers-mini', images: 92 }, images: 92 },
    autonomy: { max_auto_turns: 21 },
    note: 'The single run reached 0.71.',
    ...over,
});

export const mockCodeChange = (): SearchCodeChange => ({
    kind: 'code_change',
    search_id: 's1',
    title: 'tf-flowers',
    trial: 6,
    code_version_from: 1,
    code_version_to: 2,
    changed_files: ['train.py'],
    files: [
        {
            name: 'train.py',
            old_sha256: 'a'.repeat(64),
            new_sha256: 'b'.repeat(64),
            diff: '@@ -7 +7 @@\n context\n-old line\n+new line\n+second new line\n tail',
        },
        { name: 'model.py', old_sha256: 'c'.repeat(64), new_sha256: 'c'.repeat(64) },
    ],
});
