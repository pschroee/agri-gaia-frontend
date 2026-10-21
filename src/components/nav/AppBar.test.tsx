// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// The platform app bar must stay on one line on narrow screens (issue #187). jsdom cannot measure the height; that is
// part of the render check. Here only the no-wrap setting and a render without a session are checked.

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import MyAppBar from './AppBar';

afterEach(() => cleanup());

const renderBar = () =>
    render(
        <MemoryRouter>
            <MyAppBar toggleSideNav={() => undefined} />
        </MemoryRouter>,
    );

describe('MyAppBar', () => {
    it('appbar title does not wrap', () => {
        renderBar();
        expect(screen.getByText('Agri-Gaia').className).toContain('MuiTypography-noWrap');
    });

    it('logout hidden without session', () => {
        renderBar();
        expect(screen.queryByLabelText('logout')).toBeNull();
    });
});
