// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The footer button counts running and queued tasks, like the tab "In Progress" (issue #197).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { footerLabel } from './utils';

let tasksList: { id: number; status: string; title: string }[] = [];
vi.mock('../../contexts/TasksContext', () => ({ default: () => ({ tasksList }) }));
vi.mock('./TasksTabs', () => ({ default: () => null }));
vi.mock('./TaskDetailsView', () => ({ default: () => null }));

import TaskDrawer from './TaskDrawer';

afterEach(cleanup);

const t = (id: number, status: string) => ({ id, status, title: `T${id}` });

describe('footerLabel', () => {
    it('names running and queued tasks', () => {
        expect(footerLabel(1, 1)).toBe('1 Task running · 1 queued');
        expect(footerLabel(0, 1)).toBe('0 Tasks running · 1 queued');
        expect(footerLabel(2, 0)).toBe('2 Tasks running');
    });
});

describe('TaskDrawer footer', () => {
    it('counts the created task as queued', () => {
        tasksList = [t(1, 'inprogress'), t(2, 'created')];
        render(<TaskDrawer />);
        expect(screen.getByText(/1 Task running · 1 queued/)).toBeTruthy();
    });

    it('does not spin when only queued tasks exist', () => {
        tasksList = [t(2, 'created')];
        const { container } = render(<TaskDrawer />);
        expect(screen.getByText(/0 Tasks running · 1 queued/)).toBeTruthy();
        const icon = container.querySelector('[data-testid="AutorenewIcon"]') as HTMLElement;
        expect(getComputedStyle(icon).animationName).not.toContain('spin');
    });
});
