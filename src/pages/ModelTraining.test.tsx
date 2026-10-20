// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The training page loads the containers and the datasets again when the gateway reports a change of a training,
// a dataset or a background task (issue #167): a container appears when its build task ends. The 5 s interval of
// the page stays and is not what this test looks at; the heavy children are replaced by stand-ins.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import ModelTraining from './ModelTraining';

const httpGet = vi.fn();
let containers: { id: number; name: string }[] = [];

vi.mock('../api', () => ({
    httpGet: (...a: unknown[]) => httpGet(...a),
    httpPost: vi.fn(),
    httpPut: vi.fn(),
}));
vi.mock('../contexts/KeycloakContext', () => ({
    default: () => ({ authenticated: true, loadUserProfile: () => Promise.resolve({ username: 'u' }) }),
}));
vi.mock('../contexts/TasksContext', () => ({ default: () => ({ addTask: vi.fn(), tasks: [] }) }));
vi.mock('@rjsf/mui', () => ({ default: () => null }));
vi.mock('@rjsf/validator-ajv8', () => ({ default: {} }));
vi.mock('@uiw/react-textarea-code-editor', () => ({ default: () => null }));
vi.mock('../components/train/List', () => ({
    default: (p: { trainContainers: { id: number; name: string }[] }) => (
        <ul>
            {(p.trainContainers ?? []).map((c) => (
                <li key={c.id}>{c.name}</li>
            ))}
        </ul>
    ),
}));
vi.mock('../components/train/UploadTrainConfigDialog', () => ({ default: () => null }));
vi.mock('../components/train/UploadTrainContainerTemplateDialog', () => ({ default: () => null }));
vi.mock('../components/train/ExportConfigDialog', () => ({ default: () => null }));
vi.mock('../components/train/TrainContainerTemplateDeleteButton', () => ({ default: () => null }));

beforeEach(() => {
    containers = [];
    httpGet.mockReset();
    httpGet.mockImplementation((_k: unknown, path: string) =>
        path === '/train/containers' ? Promise.resolve(containers.map((c) => ({ ...c }))) : Promise.resolve([]),
    );
});
afterEach(cleanup);

const containerGets = () => httpGet.mock.calls.filter((c) => c[1] === '/train/containers').length;
const datasetGets = () => httpGet.mock.calls.filter((c) => c[1] === '/datasets').length;

describe('ModelTraining and platform_changed', () => {
    it('loads containers and datasets again when a task ends', async () => {
        render(<ModelTraining />);
        await waitFor(() => expect(containerGets()).toBeGreaterThan(0));
        const c0 = containerGets();
        const d0 = datasetGets();
        containers = [{ id: 7, name: 'pigs-v1' }];
        act(() => notifyPlatformChange('tasks'));
        await screen.findByText('pigs-v1', undefined, { timeout: 3000 });
        expect(containerGets()).toBeGreaterThan(c0);
        expect(datasetGets()).toBe(d0 + 1);
    });

    it('does not load again for an area the page does not show', async () => {
        render(<ModelTraining />);
        await waitFor(() => expect(containerGets()).toBeGreaterThan(0));
        const c0 = containerGets();
        act(() => notifyPlatformChange('models'));
        await new Promise((r) => setTimeout(r, 800));
        expect(containerGets()).toBe(c0);
    });
});
