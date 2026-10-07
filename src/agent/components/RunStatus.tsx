// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';

import { AgentApiError } from '../api';
import { abortErrorText, isRunning, runStateText, showRunStatus } from '../runState';
import type { RunState } from '../runState';
import { Elapsed, RUN_STATE_COLOR, RunStateIcon } from './RunStateChip';
import { agentColors } from './tokens';

type Props = {
    state: RunState | undefined;
    /** Start of the running turn (ms). */
    since?: number;
    onAbort: () => Promise<void>;
};

const SUBLINE: Partial<Record<RunState, string>> = {
    working: 'messages you send now are queued',
    waiting: 'decide on the approval above',
};

const errorOf = (e: unknown) => ({
    status: e instanceof AgentApiError ? e.status : undefined,
    message: e instanceof Error ? e.message : String(e),
});

/**
 * Run control above the input field: what the agent is doing and for how long, and "Stop" while a turn runs. The
 * single place to stop the agent (the input only sends). There is no manual suspend (issue #31): the gateway
 * releases an unused sandbox on its own, and the idle state is never shown.
 *
 * The bar is open only while a turn runs (issue #35); a ready or loading chat has none (loading shows its steps in
 * the transcript). It opens and closes with a short height transition instead of reserving empty space, so the
 * input glides by the bar's height (about 38 px) once per turn; the transcript stays at its end meanwhile
 * (`useStickToBottom` follows size changes).
 */
export default function RunStatus({ state, since, onAbort }: Props) {
    const [busy, setBusy] = useState<'stop'>();
    // stop requested: stays "Stopping …" until the turn has ended (the chat event follows the response)
    const [stopRequested, setStopRequested] = useState(false);
    const [error, setError] = useState<string>();
    const running = isRunning(state);

    useEffect(() => {
        if (!running) setStopRequested(false);
    }, [running]);
    // a new state makes an old error obsolete
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

    const stopping = busy === 'stop' || (stopRequested && running);
    const open = showRunStatus(state, error);
    // while the bar closes it keeps the last running state, so it does not flash another text on its way out
    const lastShown = useRef<RunState>('working');
    if (isRunning(state)) lastShown.current = state as RunState;
    const shown = isRunning(state) ? (state as RunState) : lastShown.current;
    const color = RUN_STATE_COLOR[shown];

    return (
        <Collapse in={open} timeout={{ enter: 180, exit: 220 }} unmountOnExit>
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
                    borderColor: shown === 'waiting' ? agentColors.amberLine : 'divider',
                    bgcolor: shown === 'waiting' ? agentColors.amberTint : agentColors.greenTint,
                }}
            >
                <RunStateIcon state={shown} />
                <Box
                    sx={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}
                >
                    <Typography
                        component="span"
                        sx={{
                            fontSize: 12.5,
                            fontWeight: 500,
                            color,
                        }}
                    >
                        {stopping ? 'Stopping …' : runStateText(shown, 'bar')}
                        {running && since !== undefined && (
                            <>
                                {' · '}
                                <Elapsed since={since} />
                            </>
                        )}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap>
                        {SUBLINE[shown]}
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
        </Collapse>
    );
}
