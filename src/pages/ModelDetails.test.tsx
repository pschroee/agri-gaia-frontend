// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The model detail page loads quietly again when the gateway reports a change of models, and shows a notice with a
// link back to the list once the platform answers 404 (issue #167).

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import ModelDetails from './ModelDetails';

const httpGet = vi.fn();

vi.mock('../api', () => ({ httpGet: (...a: unknown[]) => httpGet(...a) }));
vi.mock('../contexts/KeycloakContext', () => ({ default: () => ({ authenticated: true }) }));
vi.mock('../components/models/ModelDetailsGrid', () => ({
    default: (p: { model: { name: string } }) => <div>grid {p.model.name}</div>,
}));

beforeEach(() => {
    httpGet.mockReset();
});
afterEach(cleanup);

const mount = () =>
    render(
        <MemoryRouter initialEntries={['/models/6']}>
            <Routes>
                <Route path="/models/:id" element={<ModelDetails />} />
                <Route path="/models" element={<div>model list</div>} />
            </Routes>
        </MemoryRouter>,
    );

describe('ModelDetails and platform_changed', () => {
    it('shows the new name without a loading state', async () => {
        httpGet.mockResolvedValueOnce({ id: 6, name: 'old' });
        mount();
        await screen.findByText('grid old');
        httpGet.mockResolvedValue({ id: 6, name: 'new' });
        act(() => notifyPlatformChange('models'));
        await screen.findByText('grid new', undefined, { timeout: 3000 });
    });

    it('shows a notice with a link when the model is gone', async () => {
        httpGet.mockResolvedValueOnce({ id: 6, name: 'old' });
        mount();
        await screen.findByText('grid old');
        httpGet.mockRejectedValue({ status: 404, message: '404 - Not Found' });
        act(() => notifyPlatformChange('models'));
        await screen.findByText(/This model no longer exists\. It may have been deleted\./, undefined, { timeout: 3000 });
        const link = screen.getByText('Back to models');
        expect(link.getAttribute('href')).toBe('/models');
        await waitFor(() => expect(screen.queryByText('grid old')).toBeNull());
    });
});
