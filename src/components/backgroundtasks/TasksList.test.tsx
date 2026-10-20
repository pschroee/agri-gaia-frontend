// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The task list marks tasks the agent started (issue #173).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IBackgroundTask } from '../../types/IBackgroundTask';
import TasksList from './TasksList';

const task = (id: number, startedByAgent?: boolean): IBackgroundTask => ({
    id,
    initiator: 'u',
    title: `Task ${id}`,
    creation_date: '2026-10-20T10:00:00',
    status: 'inprogress',
    completion_percentage: 0.5,
    startedByAgent,
});

afterEach(cleanup);

describe('TasksList', () => {
    it('shows the agent mark only on tasks the agent started', () => {
        render(
            <TasksList
                tasksList={[task(1, true), task(2)]}
                onDelete={vi.fn()}
                rowHeight={60}
                onTaskDetails={vi.fn()}
            />,
        );
        expect(screen.getAllByLabelText('Started by the agent')).toHaveLength(1);
    });
});
