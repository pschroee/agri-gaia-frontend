// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { sendTipIdle, sendTipReducer } from './sendTooltip';
import type { SendTipEvent, SendTipState } from './sendTooltip';

const run = (events: SendTipEvent[], start: SendTipState = sendTipIdle) => events.reduce(sendTipReducer, start);

describe('sendTipReducer', () => {
    it('stays closed on a mouseover without movement (panel opened under the resting pointer)', () => {
        expect(run([{ type: 'open', by: 'hover' }]).open).toBe(false);
    });

    it('opens once the pointer really moves over the button', () => {
        expect(run([{ type: 'open', by: 'hover' }, { type: 'move' }]).open).toBe(true);
        expect(run([{ type: 'move' }, { type: 'open', by: 'hover' }]).open).toBe(true);
    });

    it('opens on keyboard focus', () => {
        expect(run([{ type: 'open', by: 'focus' }]).open).toBe(true);
    });

    it('stays closed after a send until the pointer has left the button', () => {
        const sent = run([{ type: 'move' }, { type: 'send' }]);
        expect(sent.open).toBe(false);
        expect(run([{ type: 'open', by: 'hover' }, { type: 'move' }, { type: 'open', by: 'focus' }], sent).open).toBe(false);
        expect(run([{ type: 'leave' }, { type: 'move' }], sent).open).toBe(true);
    });

    it('a send by Enter without the pointer over the button holds nothing', () => {
        const sent = run([{ type: 'send' }]);
        expect(sent.held).toBe(false);
        expect(run([{ type: 'move' }], sent).open).toBe(true);
    });

    it('closes on close and resets on leave', () => {
        const open = run([{ type: 'move' }]);
        expect(sendTipReducer(open, { type: 'close' }).open).toBe(false);
        expect(sendTipReducer(open, { type: 'leave' })).toEqual(sendTipIdle);
        expect(sendTipReducer(sendTipIdle, { type: 'close' })).toBe(sendTipIdle);
    });
});
