// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { createTheme } from '@mui/material/styles';
import { describe, expect, it } from 'vitest';

import { agentAreaTheme, withFixedTooltips, withoutPopoverScrollLock } from './menuTheme';

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

describe('withFixedTooltips', () => {
    it('positions tooltips with the fixed strategy', () => {
        const t = withFixedTooltips(createTheme());
        expect(t.components?.MuiTooltip?.defaultProps?.PopperProps?.popperOptions).toEqual({ strategy: 'fixed' });
    });

    it('keeps other tooltip defaults, other popper props and other components', () => {
        const outer = createTheme({
            components: {
                MuiTooltip: { defaultProps: { arrow: true, PopperProps: { disablePortal: false } } },
                MuiButton: { defaultProps: { disableRipple: true } },
            },
        });
        const t = withFixedTooltips(outer);
        expect(t.components?.MuiTooltip?.defaultProps?.arrow).toBe(true);
        expect(t.components?.MuiTooltip?.defaultProps?.PopperProps).toEqual({
            disablePortal: false,
            popperOptions: { strategy: 'fixed' },
        });
        expect(t.components?.MuiButton?.defaultProps).toEqual({ disableRipple: true });
        expect(outer.components?.MuiTooltip?.defaultProps?.PopperProps).toEqual({ disablePortal: false });
    });

    it('gives every tooltip the same popper props object, so popper is not rebuilt on each render', () => {
        const a = withFixedTooltips(createTheme()).components?.MuiTooltip?.defaultProps?.PopperProps?.popperOptions;
        const b = withFixedTooltips(createTheme()).components?.MuiTooltip?.defaultProps?.PopperProps?.popperOptions;
        expect(a).toBe(b);
    });
});

describe('agentAreaTheme', () => {
    it('combines popovers without scroll lock and fixed tooltips', () => {
        const t = agentAreaTheme(createTheme());
        expect(t.components?.MuiPopover?.defaultProps?.disableScrollLock).toBe(true);
        expect(t.components?.MuiTooltip?.defaultProps?.PopperProps?.popperOptions).toEqual({ strategy: 'fixed' });
    });
});
