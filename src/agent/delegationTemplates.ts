// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Ported from agri-gaia-agent-gateway web/src/lib/delegationTemplates.ts (labels in English).

import type { Delegation, DelegationRule } from './types';

export type DelegationTemplate = { id: string; label: string; description: string; rules?: DelegationRule[] };

/** Resources covered by "Read only" (all except api). */
export const READ_RESOURCES = [
    'dataset',
    'model',
    'training',
    'task',
    'train_template',
    'edge_device',
    'container_image',
];

const readAll: DelegationRule[] = READ_RESOURCES.map((resource) => ({ action: 'read', resource, ids: ['*'] }));

export const DELEGATION_TEMPLATES: DelegationTemplate[] = [
    {
        id: 'none',
        label: 'No delegation',
        description: 'Reading works without asking, every write needs your approval.',
    },
    {
        id: 'read',
        label: 'Read only',
        description:
            'The agent may read datasets, models, trainings, tasks, templates, edge devices and images, nothing else.',
        rules: readAll,
    },
    {
        id: 'train-own',
        label: 'Training on own dataset',
        description:
            'Read everything as with "Read only"; create datasets and change or delete only those it created; ' +
            'create and start trainings. Training containers are created asynchronously and cannot be tied to a ' +
            'chat, so start and stop apply to all containers.',
        rules: [
            ...readAll,
            { action: 'create', resource: 'dataset' },
            { action: 'update', resource: 'dataset', ids: ['own'] },
            { action: 'delete', resource: 'dataset', ids: ['own'] },
            { action: 'create', resource: 'training' },
            { action: 'run', resource: 'training', ids: ['*'] },
        ],
    },
];

export const DEFAULT_DELEGATION_HOURS = 8;

/** Delegation from a template, valid `hours` hours from `now`; undefined for "No delegation". */
export function delegationFrom(
    t: DelegationTemplate | undefined,
    hours: number,
    now: Date = new Date(),
): Delegation | undefined {
    if (!t?.rules) return undefined;
    return {
        rules: t.rules.map((r) => ({ ...r, ids: r.ids ? [...r.ids] : undefined })),
        expires_at: new Date(now.getTime() + hours * 3600_000).toISOString(),
        enforce: true,
    };
}

const ruleKey = (r: DelegationRule) => `${r.action}|${r.resource}|${[...(r.ids ?? [])].sort().join(',')}`;

/** Name of the template a delegation was made from, if its rules match one exactly. */
export function templateLabelOf(d: Delegation | undefined): string | undefined {
    if (!d) return DELEGATION_TEMPLATES.find((t) => !t.rules)?.label;
    const keys = d.rules.map(ruleKey).sort().join(';');
    return DELEGATION_TEMPLATES.find((t) => t.rules && t.rules.map(ruleKey).sort().join(';') === keys)?.label;
}
