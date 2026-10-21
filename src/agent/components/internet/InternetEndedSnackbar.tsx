// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The snackbar that tells an internet grant ended by itself (limit reached, packages installed, time up, ended by the
// agent) — not when the user switched it off (design `internet-access`, A10/A11). The text comes from `endedNotice`.

import { useRef } from 'react';

import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import SnackbarContent from '@mui/material/SnackbarContent';
import CloseIcon from '@mui/icons-material/Close';
import PublicOffIcon from '@mui/icons-material/PublicOff';

import { useInternetContext } from '../../InternetContext';
import { endedNotice } from '../../internetView';

export const ENDED_SNACKBAR_MS = 8000;

export default function InternetEndedSnackbar() {
    const net = useInternetContext();
    const ended = net?.lastEnded;
    const text = ended ? endedNotice(ended.grant, ended.others) : undefined;
    // keep the last text while the snackbar fades out
    const shown = useRef('');
    if (text) shown.current = text;
    if (!net) return null;
    return (
        <Snackbar
            open={!!text}
            autoHideDuration={ENDED_SNACKBAR_MS}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            onClose={(_e, reason) => {
                if (reason === 'clickaway') return;
                net.clearEnded();
            }}
            sx={{ bottom: { xs: 96, sm: 104 } }}
        >
            <SnackbarContent
                role="status"
                aria-live="polite"
                data-testid="agent-internet-ended"
                message={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <PublicOffIcon fontSize="small" aria-hidden />
                        {shown.current}
                    </span>
                }
                action={
                    <IconButton size="small" color="inherit" aria-label="Close" onClick={() => net.clearEnded()}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                }
            />
        </Snackbar>
    );
}
