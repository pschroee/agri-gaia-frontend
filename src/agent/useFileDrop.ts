// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { DragEvent, useCallback, useEffect, useReducer, useRef } from 'react';

import { dragActive, draggingFiles, dragReducer, noDrag } from './dropzone';

/** Handlers for the element that takes dropped files. */
export type FileDropHandlers = {
    onDragEnter: (e: DragEvent<HTMLElement>) => void;
    onDragOver: (e: DragEvent<HTMLElement>) => void;
    onDragLeave: (e: DragEvent<HTMLElement>) => void;
    onDrop: (e: DragEvent<HTMLElement>) => void;
};

/**
 * Drop target for files (dropzone.ts). Only drags that carry files are taken; text and links pass through to
 * the elements below (the text field keeps taking dropped text). `onFiles` undefined: no target right now.
 */
export function useFileDrop(onFiles: ((files: File[]) => void) | undefined): {
    active: boolean;
    handlers: FileDropHandlers;
} {
    const [state, dispatch] = useReducer(dragReducer, noDrag);
    const latest = useRef(onFiles);
    latest.current = onFiles;
    const enabled = !!onFiles;

    // a drag that ends elsewhere (Esc, drop outside the window) must not leave the overlay standing
    useEffect(() => {
        if (!dragActive(state)) return;
        const reset = () => dispatch({ type: 'reset' });
        window.addEventListener('dragend', reset);
        window.addEventListener('drop', reset);
        return () => {
            window.removeEventListener('dragend', reset);
            window.removeEventListener('drop', reset);
        };
    }, [state]);
    useEffect(() => {
        if (!enabled) dispatch({ type: 'reset' });
    }, [enabled]);

    const onDragEnter = useCallback(
        (e: DragEvent<HTMLElement>) => {
            if (!enabled || !draggingFiles(e.dataTransfer?.types)) return;
            e.preventDefault();
            dispatch({ type: 'enter' });
        },
        [enabled],
    );
    const onDragOver = useCallback(
        (e: DragEvent<HTMLElement>) => {
            if (!enabled || !draggingFiles(e.dataTransfer?.types)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        },
        [enabled],
    );
    const onDragLeave = useCallback(
        (e: DragEvent<HTMLElement>) => {
            if (!enabled || !draggingFiles(e.dataTransfer?.types)) return;
            const to = e.relatedTarget as Node | null;
            dispatch({ type: 'leave', inside: !!to && e.currentTarget.contains(to) });
        },
        [enabled],
    );
    const onDrop = useCallback(
        (e: DragEvent<HTMLElement>) => {
            if (!enabled || !draggingFiles(e.dataTransfer?.types)) return;
            e.preventDefault();
            dispatch({ type: 'drop' });
            const files = Array.from(e.dataTransfer.files ?? []);
            if (files.length) latest.current?.(files);
        },
        [enabled],
    );
    return { active: dragActive(state), handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
