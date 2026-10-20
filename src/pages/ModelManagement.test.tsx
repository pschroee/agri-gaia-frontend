// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The model page loads its list again when the gateway reports a change (issue #167), keeps an active keyword
// search and drops a checked model that is gone. The children are replaced by small stand-ins; the page's own
// logic is what runs.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import ModelManagement from './ModelManagement';

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
vi.mock('../components/models/List', () => ({
    default: (p: { models: DS[]; selected: readonly number[]; setSelected: (s: number[]) => void }) => (
        <ul>
            {p.models.map((d) => (
                <li key={d.id} onClick={() => p.setSelected([d.id])}>
                    {d.name}
                    {p.selected.includes(d.id) ? ' (selected)' : ''}
                </li>
            ))}
        </ul>
    ),
}));
vi.mock('../components/models/UploadModelDialog', () => ({ default: () => null }));
vi.mock('../components/models/ModelInferenceButton', () => ({ default: () => null }));

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
            <ModelManagement />
        </MemoryRouter>,
    );
const modelGets = () => httpGet.mock.calls.filter((c) => c[1] === '/models' || String(c[1]).endsWith('/models')).length;

describe('ModelManagement and platform_changed', () => {
    it('loads the list again and shows the new name', async () => {
        mount();
        await screen.findByText('alpha');
        const before = modelGets();
        server = [{ id: 1, name: 'renamed' }, server[1]];
        act(() => notifyPlatformChange('models'));
        await screen.findByText('renamed', undefined, { timeout: 3000 });
        expect(modelGets()).toBe(before + 1);
    });

    it('keeps an active search filter', async () => {
        mount();
        await screen.findByText('alpha');
        fireEvent.click(screen.getByText('search'));
        await waitFor(() => expect(screen.queryByText('alpha')).toBeNull());
        server = [...server, { id: 3, name: 'gamma' }];
        act(() => notifyPlatformChange('models'));
        await waitFor(() => expect(modelGets()).toBeGreaterThan(1), { timeout: 3000 });
        await screen.findByText('beta');
        expect(screen.queryByText('gamma')).toBeNull();
        expect(screen.queryByText('alpha')).toBeNull();
    });

    it('drops a checked model that is gone', async () => {
        mount();
        fireEvent.click(await screen.findByText('alpha'));
        await screen.findByText('alpha (selected)');
        await screen.findByText('1 Model selected');
        server = [server[1]];
        act(() => notifyPlatformChange('models'));
        await waitFor(() => expect(screen.queryByText('1 Model selected')).toBeNull(), { timeout: 3000 });
        expect(screen.queryByText(/alpha/)).toBeNull();
    });
});
