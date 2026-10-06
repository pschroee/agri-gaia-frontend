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
