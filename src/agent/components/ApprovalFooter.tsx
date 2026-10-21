// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The footer of every pending approval card except plans (issue #190): "Technical details" on the left, then an
// optional extra action, and Reject / Approve on the right (Approve last). If the row is too narrow, the whole
// button group wraps to the next line, right-aligned; the details never break.

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { ButtonProps } from '@mui/material/Button';

import { Technical } from './PlanCard';

export default function ApprovalFooter({
    technical,
    start,
    approveLabel = 'Approve',
    approveProps,
    busy,
    onApprove,
    onReject,
}: {
    technical?: { text: string; open?: boolean; full?: boolean; testId?: string };
    start?: ReactNode;
    approveLabel?: ReactNode;
    approveProps?: ButtonProps;
    busy: boolean;
    onApprove: () => void;
    onReject: () => void;
}) {
    return (
        <Box
            data-testid="agent-approval-footer"
            sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.75, mt: 1.25, minWidth: 0 }}
        >
            {technical && (
                <Technical
                    {...technical}
                    sx={{ mt: 0, minWidth: 0, flex: '0 1 auto', '&[open]': { flexBasis: '100%' } }}
                />
            )}
            {start}
            <Box data-testid="agent-approval-buttons" sx={{ ml: 'auto', display: 'flex', gap: 1, flex: 'none' }}>
                <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={busy}
                    onClick={onReject}
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    Reject
                </Button>
                <Button
                    size="small"
                    variant="contained"
                    disabled={busy}
                    onClick={onApprove}
                    {...approveProps}
                    sx={{ whiteSpace: 'nowrap' }}
                >
                    {approveLabel}
                </Button>
            </Box>
        </Box>
    );
}
