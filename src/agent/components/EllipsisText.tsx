// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// One line of text that ellipsizes, with its full text as tooltip only while it is cut (issue #52).
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
 * A single ellipsized line. The tooltip shows the full line only when it is cut, opens on hover alone (not on focus,
 * so it never stays behind after a click elsewhere), closes when the pointer leaves, on Escape and on a press (which
 * may open a menu over it), and does not open again until the pointer has left once.
 */
export default function EllipsisText({ text, sx, testId }: { text: string; sx?: SxProps<Theme>; testId?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const pressed = useRef(false);
    return (
        <Tooltip
            title={text}
            open={open}
            onOpen={() => {
                if (!pressed.current && isHovered(ref.current) && isTruncated(ref.current)) setOpen(true);
            }}
            onClose={() => setOpen(false)}
            disableFocusListener
            disableInteractive
            enterDelay={400}
            enterNextDelay={400}
            placement="bottom-start"
            // wide enough for a title of 70 characters on one line
            componentsProps={{ tooltip: { sx: { maxWidth: 'min(520px, calc(100vw - 32px))' } } }}
        >
            <Box
                component="span"
                ref={ref}
                data-testid={testId}
                // not stopped: a surrounding select or button still gets the press
                onMouseDown={() => {
                    pressed.current = true;
                    setOpen(false);
                }}
                onMouseLeave={() => {
                    pressed.current = false;
                }}
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
