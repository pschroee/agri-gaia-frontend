// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The registry page loads its list again when the gateway reports a built or removed image (issue #167): the image
// appears when the build task ends.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import ContainerImageManagement from './ContainerImageManagement';

const httpGet = vi.fn();

vi.mock('../api', () => ({ httpGet: (...a: unknown[]) => httpGet(...a) }));
vi.mock('../contexts/KeycloakContext', () => ({ default: () => ({ authenticated: true }) }));
vi.mock('../components/containers-images/List', () => ({
    default: (p: { containerImages: { id: number; repository: string; tag: string }[] }) => (
        <ul>
            {p.containerImages.map((i) => (
                <li key={i.id}>
                    {i.repository}:{i.tag}
                </li>
            ))}
        </ul>
    ),
}));
vi.mock('../components/containers-images/ContainerImageDownloadDialog', () => ({ default: () => null }));
vi.mock('../components/containers-images/ContainerImageDeployDialog', () => ({ default: () => null }));

beforeEach(() => {
    httpGet.mockReset();
});
afterEach(cleanup);

describe('ContainerImageManagement and platform_changed', () => {
    it('shows the image once the build ended', async () => {
        httpGet.mockResolvedValueOnce([]);
        render(<ContainerImageManagement />);
        await waitFor(() => expect(httpGet).toHaveBeenCalledTimes(1));
        httpGet.mockResolvedValue([{ id: 4, repository: 'me/img', tag: '1' }]);
        act(() => notifyPlatformChange('images'));
        await screen.findByText('me/img:1', undefined, { timeout: 3000 });
    });

    it('stays as it is for another area', async () => {
        httpGet.mockResolvedValue([]);
        render(<ContainerImageManagement />);
        await waitFor(() => expect(httpGet).toHaveBeenCalledTimes(1));
        act(() => notifyPlatformChange('datasets'));
        await new Promise((r) => setTimeout(r, 800));
        expect(httpGet).toHaveBeenCalledTimes(1);
    });
});
