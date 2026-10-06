// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';

import { withoutPopoverScrollLock } from './menuTheme';

describe('withoutPopoverScrollLock', () => {
    it('switches the scroll lock of popovers off', () => {
        const t = withoutPopoverScrollLock(createTheme());
        expect(t.components?.MuiPopover?.defaultProps?.disableScrollLock).toBe(true);
    });

    it('keeps the outer theme, its other popover defaults and other components', () => {
        const outer = createTheme({
            palette: { primary: { main: '#0f5432' } },
            components: {
                MuiPopover: { defaultProps: { elevation: 3 }, styleOverrides: { paper: { borderRadius: 2 } } },
                MuiButton: { defaultProps: { disableRipple: true } },
            },
        });
        const t = withoutPopoverScrollLock(outer);
        expect(t.palette.primary.main).toBe('#0f5432');
        expect(t.components?.MuiPopover?.defaultProps).toEqual({ elevation: 3, disableScrollLock: true });
        expect(t.components?.MuiPopover?.styleOverrides).toEqual({ paper: { borderRadius: 2 } });
        expect(t.components?.MuiButton?.defaultProps).toEqual({ disableRipple: true });
        expect(outer.components?.MuiPopover?.defaultProps).toEqual({ elevation: 3 });
    });

    it('leaves the modal lock of dialogs alone', () => {
        const t = withoutPopoverScrollLock(createTheme());
        expect(t.components?.MuiModal).toBeUndefined();
        expect(t.components?.MuiDialog).toBeUndefined();
    });
});
