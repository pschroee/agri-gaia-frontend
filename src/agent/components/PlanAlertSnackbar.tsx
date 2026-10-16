// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The snackbar of a plan alert (A-E4, D4.4): a plan of one of the user's chats completed, failed, paused, needs
// input or could not be read. It appears on every platform page, also while the user is somewhere else entirely,
// and offers the jump to that chat. A question (`needs_input`) stays until the user opens the chat or closes it;
// everything else goes away after ALERT_MS. The wording is in planAlerts.ts.

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BackHandOutlinedIcon from '@mui/icons-material/BackHandOutlined';

import { useAgent } from '../AgentContext';
import { onAgentPage } from '../panelCarry';
import { alertShown, alertSticky, alertText, ALERT_MS } from '../planAlerts';
import type { PlanAlertKind } from '../planAlerts';
import { agentColors } from './tokens';

/** The mark on the left of the snackbar, one per kind (design, L25). */
function AlertIcon({ kind }: { kind: PlanAlertKind | string }) {
    const sx = { fontSize: 20, flex: 'none' } as const;
    switch (kind) {
        case 'completed':
            return <CheckCircleIcon sx={{ ...sx, color: 'success.main' }} aria-hidden />;
        case 'needs_input':
            return <BackHandOutlinedIcon sx={{ ...sx, color: 'warning.main' }} aria-hidden />;
        case 'failed':
            return <ErrorIcon sx={{ ...sx, color: 'error.main' }} aria-hidden />;
        case 'attention':
            return <ReportProblemOutlinedIcon sx={{ ...sx, color: 'warning.main' }} aria-hidden />;
        default:
            return <PauseCircleIcon sx={{ ...sx, color: 'warning.main' }} aria-hidden />;
    }
}

/** The longest text of a snackbar (design: max 568 px, one line with an ellipsis). */
const TEXT_SX = { maxWidth: 568, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/**
 * Shows the newest plan alert that concerns the user right now: on the agent page the open chat's own alerts are
 * left out, because the card is already in front of them (design).
 */
export default function PlanAlertSnackbar() {
    const { planAlerts, openPlanAlert, dismissPlanAlert, selectedChatId } = useAgent();
    const { pathname } = useLocation();
    const [hidden, setHidden] = useState<string | undefined>();
    const onAgent = onAgentPage(pathname);
    const current = planAlerts.find((a) => alertShown(a, { openChatId: selectedChatId, onAgentPage: onAgent }));

    useEffect(() => {
        if (!current || alertSticky(current)) return undefined;
        const t = setTimeout(() => setHidden(current.id), ALERT_MS);
        return () => clearTimeout(t);
    }, [current]);

    if (!current) return null;
    const open = hidden !== current.id;
    return (
        <Snackbar
            open={open}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            sx={{ bottom: { xs: 46, sm: 46 } }}
            onClose={(_, reason) => {
                if (reason === 'clickaway') return;
                dismissPlanAlert(current);
            }}
        >
            <Box
                role={alertSticky(current) ? 'alert' : 'status'}
                data-testid="agent-plan-alert"
                data-alert-kind={current.kind}
                data-plan-id={current.plan_id}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    bgcolor: '#323232',
                    color: '#fff',
                    px: 2,
                    py: 1.25,
                    borderRadius: 1,
                    boxShadow: 3,
                    minWidth: 0,
                }}
            >
                <AlertIcon kind={current.kind} />
                <Typography sx={{ fontSize: 14, ...TEXT_SX, flex: '1 1 auto' }}>{alertText(current)}</Typography>
                <Button
                    color="inherit"
                    size="small"
                    data-testid="agent-plan-alert-open"
                    onClick={() => openPlanAlert(current)}
                    sx={{ flex: 'none', color: agentColors.greenTint, fontWeight: 600 }}
                >
                    Open chat
                </Button>
                <IconButton
                    size="small"
                    aria-label="Close"
                    data-testid="agent-plan-alert-close"
                    onClick={() => dismissPlanAlert(current)}
                    sx={{ color: 'inherit', flex: 'none' }}
                >
                    <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Box>
        </Snackbar>
    );
}
