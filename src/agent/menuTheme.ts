// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { Theme } from '@mui/material/styles';

/**
 * The platform theme with the scroll lock of popovers switched off, for the agent area only.
 *
 * MUI's Popover (and Menu and Select, which open one) locks the page while open: `overflow: hidden` on body, so the
 * document scrollbar disappears, and `padding-right` of the scrollbar width on body and on `.mui-fixed` elements to
 * make up for it. Content in the flow and the app bar stay put, but the context panel is a fixed drawer at `right: 0`
 * without `.mui-fixed`: the viewport grows by the scrollbar width and the panel jumps right by it (15 px with classic
 * scrollbars), so the gap between page and panel opens and closes with every menu. Without the lock nothing changes
 * on the page. Dialogs keep their lock (Dialog uses Modal, not Popover).
 */
export function withoutPopoverScrollLock(outer: Theme): Theme {
    const popover = outer.components?.MuiPopover;
    return {
        ...outer,
        components: {
            ...outer.components,
            MuiPopover: { ...popover, defaultProps: { ...popover?.defaultProps, disableScrollLock: true } },
        },
    };
}

/**
 * Tooltips positioned with `position: fixed` instead of `absolute`, for the agent area only.
 *
 * MUI portals a tooltip into body and positions it absolutely next to its anchor, so it counts towards the
 * document's scrollable area. The context panel slides out to the right when it closes, and the "Close" tooltip of
 * its close button, still open under the pointer, follows the button past the right edge of the window: the document
 * becomes 11 to 14 px wider than the window and a horizontal scrollbar shows at the bottom for about 200 ms (issue
 * #28). A fixed tooltip never adds to the scrollable area, like the fixed panel itself. Tooltips still follow their
 * anchor when the page scrolls (Popper listens to scroll events).
 */
export const FIXED_TOOLTIP_POPPER = { popperOptions: { strategy: 'fixed' as const } };

export function withFixedTooltips(outer: Theme): Theme {
    const tooltip = outer.components?.MuiTooltip;
    return {
        ...outer,
        components: {
            ...outer.components,
            MuiTooltip: {
                ...tooltip,
                defaultProps: {
                    ...tooltip?.defaultProps,
                    PopperProps: { ...tooltip?.defaultProps?.PopperProps, ...FIXED_TOOLTIP_POPPER },
                },
            },
        },
    };
}

/** Theme of the agent area: popovers without scroll lock and fixed tooltips. */
export const agentAreaTheme = (outer: Theme): Theme => withFixedTooltips(withoutPopoverScrollLock(outer));
