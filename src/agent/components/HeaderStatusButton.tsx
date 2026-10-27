// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One calm button for the status row of the chat header (issue #221): plan, to-dos and context share it. 28 px high,
// 13 px text, an 18 px symbol, no dot, no frame (a symbol may move while something runs, issue #250); the state shows only in the colour of symbol and text.

import { MouseEvent, ReactNode, Ref } from 'react';

import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';

import { agentColors } from './tokens';

/** What the button says about its subject: nothing special, it runs, it wants attention, it failed. */
export type StatusTone = 'default' | 'running' | 'attention' | 'failed';

export const TONE_COLOR: Record<StatusTone, string> = {
    default: agentColors.muted,
    running: agentColors.green,
    attention: agentColors.amberText,
    failed: agentColors.red,
};

export default function HeaderStatusButton({
    icon,
    label,
    tone,
    open,
    onClick,
    ariaLabel,
    tooltip,
    testId,
    buttonRef,
    dataAttrs,
    haspopup = 'dialog',
}: {
    icon: ReactNode;
    label: ReactNode;
    tone: StatusTone;
    open?: boolean;
    onClick: (e: MouseEvent<HTMLElement>) => void;
    ariaLabel: string;
    tooltip?: string;
    testId: string;
    buttonRef?: Ref<HTMLButtonElement>;
    dataAttrs?: Record<string, string | undefined>;
    haspopup?: 'dialog' | 'menu' | 'true';
}) {
    const button = (
        <ButtonBase
            ref={buttonRef}
            aria-label={ariaLabel}
            aria-haspopup={haspopup}
            aria-expanded={!!open}
            data-testid={testId}
            data-tone={tone}
            {...dataAttrs}
            onClick={onClick}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: 28,
                px: '6px',
                borderRadius: 1,
                fontSize: 13,
                lineHeight: '20px',
                fontFamily: 'inherit',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                flex: 'none',
                color: TONE_COLOR[tone],
                bgcolor: open ? 'rgba(15,84,50,0.08)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(15,84,50,0.08)' },
                '&.Mui-focusVisible': { outline: `2px solid ${agentColors.green}`, outlineOffset: 1 },
            }}
        >
            <span style={{ display: 'inline-flex', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                {icon}
            </span>
            {label !== null && label !== '' && <span>{label}</span>}
        </ButtonBase>
    );
    return tooltip ? <Tooltip title={tooltip}>{button}</Tooltip> : button;
}
