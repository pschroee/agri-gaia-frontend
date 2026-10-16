// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Smoke test of the deployment card (edge D-E4): what stands on it per state, the chevron as the only control, the
// details behind it, the progress of a running job and the two layouts. The wording and the derivation are checked in
// deploymentCard.test.ts; here the card only has to put them together.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deploymentCardOf } from '../deploymentCard';
import type { DeploymentCardData } from '../deploymentCard';
import type { WatchJob } from '../jobs';
import DeploymentCard from './DeploymentCard';

afterEach(cleanup);

const job = (over: Partial<WatchJob> = {}): WatchJob => ({
    id: 'j1',
    chat_id: 'c1',
    kind: 'edge_deployment',
    ref: 'deployment:7|task:12',
    tool_call_id: 'call-1',
    state: 'running',
    ...over,
});

/** The answer of platform_deployment_status, read the way the transcript reads it. */
const card = (over: Record<string, unknown> = {}): DeploymentCardData => {
    const json = {
        deployment_id: 7,
        name: 'agw-mnist-v1',
        status: 'deployed',
        device: { id: 1, name: 'sim-edge-01', online: true, last_heartbeat: '2026-10-16T12:51:58' },
        image: 'agent-test/mnist-triton:v1',
        ports: ['18100->8000/tcp'],
        docker_container_id_present: true,
        created_at: '2026-10-16T12:52:07',
        ...over,
    };
    const data = deploymentCardOf('platform.deployment_status', `HTTP 200\n${JSON.stringify(json)}`);
    if (!data) throw new Error('the fixture is not a deployment result');
    return data;
};

const text = (id: string) => screen.getByTestId(id).textContent ?? '';

describe('DeploymentCard', () => {
    it('shows name, status, device, image, ports and the hint in the panel', () => {
        render(<DeploymentCard data={card()} layout="panel" />);
        expect(text('agent-deployment-name')).toBe('agw-mnist-v1');
        expect(text('agent-deployment-chip')).toContain('deployed');
        expect(text('agent-deployment-device')).toBe('sim-edge-01');
        expect(text('agent-deployment-seen')).toContain('online · last seen');
        expect(text('agent-deployment-image')).toContain('mnist-triton:v1');
        expect(text('agent-deployment-ports')).toBe('18100 → 8000/tcp');
        expect(text('agent-deployment-task')).toBe('Container started on device');
        expect(text('agent-deployment-hint')).toBe('The platform does not check whether the container still runs.');
    });

    it('is read-only: the chevron is the only control and opens the details', () => {
        const { container } = render(<DeploymentCard data={card()} layout="panel" />);
        expect(container.querySelectorAll('button')).toHaveLength(1);
        const toggle = screen.getByTestId('agent-deployment-toggle');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByTestId('agent-deployment-details')).toBeNull();
        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        const details = text('agent-deployment-details');
        expect(details).toContain('Task ID');
        expect(details).toContain('Container ID present');
        expect(details).toContain('Device last check-in');
    });

    it('writes the state of every case: created, starting, deployed, failed, offline, undeployed', () => {
        const cases: { view: string; data: DeploymentCardData; job?: WatchJob; task: string }[] = [
            { view: 'created', data: card({ status: 'created' }), task: 'No task yet' },
            { view: 'starting', data: card({ status: 'created' }), job: job(), task: 'Pulling image on device…' },
            { view: 'deployed', data: card(), task: 'Container started on device' },
            {
                view: 'failed',
                data: card({ status: 'created', task: { status: 'failed', message: 'Image pull failed' } }),
                task: 'Image pull failed',
            },
            {
                view: 'offline',
                data: card({ device: { name: 'sim-edge-01', online: false } }),
                task: 'Container started on device',
            },
            { view: 'undeployed', data: card({ status: 'undeployed' }), task: 'Container stopped and removed' },
        ];
        for (const c of cases) {
            cleanup();
            render(<DeploymentCard data={c.data} job={c.job} layout="panel" />);
            expect(screen.getByTestId('agent-deployment-card').getAttribute('data-view')).toBe(c.view);
            expect(text('agent-deployment-task')).toBe(c.task);
        }
    });

    it('shows the progress of a running job, determinate once it reports a percent', () => {
        const { unmount } = render(<DeploymentCard data={card({ status: 'created' })} job={job()} layout="panel" />);
        expect(screen.getByTestId('agent-deployment-progress').classList.contains('MuiLinearProgress-indeterminate'))
            .toBe(true);
        unmount();
        render(<DeploymentCard data={card({ status: 'created' })} job={job({ progress: 40 })} layout="panel" />);
        expect(screen.getByTestId('agent-deployment-progress').classList.contains('MuiLinearProgress-determinate')).toBe(
            true,
        );
    });

    it('shows the task message in the details of a failed start', () => {
        const failed = card({ status: 'created', task: { status: 'failed', message: 'Error response from daemon' } });
        render(<DeploymentCard data={failed} layout="panel" />);
        fireEvent.click(screen.getByTestId('agent-deployment-toggle'));
        const message = text('agent-deployment-message');
        expect(message).toContain('Task message');
        expect(message).toContain('Error response from daemon');
    });

    it('links the device to its page on the platform', () => {
        render(<DeploymentCard data={card()} layout="panel" />);
        expect(screen.getByRole('link').getAttribute('href')).toBe('/edge/1');
    });

    it('renders the page layout with labelled columns and the update time when it has room', () => {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 760, height: 130 } as DOMRect);
        render(<DeploymentCard data={card()} layout="page" />);
        expect(screen.getByText('Edge device')).toBeTruthy();
        expect(screen.getByText('Image')).toBeTruthy();
        expect(screen.getByText('Ports')).toBeTruthy();
        expect(text('agent-deployment-updated')).toMatch(/^updated /);
        vi.restoreAllMocks();
    });

    it('keeps the panel rows on the page while it is narrower than 600 px', () => {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 420, height: 130 } as DOMRect);
        render(<DeploymentCard data={card()} layout="page" />);
        expect(screen.queryByText('Edge device')).toBeNull();
        expect(screen.getByTestId('agent-deployment-ports')).toBeTruthy();
        vi.restoreAllMocks();
    });
});
