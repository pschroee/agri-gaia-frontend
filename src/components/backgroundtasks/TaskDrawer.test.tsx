// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The footer button counts running and queued tasks, like the tab "In Progress" (issue #197).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { footerLabel } from './utils';

let tasksList: { id: number; status: string; title: string }[] = [];
vi.mock('../../contexts/TasksContext', () => ({ default: () => ({ tasksList, loaded: true }) }));
const tabsProps = vi.hoisted(() => ({ last: undefined as { firstOpenTab?: number } | undefined }));
vi.mock('./TasksTabs', () => ({
    default: (p: { firstOpenTab?: number }) => {
        tabsProps.last = p;
        return null;
    },
}));
vi.mock('./TaskDetailsView', () => ({ default: () => null }));

import TaskDrawer, { drawerPaperHeight } from './TaskDrawer';

beforeEach(() => {
    localStorage.clear();
    tabsProps.last = undefined;
});
afterEach(cleanup);

const t = (id: number, status: string) => ({ id, status, title: `T${id}` });

describe('footerLabel', () => {
    it('names running and queued tasks', () => {
        expect(footerLabel(1, 1)).toBe('1 Task running · 1 queued');
        expect(footerLabel(0, 1)).toBe('0 Tasks running · 1 queued');
        expect(footerLabel(2, 0)).toBe('2 Tasks running');
        expect(footerLabel(0, 0, 1)).toBe('0 Tasks running · 1 failed');
        expect(footerLabel(1, 1, 2)).toBe('1 Task running · 1 queued · 2 failed');
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

describe('TaskDrawer failures (#228)', () => {
    it('shows no failure symbol for failures that were there on the first visit', () => {
        tasksList = [t(1, 'failed'), t(2, 'completed')];
        const { container } = render(<TaskDrawer />);
        expect(container.querySelector('[data-testid="ErrorIcon"]')).toBeNull();
        expect(screen.getByTestId('footer-tasks-button').getAttribute('data-failed-unseen')).toBe('0');
        expect(screen.getByText(/0 Tasks running$/)).toBeTruthy();
    });

    it('shows the text and the symbol for an unseen failure', () => {
        localStorage.setItem('tasksFailedSeen', JSON.stringify({ ids: [1] }));
        tasksList = [t(1, 'failed'), t(3, 'failed')];
        const { container } = render(<TaskDrawer />);
        expect(container.querySelector('[data-testid="ErrorIcon"]')).toBeTruthy();
        expect(screen.getByText(/0 Tasks running · 1 failed/)).toBeTruthy();
        expect(screen.getByTestId('footer-tasks-button').getAttribute('data-failed-unseen')).toBe('1');
    });

    it('opens on "Completed" and drops the symbol after a click', () => {
        localStorage.setItem('tasksFailedSeen', JSON.stringify({ ids: [1] }));
        tasksList = [t(1, 'failed'), t(3, 'failed')];
        const { container } = render(<TaskDrawer />);
        fireEvent.click(screen.getByTestId('footer-tasks-button'));
        expect(container.querySelector('[data-testid="ErrorIcon"]')).toBeNull();
        expect(screen.getByText(/0 Tasks running$/)).toBeTruthy();
        expect(tabsProps.last?.firstOpenTab).toBe(1);
        expect(JSON.parse(localStorage.getItem('tasksFailedSeen') ?? '{}').ids).toEqual([1, 3]);
    });
});

describe('TaskDrawer height (#262)', () => {
    it('keeps the minimum for few tasks', () => {
        expect(drawerPaperHeight(3)).toContain('500px');
    });

    it('grows with many tasks but is capped below the app bar', () => {
        const h = drawerPaperHeight(40);
        expect(h).toContain('2462px');
        expect(h).toContain('calc(100% - 64px - 30px - 8px)');
        expect(h.startsWith('min(')).toBe(true);
    });

    it('scrolls the content inside the drawer', () => {
        tasksList = Array.from({ length: 40 }, (_, i) => t(i + 1, 'completed'));
        render(<TaskDrawer />);
        const content = screen.getByTestId('task-drawer-content');
        const style = getComputedStyle(content);
        expect(style.overflowY).toBe('auto');
        expect(style.height).toBe('100%');
    });
});
