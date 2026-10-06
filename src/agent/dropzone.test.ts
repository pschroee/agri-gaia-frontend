// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { dragActive, draggingFiles, dragReducer, noDrag } from './dropzone';
import type { DragAction, DragState } from './dropzone';

const run = (actions: DragAction[], start: DragState = noDrag) => actions.reduce(dragReducer, start);

describe('draggingFiles', () => {
    it('takes drags with files only', () => {
        expect(draggingFiles(['Files'])).toBe(true);
        expect(draggingFiles(['application/x-moz-file', 'Files'])).toBe(true);
        expect(draggingFiles(['text/plain'])).toBe(false);
        expect(draggingFiles(['text/uri-list', 'text/html'])).toBe(false);
        expect(draggingFiles([])).toBe(false);
        expect(draggingFiles(undefined)).toBe(false);
    });
});

describe('dragReducer', () => {
    it('stays active while the pointer moves across nested elements (enter fires before leave)', () => {
        const s = run([
            { type: 'enter' }, // the area
            { type: 'enter' }, // a child
            { type: 'leave', inside: true }, // the area towards the child
            { type: 'enter' }, // a grandchild
            { type: 'leave', inside: true }, // the child towards the grandchild
        ]);
        expect(dragActive(s)).toBe(true);
        expect(s.depth).toBe(1);
    });

    it('ends when the pointer leaves the area, also from deep inside', () => {
        expect(dragActive(run([{ type: 'enter' }, { type: 'leave', inside: false }]))).toBe(false);
        const deep = run([{ type: 'enter' }, { type: 'enter' }, { type: 'enter' }, { type: 'leave', inside: false }]);
        expect(dragActive(deep)).toBe(false);
    });

    it('ends on drop and on reset (drag ended elsewhere)', () => {
        expect(dragActive(run([{ type: 'enter' }, { type: 'enter' }, { type: 'drop' }]))).toBe(false);
        expect(dragActive(run([{ type: 'enter' }, { type: 'reset' }]))).toBe(false);
    });

    it('never goes below zero and keeps the idle state object', () => {
        expect(run([{ type: 'leave', inside: true }])).toEqual(noDrag);
        expect(dragReducer(noDrag, { type: 'reset' })).toBe(noDrag);
    });
});
