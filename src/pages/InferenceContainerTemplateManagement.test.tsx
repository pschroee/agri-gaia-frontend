// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The template page loads its list again when the gateway reports a new template (issue #167), without the loading
// indicator that would replace the list.

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyPlatformChange } from '../agent/platformChanges';
import InferenceContainerTemplateManagement from './InferenceContainerTemplateManagement';

const httpGet = vi.fn();

vi.mock('../api', () => ({ httpGet: (...a: unknown[]) => httpGet(...a) }));
vi.mock('../contexts/KeycloakContext', () => ({ default: () => ({ authenticated: true }) }));
vi.mock('../components/common/Loading', () => ({
    default: (p: { isLoading: boolean }) => (p.isLoading ? <div>loading…</div> : null),
}));
vi.mock('../components/inference-container-templates/List', () => ({
    default: (p: { containerTemplates: { id: number; name: string }[] }) => (
        <ul>
            {p.containerTemplates.map((t) => (
                <li key={t.id}>{t.name}</li>
            ))}
        </ul>
    ),
}));
vi.mock('../components/inference-container-templates/InferenceContainerTemplateCreateDialog', () => ({ default: () => null }));
vi.mock('../components/inference-container-templates/InferenceContainerImageBuildDialog', () => ({ default: () => null }));
vi.mock('../components/inference-container-templates/InferenceContainerTemplateUpdateDialog', () => ({ default: () => null }));

beforeEach(() => {
    httpGet.mockReset();
});
afterEach(cleanup);

describe('InferenceContainerTemplateManagement and platform_changed', () => {
    it('shows the new template and never the loading indicator while reloading', async () => {
        httpGet.mockResolvedValueOnce([{ id: 1, name: 'first' }]);
        render(<InferenceContainerTemplateManagement />);
        await screen.findByText('first');
        httpGet.mockResolvedValue([
            { id: 1, name: 'first' },
            { id: 2, name: 'second' },
        ]);
        act(() => notifyPlatformChange('container-templates'));
        await screen.findByText('second', undefined, { timeout: 3000 });
        expect(screen.queryByText('loading…')).toBeNull();
        expect(httpGet).toHaveBeenCalledTimes(2);
    });
});
