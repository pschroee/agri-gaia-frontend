// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';

import { withoutPopoverScrollLock } from '../menuTheme';

/**
 * Menus, selects and popovers inside open without locking the page scroll, so the platform page and the context
 * panel do not move (see `withoutPopoverScrollLock`). Wraps the panel and the agent page, not the platform.
 */
export default function AgentMenuTheme({ children }: { children: ReactNode }) {
    return <ThemeProvider theme={withoutPopoverScrollLock}>{children}</ThemeProvider>;
}
