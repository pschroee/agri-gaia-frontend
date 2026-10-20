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

import React, { useState, createContext, useEffect, useRef, useContext, ReactNode } from 'react';
import { httpDelete, httpGet } from '../api';
import useKeycloak from './KeycloakContext';
import { TASKS_PATH } from '../endpoints';
import { IBackgroundTask } from '../types/IBackgroundTask';
import { TaskStatus } from '../types/TaskStatus';

export interface ApplicationTasks {
    tasksList: IBackgroundTask[];
    addServerBackgroundTask: (
        keycloak: Keycloak.KeycloakInstance | undefined,
        tasks: ApplicationTasks,
        task: IBackgroundTask,
        taskCompleteCallback?: (task: IBackgroundTask) => void,
    ) => void;
    addClientBackgroundTask: (tasks: ApplicationTasks, task: IBackgroundTask) => void;
    deleteTask: (
        keycloak: Keycloak.KeycloakInstance | undefined,
        tasks: ApplicationTasks,
        task: IBackgroundTask,
    ) => void;
    startTaskPolling: (keycloak: Keycloak.KeycloakInstance | undefined, tasks: ApplicationTasks) => void;
    pollingIntervalId?: number;
}

const taskPollingInterval = 3000;

const TasksContext = createContext<ApplicationTasks | undefined>(undefined);

export const TasksProvider = function ({ children }: { children: ReactNode }) {
    const keycloak = useKeycloak();

    const startTaskPolling = (keycloak: Keycloak.KeycloakInstance | undefined, tasks: ApplicationTasks) => {
        if (tasks.pollingIntervalId) {
            return;
        }

        const intervalId = window.setInterval(
            (tasksRef: React.MutableRefObject<ApplicationTasks>) => {
                const tasks = tasksRef.current;
                const uncompletedTasks = tasks.tasksList.filter(
                    (task) => task.status === TaskStatus.created || task.status === TaskStatus.inprogress,
                );

                if (uncompletedTasks.length === 0) {
                    window.clearInterval(tasks.pollingIntervalId);
                    setTasks((tasks) => ({ ...tasks, pollingIntervalId: undefined }));
                    return;
                }

                const taskIdString = uncompletedTasks.map((task) => 'id=' + task.id).join('&');
                httpGet(keycloak, `${TASKS_PATH}?${taskIdString}`)
                    .then((updatedTasks: IBackgroundTask[]) => {
                        // Merge into the current state, not into the list read before the request: a task added in
                        // the meantime stays, and the client-only fields of a task survive the answer (#173).
                        const byId = new Map(updatedTasks.map((task) => [task.id, task]));
                        const before = tasksRef.current.tasksList;
                        setTasks((tasks) => ({
                            ...tasks,
                            tasksList: tasks.tasksList.map((task) => {
                                const updated = byId.get(task.id);
                                return updated
                                    ? {
                                          ...updated,
                                          taskCompleteCallback: task.taskCompleteCallback,
                                          startedByAgent: task.startedByAgent,
                                      }
                                    : task;
                            }),
                        }));
                        updatedTasks
                            .filter((task) => task.status === TaskStatus.completed || task.status === TaskStatus.failed)
                            .forEach((task) => {
                                const known = before.find((t) => t.id === task.id);
                                known?.taskCompleteCallback?.({
                                    ...task,
                                    taskCompleteCallback: known.taskCompleteCallback,
                                    startedByAgent: known.startedByAgent,
                                });
                            });
                    })
                    .catch(console.error);
            },
            taskPollingInterval,
            tasksRef,
        );

        setTasks((tasks) => ({ ...tasks, pollingIntervalId: intervalId }));
    };

    const addServerBackgroundTask = (
        keycloak: Keycloak.KeycloakInstance | undefined,
        tasks: ApplicationTasks,
        task: IBackgroundTask,
        taskCompleteCallback?: (task: IBackgroundTask) => void,
    ) => {
        task.taskCompleteCallback = taskCompleteCallback;
        tasks.tasksList.push(task);
        setTasks(tasks);
        if (task.status == 'created' || task.status == 'inprogress') {
            tasks.startTaskPolling(keycloak, tasks);
        }
    };

    const addClientBackgroundTask = (tasks: ApplicationTasks, task: IBackgroundTask) => {
        tasks.tasksList.push(task);
        setTasks(tasks);
    };

    const deleteTask = (
        keycloak: Keycloak.KeycloakInstance | undefined,
        tasks: ApplicationTasks,
        task: IBackgroundTask,
    ) => {
        httpDelete(keycloak, `${TASKS_PATH}/${task.id}`)
            .then(() => {
                const tasksList = tasks.tasksList;
                const index = tasksList.indexOf(task, 0);
                if (index > -1) {
                    tasksList.splice(index, 1);
                }
                setTasks((tasks) => ({ ...tasks, tasksList: tasksList }));
            })
            .catch(console.error);
    };

    const [tasks, setTasks] = useState<ApplicationTasks>({
        tasksList: [],
        addServerBackgroundTask: addServerBackgroundTask,
        addClientBackgroundTask: addClientBackgroundTask,
        deleteTask: deleteTask,
        startTaskPolling: startTaskPolling,
        pollingIntervalId: undefined,
    });
    const tasksRef = useRef<ApplicationTasks>(tasks);

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        const initialize = async () => {
            const userProfile = await keycloak?.loadUserProfile().catch(console.error);
            if (userProfile?.username !== undefined) {
                const serverTasks = await await httpGet(keycloak, `${TASKS_PATH}?initiator=${userProfile.username}`);

                setTasks((tasks) => ({ ...tasks, tasksList: serverTasks }));
                tasks.startTaskPolling(keycloak, tasks);
            } else {
                console.error('Could not fetch tasks because username is undefined');
            }
        };
        if (keycloak?.authenticated) {
            initialize().catch(console.error);
        }
    }, [keycloak]);

    return <TasksContext.Provider value={tasks}>{children}</TasksContext.Provider>;
};

export default function useApplicationTasks() {
    return useContext(TasksContext);
}
