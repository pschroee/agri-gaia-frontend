// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Dragging files onto the agent area (panel or chat area of /ai-agent). Pure logic, used by useFileDrop.
//
// dragenter and dragleave fire for every element the pointer crosses, and they bubble: entering a child fires
// dragenter on it before dragleave on the parent. A counter of entered elements tells whether the pointer is
// still inside; a dragleave towards an element outside the area (or out of the window, relatedTarget null)
// ends the drag at once, so a missed event cannot leave the overlay standing.

/** Whether a drag carries files (not text or links). `types` is DataTransfer.types. */
export function draggingFiles(types: ArrayLike<string> | undefined | null): boolean {
    return !!types && Array.from(types).includes('Files');
}

export type DragState = { depth: number };

export const noDrag: DragState = { depth: 0 };

export type DragAction =
    | { type: 'enter' }
    /** inside: the element the pointer moves to (relatedTarget) is still within the area. */
    | { type: 'leave'; inside: boolean }
    | { type: 'drop' }
    | { type: 'reset' };

export function dragReducer(s: DragState, a: DragAction): DragState {
    switch (a.type) {
        case 'enter':
            return { depth: s.depth + 1 };
        case 'leave':
            if (!a.inside) return noDrag;
            return s.depth <= 1 ? noDrag : { depth: s.depth - 1 };
        case 'drop':
        case 'reset':
            return s.depth === 0 ? s : noDrag;
    }
}

/** The overlay shows while files are dragged over the area. */
export const dragActive = (s: DragState) => s.depth > 0;
