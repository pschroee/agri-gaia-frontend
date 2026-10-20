// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The dataset page loads its list again when the gateway reports a change (issue #167), keeps an active keyword
// search and drops a checked dataset that is gone. The children are replaced by small stand-ins; the page's own
// logic is what runs.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import DataManagement from './DataManagement';

type DS = { id: number; name: string };
let server: DS[] = [];
const httpGet = vi.fn();

vi.mock('../api', () => ({
    httpGet: (...a: unknown[]) => httpGet(...a),
    httpPatch: vi.fn(),
}));
const kc = vi.hoisted(() => ({ authenticated: true, loadUserProfile: () => Promise.resolve({ username: 'u' }) }));
vi.mock('../contexts/KeycloakContext', () => ({ default: () => kc }));
vi.mock('../components/common/AgrovocSearchbar', () => ({
    default: (p: { handleResponse: (r: DS[]) => void; resetResult: () => void }) => (
        <>
            <button onClick={() => p.handleResponse([{ id: 2, name: 'beta' }])}>search</button>
            <button onClick={() => p.resetResult()}>reset</button>
        </>
    ),
}));
vi.mock('../components/datamanagement/List', () => ({
    default: (p: { datasets: DS[]; selected: readonly number[]; setSelected: (s: number[]) => void }) => (
        <ul>
            {p.datasets.map((d) => (
                <li key={d.id} onClick={() => p.setSelected([d.id])}>
                    {d.name}
                    {p.selected.includes(d.id) ? ' (selected)' : ''}
                </li>
            ))}
        </ul>
    ),
}));
vi.mock('../components/datamanagement/UploadDatasetDialog', () => ({ default: () => null }));
vi.mock('../components/datamanagement/ConvertDatasetDialog', () => ({ default: () => null }));
vi.mock('../components/datamanagement/DatasetInferenceDialog', () => ({ default: () => null }));

beforeEach(() => {
    server = [
        { id: 1, name: 'alpha' },
        { id: 2, name: 'beta' },
    ];
    httpGet.mockReset();
    httpGet.mockImplementation((_k: unknown, path: string) =>
        path.endsWith('/info') ? Promise.resolve({ available: false }) : Promise.resolve(server.map((d) => ({ ...d }))),
    );
});
afterEach(cleanup);

const mount = () =>
    render(
        <MemoryRouter>
            <DataManagement />
        </MemoryRouter>,
    );
const datasetGets = () => httpGet.mock.calls.filter((c) => c[1] === '/datasets' || String(c[1]).endsWith('/datasets')).length;

describe('DataManagement and platform_changed', () => {
    it('loads the list again and shows the new name', async () => {
        mount();
        await screen.findByText('alpha');
        const before = datasetGets();
        server = [{ id: 1, name: 'renamed' }, server[1]];
        act(() => notifyPlatformChange('datasets'));
        await screen.findByText('renamed', undefined, { timeout: 3000 });
        expect(datasetGets()).toBe(before + 1);
    });

    it('keeps an active search filter', async () => {
        mount();
        await screen.findByText('alpha');
        fireEvent.click(screen.getByText('search'));
        await waitFor(() => expect(screen.queryByText('alpha')).toBeNull());
        server = [...server, { id: 3, name: 'gamma' }];
        act(() => notifyPlatformChange('datasets'));
        await waitFor(() => expect(datasetGets()).toBeGreaterThan(1), { timeout: 3000 });
        await screen.findByText('beta');
        expect(screen.queryByText('gamma')).toBeNull();
        expect(screen.queryByText('alpha')).toBeNull();
    });

    it('drops a checked dataset that is gone', async () => {
        mount();
        fireEvent.click(await screen.findByText('alpha'));
        await screen.findByText('alpha (selected)');
        await screen.findByText('1 Dataset selected');
        server = [server[1]];
        act(() => notifyPlatformChange('datasets'));
        await waitFor(() => expect(screen.queryByText('1 Dataset selected')).toBeNull(), { timeout: 3000 });
        expect(screen.queryByText(/alpha/)).toBeNull();
    });
});
