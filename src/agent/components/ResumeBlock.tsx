// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ReplayIcon from '@mui/icons-material/Replay';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import { formatMs } from '../format';
import { RESUME_STEP_LABEL, resumeSummary, stepDetail } from '../resume';
import type { ResumeStepView, ResumeView } from '../resume';
import { agentColors, blockSx } from './tokens';

function StepIcon({ status }: { status: ResumeStepView['status'] }) {
    const sx = { fontSize: 14, mt: '2px', flex: 'none' };
    switch (status) {
        case 'running':
            return <CircularProgress size={12} sx={{ mt: '3px', mx: '1px', flex: 'none' }} aria-label="running" />;
        case 'done':
            return <CheckIcon sx={{ ...sx, color: agentColors.ok }} aria-label="done" />;
        case 'warning':
            return <WarningAmberIcon sx={{ ...sx, color: agentColors.amber }} aria-label="with warning" />;
        case 'error':
            return <CloseIcon sx={{ ...sx, color: agentColors.red }} aria-label="failed" />;
        default:
            return <RadioButtonUncheckedIcon sx={{ ...sx, color: 'text.disabled' }} aria-label="pending" />;
    }
}

function Steps({ steps }: { steps: ResumeStepView[] }) {
    return (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.4 }}>
            {steps.map((s) => {
                const detail = stepDetail(s);
                const finished = s.status !== 'pending' && s.status !== 'running';
                return (
                    <Box
                        component="li"
                        key={s.phase}
                        sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 0.75,
                            fontSize: 12,
                            minWidth: 0,
                            color: s.status === 'pending' ? 'text.disabled' : 'text.primary',
                        }}
                    >
                        <StepIcon status={s.status} />
                        <Box component="span" sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                            {RESUME_STEP_LABEL[s.phase]}
                            {detail && (
                                <Box
                                    component="span"
                                    sx={{
                                        color: s.status === 'done' ? 'text.secondary' : agentColors.amberText,
                                        fontWeight: s.status === 'done' ? 400 : 500,
                                    }}
                                >
                                    {' · '}
                                    {detail}
                                </Box>
                            )}
                        </Box>
                        {finished && s.ms !== undefined && (
                            <Box
                                component="span"
                                sx={{ flex: 'none', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
                            >
                                {formatMs(s.ms)}
                            </Box>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}

/**
 * Resuming a chat (or starting its first sandbox) in the transcript: while it runs (or when it failed) a block with the
 * steps live; afterwards one line that can be expanded again. A failed one offers "Try again" (`onRetry`).
 */
export default function ResumeBlock({ resume, onRetry }: { resume: ResumeView; onRetry?: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const retry = async () => {
        if (!onRetry) return;
        setRetrying(true);
        try {
            await onRetry();
        } finally {
            setRetrying(false);
        }
    };
    const summary = resumeSummary(resume, formatMs);

    if (resume.state === 'done') {
        return (
            <Box data-testid="resume-block" data-state="done" sx={{ fontSize: 12 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                    <ButtonBase
                        onClick={() => setOpen((o) => !o)}
                        aria-expanded={open}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.6,
                            maxWidth: '85%',
                            px: 1.25,
                            py: 0.4,
                            borderRadius: 999,
                            border: 1,
                            borderColor: 'divider',
                            bgcolor: '#fff',
                            color: 'text.secondary',
                            fontSize: 12,
                            '&:hover': { color: 'text.primary' },
                        }}
                    >
                        <ReplayIcon sx={{ fontSize: 13 }} />
                        <Box
                            component="span"
                            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {summary}
                        </Box>
                        <ChevronRightIcon
                            sx={{
                                fontSize: 14,
                                transition: 'transform .15s',
                                transform: open ? 'rotate(90deg)' : 'none',
                            }}
                        />
                    </ButtonBase>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                </Box>
                <Collapse in={open} unmountOnExit>
                    <Box sx={{ ...blockSx, mx: 'auto', mt: 1, maxWidth: 420, px: 1.5, py: 1 }}>
                        <Steps steps={resume.steps} />
                    </Box>
                </Collapse>
            </Box>
        );
    }

    const failed = resume.state === 'failed';
    return (
        <Box
            data-testid="resume-block"
            data-state={resume.state}
            role="status"
            aria-live="polite"
            sx={{
                ...blockSx,
                mx: 'auto',
                width: '100%',
                maxWidth: 420,
                boxSizing: 'border-box',
                px: 1.5,
                py: 1.25,
                borderColor: failed ? agentColors.redLine : 'divider',
                bgcolor: failed ? agentColors.redTint : '#fff',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {failed ? <CloseIcon sx={{ fontSize: 16, color: agentColors.red }} /> : <CircularProgress size={14} />}
                <Typography sx={{ fontSize: 13, fontWeight: 500, overflowWrap: 'anywhere' }}>{summary}</Typography>
            </Box>
            {!failed && (
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.25 }}>
                    {resume.start
                        ? 'No sandbox was free; one is being started for this chat.'
                        : 'Loading the chat into a sandbox.'}{' '}
                    You can type already: your message goes to the agent once it is ready.
                </Typography>
            )}
            <Box sx={{ mt: 1 }}>
                <Steps steps={resume.steps} />
            </Box>
            {failed && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <Typography sx={{ fontSize: 11.5, flex: 1 }}>
                        Nothing is lost: a message sent meanwhile is back in the input field. Sending tries again too.
                    </Typography>
                    {onRetry && (
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={retrying}
                            onClick={() => void retry()}
                            startIcon={
                                retrying ? (
                                    <CircularProgress size={12} color="inherit" />
                                ) : (
                                    <ReplayIcon sx={{ fontSize: '16px !important' }} />
                                )
                            }
                            sx={{ py: 0, fontSize: 12, flex: 'none', bgcolor: '#fff' }}
                        >
                            Try again
                        </Button>
                    )}
                </Box>
            )}
        </Box>
    );
}
