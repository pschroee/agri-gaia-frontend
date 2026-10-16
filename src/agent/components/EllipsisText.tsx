// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One line of text that ellipsizes, with its full text as tooltip only while it is cut (issue #52). `MidEllipsisText`
// is the same for a line whose middle is shortened instead of its end (deployment card, issue #105).
import { useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';

/** True when the element's text is cut by `text-overflow: ellipsis`. */
export function isTruncated(el: HTMLElement | null | undefined): boolean {
    return !!el && el.scrollWidth > el.clientWidth + 1;
}

/**
 * True while the pointer is over the element itself. React lets mouse events bubble out of portals (an open menu,
 * its backdrop), so a tooltip's enter timer can fire although the pointer is elsewhere on the page.
 */
export function isHovered(el: HTMLElement | null | undefined): boolean {
    return !!el && el.matches(':hover');
}

/**
 * State of a tooltip that shows the full text of a line only while the line is cut. It opens on hover alone (not on
 * focus, so it never stays behind after a click elsewhere), closes when the pointer leaves, on Escape and on a press
 * (which may open a menu over it), and does not open again until the pointer has left once.
 */
function useCutTooltip<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [open, setOpen] = useState(false);
    const pressed = useRef(false);
    return {
        ref,
        open,
        onOpen: () => {
            if (!pressed.current && isHovered(ref.current) && isTruncated(ref.current)) setOpen(true);
        },
        onClose: () => setOpen(false),
        // not stopped: a surrounding select or button still gets the press
        onMouseDown: () => {
            pressed.current = true;
            setOpen(false);
        },
        onMouseLeave: () => {
            pressed.current = false;
        },
    };
}

/** The tooltip props both components share: wide enough for a title of 70 characters on one line. */
const tooltipProps = {
    disableFocusListener: true,
    disableInteractive: true,
    enterDelay: 400,
    enterNextDelay: 400,
    placement: 'bottom-start' as const,
    componentsProps: { tooltip: { sx: { maxWidth: 'min(520px, calc(100vw - 32px))' } } },
};

/**
 * A single ellipsized line. The tooltip shows the full line only when it is cut, opens on hover alone (not on focus,
 * so it never stays behind after a click elsewhere), closes when the pointer leaves, on Escape and on a press (which
 * may open a menu over it), and does not open again until the pointer has left once.
 */
export default function EllipsisText({ text, sx, testId }: { text: string; sx?: SxProps<Theme>; testId?: string }) {
    const tip = useCutTooltip<HTMLSpanElement>();
    return (
        <Tooltip title={text} open={tip.open} onOpen={tip.onOpen} onClose={tip.onClose} {...tooltipProps}>
            <Box
                component="span"
                ref={tip.ref}
                data-testid={testId}
                onMouseDown={tip.onMouseDown}
                onMouseLeave={tip.onMouseLeave}
                sx={[
                    {
                        display: 'block',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    },
                    ...(Array.isArray(sx) ? sx : [sx]),
                ]}
            >
                {text}
            </Box>
        </Tooltip>
    );
}

/**
 * One line whose middle is shortened: the head shrinks with an ellipsis, the tail (`midSplit` of the deployment card)
 * stays visible, so a version, a tag or a device number does not disappear. The tooltip shows the full text while the
 * head is cut, with the same rules as `EllipsisText`.
 */
export function MidEllipsisText({
    text,
    tail,
    sx,
    testId,
}: {
    text: string;
    /** End of the text that always stays visible; empty when the value is not split. */
    tail: string;
    sx?: SxProps<Theme>;
    testId?: string;
}) {
    const tip = useCutTooltip<HTMLSpanElement>();
    const head = tail ? text.slice(0, Math.max(0, text.length - tail.length)) : text;
    return (
        <Tooltip title={text} open={tip.open} onOpen={tip.onOpen} onClose={tip.onClose} {...tooltipProps}>
            <Box
                component="span"
                data-testid={testId}
                sx={[
                    { display: 'flex', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' },
                    ...(Array.isArray(sx) ? sx : [sx]),
                ]}
            >
                <Box
                    component="span"
                    ref={tip.ref}
                    onMouseDown={tip.onMouseDown}
                    onMouseLeave={tip.onMouseLeave}
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                    {head}
                </Box>
                {!!tail && (
                    <Box component="span" sx={{ flexShrink: 0 }}>
                        {tail}
                    </Box>
                )}
            </Box>
        </Tooltip>
    );
}
