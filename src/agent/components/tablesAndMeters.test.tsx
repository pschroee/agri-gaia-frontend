// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Issue #256: tables never break inside a word, and the reached target is green while the budget meters stay orange.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Meter } from '../searchView';
import Markdown from './Markdown';
import { Meters } from './search/SearchParts';
import { BudgetMeter } from './search/SearchSummary';

afterEach(cleanup);

const meter = (key: Meter['key'], reached: boolean): Meter => ({
    key,
    label: key,
    value: '1 of 2',
    pct: 50,
    reached,
    set: true,
    valueText: '1 of 2',
}) as Meter;

describe('table style', () => {
    it('does not break words anywhere on the table, only at the cells as a last resort', () => {
        const { container } = render(<Markdown text={'| Testanfragen | unverändert |\n|---|---|\n| a | b |'} />);
        const table = container.querySelector('table');
        expect(table).toBeTruthy();
        const rules = Array.from(document.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');
        expect(rules).not.toMatch(/overflow-wrap:\s*anywhere/);
        expect(rules).toMatch(/overflow-wrap:\s*normal/);
        expect(rules).toMatch(/word-break:\s*normal/);
    });
});

describe.each([
    ['Meters', (m: Meter) => render(<Meters meters={[m]} />)],
    ['BudgetMeter', (m: Meter) => render(<BudgetMeter meter={m} />)],
])('%s colours', (_name, draw) => {
    it('shows a reached target in green', () => {
        draw(meter('target', true));
        const text = screen.getByText('reached');
        expect(getComputedStyle(text).color).not.toBe('');
        expect(document.querySelector('.MuiLinearProgress-colorSuccess')).toBeTruthy();
        expect(document.querySelector('.MuiLinearProgress-colorWarning')).toBeNull();
    });
    it('keeps a reached budget meter orange', () => {
        draw(meter('runs', true));
        expect(document.querySelector('.MuiLinearProgress-colorWarning')).toBeTruthy();
        expect(document.querySelector('.MuiLinearProgress-colorSuccess')).toBeNull();
    });
});
