// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Tooltip of the send button ("Send (Enter)"), controlled because two browser behaviours opened it wrongly:
// - Sending disables the button under the pointer: a disabled button fires no blur, and its wrapper gets a fresh
//   mouseover, so the tooltip stayed open after sending. After a send it stays closed until the pointer has left.
// - When the panel opens, the send button lands under the resting pointer (where the floating button was), and the
//   browser fires a mouseover without any movement. Hover therefore counts only once the pointer has really moved
//   over the button. Keyboard focus (MUI opens on focus-visible only) still opens it.

export type SendTipState = { open: boolean; /** pointer moved over the button */ moved: boolean; /** closed by a send */ held: boolean };

export const sendTipIdle: SendTipState = { open: false, moved: false, held: false };

export type SendTipEvent =
    /** MUI's onOpen: from a mouseover (hover) or a focus. */
    | { type: 'open'; by: 'hover' | 'focus' }
    /** The pointer moves over the button's wrapper. */
    | { type: 'move' }
    /** The pointer left the wrapper. */
    | { type: 'leave' }
    /** MUI's onClose (pointer left, blur, Escape). */
    | { type: 'close' }
    /** A message was sent from here. */
    | { type: 'send' };

export function sendTipReducer(s: SendTipState, e: SendTipEvent): SendTipState {
    switch (e.type) {
        case 'open':
            if (s.held || (e.by === 'hover' && !s.moved) || s.open) return s;
            return { ...s, open: true };
        case 'move':
            if (s.moved && (s.open || s.held)) return s;
            return { ...s, moved: true, open: !s.held };
        case 'leave':
            return sendTipIdle;
        case 'close':
            return s.open ? { ...s, open: false } : s;
        case 'send':
            return { open: false, moved: s.moved, held: s.moved };
    }
}
