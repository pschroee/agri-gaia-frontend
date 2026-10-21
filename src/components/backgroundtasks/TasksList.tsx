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

import { Grid, IconButton, Button, Tooltip, Typography, Box, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { TaskStatus } from '../../types/TaskStatus';
import { IBackgroundTask } from '../../types/IBackgroundTask';
import { getTaskStatusColor, TASK_STATUS_LABEL } from './utils';

export default function (props: {
    tasksList: IBackgroundTask[];
    onDelete: (task: IBackgroundTask) => void;
    rowHeight: number;
    emptyText?: string;
    onTaskDetails: (task: IBackgroundTask) => void;
}) {
    const { tasksList, onDelete, rowHeight, emptyText, onTaskDetails } = props;

    const hasTasks = tasksList.length > 0;
    const tasksEmptyText = emptyText || 'Currently no tasks';

    return (
        <Box>
            {hasTasks ? (
                tasksList.map((task) => {
                    return (
                        <Box key={task.id}>
                            <Box height={rowHeight} justifyContent="center" alignItems="center" display="flex">
                                <Grid container justifyContent="space-between" alignItems="center">
                                    <Grid item xs={8}>
                                        {task.startedByAgent && (
                                            <Tooltip title="Started by the agent">
                                                <AutoAwesomeIcon
                                                    fontSize="small"
                                                    color="primary"
                                                    aria-label="Started by the agent"
                                                    sx={{ verticalAlign: 'middle', mr: 1 }}
                                                />
                                            </Tooltip>
                                        )}
                                        {task.title || `Task: ${task.id}`}
                                    </Grid>
                                    <Grid item xs={2}>
                                        <Typography sx={{ color: getTaskStatusColor(task.status) }}>
                                            {TASK_STATUS_LABEL[task.status] ?? task.status}
                                        </Typography>
                                    </Grid>
                                    <Grid container item xs={2} alignItems="center">
                                        <Grid item xs={6}>
                                            <Button variant="outlined" onClick={() => onTaskDetails(task)}>
                                                Details
                                            </Button>
                                        </Grid>
                                        <Grid item xs={6}>
                                            <Tooltip title="Delete">
                                                <IconButton
                                                    onClick={() => {
                                                        onDelete(task);
                                                    }}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Grid>
                                    </Grid>
                                </Grid>
                            </Box>
                            {task.id !== tasksList[tasksList.length - 1].id && <Divider />}
                        </Box>
                    );
                })
            ) : (
                <>
                    <Box sx={{ p: 3 }} justifyContent="center" alignItems="center" display="flex">
                        <Typography>{tasksEmptyText}</Typography>
                    </Box>
                </>
            )}
        </Box>
    );
}
