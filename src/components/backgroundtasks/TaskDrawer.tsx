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

import { useState } from 'react';
import { SwipeableDrawer, Box, Button, Tooltip, Typography, createTheme } from '@mui/material';
import { ThemeProvider } from '@emotion/react';
import { Autorenew } from '@mui/icons-material';
import { IBackgroundTask } from '../../types/IBackgroundTask';
import useApplicationTasks from '../../contexts/TasksContext';
import { TaskStatus } from '../../types/TaskStatus';
import ErrorIcon from '@mui/icons-material/Error';
import TasksTabs from './TasksTabs';
import TaskDetailsView from './TaskDetailsView';
import { footerLabel } from './utils';
import { footerTooltip, useFailedSeen } from './failedSeen';

const taskHeight = 60;
const minDrawerHeight = 500;

const createDrawerTheme = (taskCount: number) =>
    createTheme({
        components: {
            MuiButton: {
                styleOverrides: {
                    root: {
                        color: 'inherit',
                        textTransform: 'none',
                        padding: 'unset',
                        ':disabled': { color: 'white' },
                    },
                },
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        position: 'absolute',
                        height: Math.max(taskCount * taskHeight + 62, minDrawerHeight),
                        borderColor: '#79ab2b',
                        borderStyle: 'solid',
                        borderTopWidth: 3,
                        borderRightWidth: 3,
                        borderLeftWidth: 3,
                        borderBottomWidth: 0,
                        overflow: 'visible',
                        width: 800,
                        left: 'auto',
                        right: 30,
                        bottom: 30,
                        borderTopLeftRadius: 8,
                        borderTopRightRadius: 8,
                    },
                },
            },
        },
    });

const getFirstOpenedTab = (task?: IBackgroundTask) => {
    if (task === undefined) {
        return task;
    }
    if (task.status === TaskStatus.created || task.status === TaskStatus.inprogress) {
        return 0;
    }
    return 1;
};

export default function () {
    const tasks = useApplicationTasks();
    const tasksList = tasks?.tasksList || [];

    const [open, setOpen] = useState(false);
    // opening with unseen failures starts on "Completed" (#228); the key mounts the tabs anew
    const [tabsStart, setTabsStart] = useState<number | undefined>(undefined);
    const [tabsKey, setTabsKey] = useState(0);
    const [openedTask, setOpenedTask] = useState<IBackgroundTask | undefined>(undefined);
    const [lastOpenedTask, setLastOpenedTask] = useState<IBackgroundTask | undefined>(undefined);
    const numRunningTasks = tasksList.filter((task) => task.status === TaskStatus.inprogress).length;
    const numQueuedTasks = tasksList.filter((task) => task.status === TaskStatus.created).length;
    const hasActiveTasks = numRunningTasks > 0;
    const { unseen, markSeen } = useFailedSeen(tasksList, !!tasks?.loaded);
    const finishedTasks = tasksList.filter(
        (task) => task.status === TaskStatus.completed || task.status === TaskStatus.failed,
    );
    const unfinishedTasks = tasksList.filter(
        (task) => task.status === TaskStatus.created || task.status === TaskStatus.inprogress,
    );

    const onTaskDetailsClose = () => {
        setLastOpenedTask(openedTask);
        setOpenedTask(undefined);
    };

    const onFooterClick = () => {
        if (!open && unseen.length > 0) {
            setTabsStart(1);
            setTabsKey((k) => k + 1);
            markSeen();
        } else if (!open) {
            setTabsStart(undefined);
        }
        setOpen(!open);
    };

    const getFooterButtonLabel = () => footerLabel(numRunningTasks, numQueuedTasks, unseen.length);

    return (
        <ThemeProvider theme={createDrawerTheme(Math.max(unfinishedTasks.length, finishedTasks.length))}>
            <Tooltip title={footerTooltip(unseen)}>
                <Button
                    variant="text"
                    onClick={onFooterClick}
                    data-testid="footer-tasks-button"
                    data-failed-unseen={unseen.length}
                    startIcon={<Autorenew sx={{ animation: hasActiveTasks ? 'spin 4s linear infinite' : undefined }} />}
                    endIcon={unseen.length > 0 ? <ErrorIcon sx={{ fontSize: 18, color: '#ff8a80' }} /> : undefined}
                >
                    <Typography> {getFooterButtonLabel()}</Typography>
                </Button>
            </Tooltip>
            <SwipeableDrawer
                id="task-drawer"
                anchor="bottom"
                open={open}
                onClose={() => setOpen(false)}
                onOpen={() => setOpen(true)}
                hideBackdrop={false}
                disableSwipeToOpen
                ModalProps={{
                    keepMounted: true,
                }}
            >
                <Box sx={{ px: 2, py: 1 }}>
                    {openedTask ? (
                        <TaskDetailsView task={openedTask} onClose={onTaskDetailsClose} />
                    ) : (
                        <TasksTabs
                            key={tabsKey}
                            firstOpenTab={tabsStart ?? getFirstOpenedTab(lastOpenedTask)}
                            tasks={tasks}
                            taskHeight={taskHeight}
                            onTaskDetails={setOpenedTask}
                        />
                    )}
                </Box>
            </SwipeableDrawer>
        </ThemeProvider>
    );
}
