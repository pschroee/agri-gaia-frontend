// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

import { useAgent } from '../AgentContext';
import { interactiveLoginUrl } from '../api';

/**
 * Shown instead of the agent UI while the gateway session is being checked or missing. The silent
 * login has already run once when "signed-out" shows; the user can retry it or sign in at the gateway.
 */
export default function SignInNotice() {
    const { status, error, retrySignIn } = useAgent();

    if (status === 'checking') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, color: 'text.secondary' }}>
                <CircularProgress size={18} />
                <Typography sx={{ fontSize: 13 }}>Connecting to the agent …</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                {status === 'signed-out' ? 'Not signed in to the agent' : 'The agent is not reachable'}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                {status === 'signed-out'
                    ? 'The automatic sign-in with your platform account did not succeed.'
                    : error ?? 'The agent gateway did not answer.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" onClick={retrySignIn}>
                    Try again
                </Button>
                {status === 'signed-out' && (
                    <Button size="small" variant="outlined" href={interactiveLoginUrl()}>
                        Sign in
                    </Button>
                )}
            </Box>
        </Box>
    );
}
