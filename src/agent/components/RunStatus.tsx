// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import CloseIcon from '@mui/icons-material/Close';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { AgentApiError } from '../api';
import { RUN_STATE_LABEL, abortErrorText, isRunning, suspendErrorText } from '../runState';
import type { RunState } from '../runState';
import { Elapsed, RUN_STATE_COLOR, RunStateIcon } from './RunStateChip';
import { agentColors } from './tokens';

type Props = {
    state: RunState;
    /** Start of the running turn (ms). */
    since?: number;
    onAbort: () => Promise<void>;
    onSuspend: () => Promise<void>;
};

const SUBLINE: Record<RunState, string> = {
    working: 'messages you send now are queued',
    waiting: 'decide on the approval above',
    resuming: 'rebuilding the sandbox',
    idle: 'sandbox ready',
    dormant: 'your next message resumes it',
};

const errorOf = (e: unknown) => ({
    status: e instanceof AgentApiError ? e.status : undefined,
    message: e instanceof Error ? e.message : String(e),
});

/**
 * Run control above the input field: what the agent is doing and for how long, "Stop" while a turn runs and
 * "Let it rest" while the chat is idle. The single place to stop the agent (the input only sends).
 */
export default function RunStatus({ state, since, onAbort, onSuspend }: Props) {
    const [busy, setBusy] = useState<'stop' | 'rest'>();
    // stop requested: stays "Stopping …" until the turn has ended (the chat event follows the response)
    const [stopRequested, setStopRequested] = useState(false);
    const [error, setError] = useState<string>();
    const running = isRunning(state);

    useEffect(() => {
        if (!running) setStopRequested(false);
    }, [running]);
    // a new state makes an old error obsolete (a refused rest keeps the state, so its explanation stays)
    useEffect(() => setError(undefined), [state]);

    const stop = async () => {
        setBusy('stop');
        setError(undefined);
        try {
            await onAbort();
            setStopRequested(true);
        } catch (e) {
            const { status, message } = errorOf(e);
            setError(abortErrorText(status, message));
        } finally {
            setBusy(undefined);
        }
    };

    const rest = async () => {
        setBusy('rest');
        setError(undefined);
        try {
            await onSuspend();
        } catch (e) {
            const { status, message } = errorOf(e);
            setError(suspendErrorText(status, message));
        } finally {
            setBusy(undefined);
        }
    };

    const stopping = busy === 'stop' || (stopRequested && running);
    const color = RUN_STATE_COLOR[state];

    return (
        <Box component="section" aria-label="Run status" sx={{ mb: 1 }}>
            <Box
                role="status"
                aria-live="polite"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 30,
                    px: 1.25,
                    py: 0.25,
                    borderRadius: 1,
                    border: 1,
                    borderColor: state === 'waiting' ? agentColors.amberLine : 'divider',
                    bgcolor: state === 'waiting' ? agentColors.amberTint : running ? agentColors.greenTint : '#fff',
                }}
            >
                <RunStateIcon state={state} />
                <Box
                    sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}
                >
                    <Typography
                        component="span"
                        sx={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            color: state === 'idle' || state === 'dormant' ? 'text.primary' : color,
                        }}
                    >
                        {stopping ? 'Stopping …' : RUN_STATE_LABEL[state]}
                        {running && since !== undefined && (
                            <>
                                {' · '}
                                <Elapsed since={since} />
                            </>
                        )}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap>
                        {SUBLINE[state]}
                    </Typography>
                </Box>
                {running && (
                    <Tooltip title="Stop the agent. Queued messages stay and wait for you.">
                        <span>
                            <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                disabled={stopping}
                                onClick={() => void stop()}
                                startIcon={
                                    stopping ? (
                                        <CircularProgress size={12} color="inherit" />
                                    ) : (
                                        <StopCircleOutlinedIcon sx={{ fontSize: '16px !important' }} />
                                    )
                                }
                                sx={{ py: 0, fontSize: 12, flex: 'none', bgcolor: '#fff' }}
                            >
                                Stop
                            </Button>
                        </span>
                    </Tooltip>
                )}
                {state === 'idle' && (
                    <Tooltip title="Save the session and release the sandbox. Your next message resumes the chat.">
                        <span>
                            <Button
                                size="small"
                                color="inherit"
                                disabled={busy === 'rest'}
                                onClick={() => void rest()}
                                startIcon={
                                    busy === 'rest' ? (
                                        <CircularProgress size={12} color="inherit" />
                                    ) : (
                                        <BedtimeOutlinedIcon sx={{ fontSize: '16px !important' }} />
                                    )
                                }
                                sx={{ py: 0, fontSize: 12, flex: 'none', color: 'text.secondary' }}
                            >
                                Let it rest
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </Box>
            {error && (
                <Box
                    role="alert"
                    sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 0.5,
                        mt: 0.5,
                        px: 1.25,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: agentColors.amberTint,
                        border: 1,
                        borderColor: agentColors.amberLine,
                    }}
                >
                    <Typography sx={{ fontSize: 11.5, color: agentColors.amberText, flex: 1 }}>{error}</Typography>
                    <IconButton size="small" aria-label="Dismiss" onClick={() => setError(undefined)} sx={{ p: 0.25 }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                </Box>
            )}
        </Box>
    );
}
