// SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
// SPDX-FileContributor: Andreas Schliebitz
// SPDX-FileContributor: Henri Graf
// SPDX-FileContributor: Jonas Tüpker
// SPDX-FileContributor: Lukas Hesse
// SPDX-FileContributor: Maik Fruhner
// SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
// SPDX-FileContributor: Tobias Wamhof
// SPDX-FileContributor: Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { TaskStatus, TaskStatusType } from '../../types/TaskStatus';

export function getTaskStatusColor(status: TaskStatusType) {
    switch (status) {
        case TaskStatus.created:
            return 'textPrimary';
        case TaskStatus.inprogress:
            return '#00838f';
        case TaskStatus.completed:
            return 'green';
        case TaskStatus.failed:
            return 'red';
    }
    return 'textPrimary';
}

/** What the list shows for a status: the raw values "created" and "inprogress" mean "queued" and "running". */
export const TASK_STATUS_LABEL: Record<TaskStatusType, string> = {
    [TaskStatus.created]: 'queued',
    [TaskStatus.inprogress]: 'running',
    [TaskStatus.completed]: 'completed',
    [TaskStatus.failed]: 'failed',
};

/** Label of the footer button: "1 Task running · 1 queued", the same count as the tab "In Progress". */
export function footerLabel(running: number, queued: number): string {
    return `${running} ${running === 1 ? 'Task' : 'Tasks'} running${queued > 0 ? ` · ${queued} queued` : ''}`;
}
