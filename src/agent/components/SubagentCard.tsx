// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { canStopRun } from '../subagents';
import type { StopState, SubagentNavItem } from '../subagents';
import EllipsisText from './EllipsisText';
import { SubagentIcon, SubagentState } from './SubagentState';

/**
 * The subagents an answer started (issue #54): one card with a row per run, robot, title, state and a chevron; a click
 * opens the subagent read-only. Takes the place of the links under the `subagent` call. A running row carries a stop
 * control that does not open the subagent; a refused stop shows as a snackbar in the card's corner (issue #120).
 */
export default function SubagentCard({
    items,
    onOpen,
    onStop,
    stopStateOf,
    stopErrorOf,
    onDismissStopError,
}: {
    items: SubagentNavItem[];
    onOpen: (runId: string) => void;
    /** Stops one running subagent (issue #120); the ID is the newest run of the row's thread. */
    onStop?: (runId: string) => void;
    /** UI state of a stop of that run (issue #120): "idle", "stopping" or "error". */
    stopStateOf?: (runId: string) => StopState;
    /** Text of the refused stop of that run (issue #120); undefined when there is none. */
    stopErrorOf?: (runId: string) => string | undefined;
    /** Takes that text away (issue #120). */
    onDismissStopError?: (runId: string) => void;
}) {
    // Focus of the stop control (design, issue #120): while the stop is on its way it stays on the locked control;
    // when the control disappears with the run it stopped, the row takes the focus over instead of the body.
    const focusedRun = useRef<string | undefined>(undefined);
    const rows = useRef(new Map<string, HTMLElement | null>());
    useEffect(() => {
        const run = focusedRun.current;
        if (!run) return;
        if (document.querySelector(`[data-testid="agent-subagent-stop"][data-run="${run}"]`)) return;
        rows.current.get(run)?.focus();
        focusedRun.current = undefined;
    });
    if (items.length === 0) return null;
    // a stop is addressed to the newest run of a thread (issue #120), like a message (issue #81)
    const addressed = (it: SubagentNavItem) => it.latest ?? it.runId;
    const failed = onDismissStopError ? items.map(addressed).find((run) => !!stopErrorOf?.(run)) : undefined;
    const dismiss = () => {
        if (failed) onDismissStopError?.(failed);
    };
    const stopping = (it: SubagentNavItem) => it.stopping || stopStateOf?.(addressed(it)) === 'stopping';
    return (
        <Box
            data-testid="agent-subagent-card"
            sx={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid rgba(0, 0, 0, 0.12)',
                borderRadius: '4px',
                overflow: 'hidden',
                minWidth: 0,
            }}
        >
            {items.map((it, i) => (
                <ButtonBase
                    key={it.runId}
                    ref={(el: HTMLElement | null) => rows.current.set(it.runId, el)}
                    data-testid="agent-step-subagent"
                    data-run-id={it.runId}
                    onClick={() => onOpen(it.runId)}
                    aria-label={`Open subagent ${it.title}`}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        minHeight: 48,
                        pl: 1.5,
                        pr: 1,
                        minWidth: 0,
                        justifyContent: 'flex-start',
                        textAlign: 'left',
                        borderTop: i ? '1px solid rgba(0, 0, 0, 0.12)' : 'none',
                        '&:hover': { bgcolor: 'rgba(94, 53, 177, 0.04)' },
                    }}
                >
                    <SubagentIcon size={20} />
                    {/* minWidth: 0: the title gives way, so state, stop control and chevron always have their room */}
                    <EllipsisText text={it.title} sx={{ flex: 1, minWidth: 0, fontSize: 14 }} />
                    <SubagentState status={it.status} stoppedBy={it.stoppedBy} stopping={stopping(it)} />
                    {onStop && canStopRun(it.status) && (
                        // its own hit area: a click on the stop must not open the subagent; while "stopping …" the
                        // control stays in place, just disabled (issue #120)
                        <Tooltip title="Stop subagent">
                            <span>
                                <IconButton
                                    size="small"
                                    color="error"
                                    data-testid="agent-subagent-stop"
                                    data-run={addressed(it)}
                                    aria-label={`Stop subagent ${it.title}`}
                                    disabled={stopping(it)}
                                    onFocus={() => (focusedRun.current = addressed(it))}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStop(addressed(it));
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    sx={{ flex: 'none' }}
                                >
                                    <StopCircleOutlinedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    )}
                    <ChevronRightIcon sx={{ fontSize: 20, color: 'rgba(0, 0, 0, 0.38)', flex: 'none' }} />
                </ButtonBase>
            ))}
            <Snackbar
                open={!!failed}
                autoHideDuration={6000}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                onClose={dismiss}
            >
                <Alert severity="error" variant="filled" onClose={dismiss} data-testid="agent-subagent-stop-error">
                    {failed ? stopErrorOf?.(failed) : ''}
                </Alert>
            </Snackbar>
        </Box>
    );
}
