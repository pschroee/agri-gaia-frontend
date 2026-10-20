// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The edge device detail page loads again without the loading indicator when the gateway reports a change of edge
// devices or deployments, and shows a notice once the platform answers 404 (issue #167).

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import EdgeDetails from './EdgeDetails';

const httpGet = vi.fn();

vi.mock('../api', () => ({ httpGet: (...a: unknown[]) => httpGet(...a) }));
vi.mock('../contexts/KeycloakContext', () => ({ default: () => ({ authenticated: true }) }));
vi.mock('../components/edge/EdgeDetailsGrid', () => ({ default: () => <div>device grid</div> }));
vi.mock('../components/edge/ContainerDeploymentList', () => ({
    default: (p: { containerDeployments?: { id: number }[] }) => <div>deployments {p.containerDeployments?.length ?? 0}</div>,
}));

beforeEach(() => {
    httpGet.mockReset();
});
afterEach(cleanup);

const mount = () =>
    render(
        <MemoryRouter initialEntries={['/edge/3']}>
            <Routes>
                <Route path="/edge/:id" element={<EdgeDetails />} />
                <Route path="/edge" element={<div>device list</div>} />
            </Routes>
        </MemoryRouter>,
    );

describe('EdgeDetails and platform_changed', () => {
    it('shows the new deployments and never the loading text while reloading', async () => {
        httpGet.mockResolvedValueOnce({ id: 3, name: 'sim', container_deployments: [] });
        mount();
        await screen.findByText('deployments 0');
        httpGet.mockResolvedValue({ id: 3, name: 'sim', container_deployments: [{ id: 1 }] });
        act(() => notifyPlatformChange('edge-devices'));
        let sawLoading = false;
        await waitFor(
            () => {
                if (screen.queryByText(/Fetching Device Details/)) sawLoading = true;
                expect(screen.getByText('deployments 1')).toBeTruthy();
            },
            { timeout: 3000 },
        );
        expect(sawLoading).toBe(false);
    });

    it('shows a notice with a link when the device is gone', async () => {
        httpGet.mockResolvedValueOnce({ id: 3, name: 'sim', container_deployments: [] });
        mount();
        await screen.findByText('deployments 0');
        httpGet.mockRejectedValue({ status: 404, message: '404 - Not Found' });
        act(() => notifyPlatformChange('edge-devices'));
        await screen.findByText(/This edge device no longer exists\./, undefined, { timeout: 3000 });
        expect(screen.getByText('Back to edge devices').getAttribute('href')).toBe('/edge');
    });
});
