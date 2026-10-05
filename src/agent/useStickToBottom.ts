// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Distance from the bottom (px) that still counts as "at the bottom". */
export const BOTTOM_TOLERANCE = 32;

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };

export function distanceFromBottom(m: ScrollMetrics): number {
    return Math.max(0, m.scrollHeight - m.scrollTop - m.clientHeight);
}

export function isAtBottom(m: ScrollMetrics, tolerance = BOTTOM_TOLERANCE): boolean {
    return distanceFromBottom(m) <= tolerance;
}

/**
 * stuck: the view follows the end of the transcript. count: current number of transcript entries;
 * seen: the count when the user last was at the bottom (basis of "n new").
 */
export type StickState = { stuck: boolean; count: number; seen: number };

export type StickAction =
    /** A scroll event: where the view is now and whether the user moved it up. */
    | { type: 'scroll'; atBottom: boolean; movedUp: boolean }
    /** The number of transcript entries changed. */
    | { type: 'count'; count: number }
    /** Opening a chat, sending a message or the "Jump to latest" button. */
    | { type: 'jump' };

export function initialStick(count: number): StickState {
    return { stuck: true, count, seen: count };
}

export function stickReducer(s: StickState, a: StickAction): StickState {
    switch (a.type) {
        case 'scroll':
            // At the bottom: follow again. Away from it: let go only when the user scrolled up; growing content
            // or a clamped scrollTop must not release the view.
            if (a.atBottom) return s.stuck && s.seen === s.count ? s : { ...s, stuck: true, seen: s.count };
            if (a.movedUp && s.stuck) return { ...s, stuck: false };
            return s;
        case 'count':
            if (a.count === s.count) return s;
            return { ...s, count: a.count, seen: s.stuck ? a.count : Math.min(s.seen, a.count) };
        case 'jump':
            return { ...s, stuck: true, seen: s.count };
    }
}

/** Entries added since the user left the bottom; 0 while the view follows. */
export function unseenCount(s: StickState): number {
    return s.stuck ? 0 : Math.max(0, s.count - s.seen);
}

/**
 * Keeps a scrolling transcript at its end while the user is there: scrollRef goes on the scrolling element,
 * contentRef on its content. Every height change of either (new entries, growing step lists, streamed text,
 * a resized panel) scrolls down as long as the view is stuck. Scrolling up releases it; jumpToLatest() and
 * reaching the bottom again re-attach it. count is the number of transcript entries, for "n new".
 */
export function useStickToBottom(count: number, tolerance = BOTTOM_TOLERANCE) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const stateRef = useRef<StickState>(initialStick(count));
    const [state, setState] = useState(stateRef.current);
    const lastTop = useRef(0);

    const apply = useCallback((a: StickAction) => {
        const next = stickReducer(stateRef.current, a);
        if (next !== stateRef.current) {
            stateRef.current = next;
            setState(next);
        }
    }, []);

    const toBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        lastTop.current = el.scrollTop;
    }, []);

    useEffect(() => apply({ type: 'count', count }), [apply, count]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const top = el.scrollTop;
            const movedUp = top < lastTop.current - 1;
            lastTop.current = top;
            apply({ type: 'scroll', atBottom: isAtBottom(el, tolerance), movedUp });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        const follow = () => {
            if (stateRef.current.stuck) toBottom();
        };
        const ro = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(follow);
        ro?.observe(el);
        if (contentRef.current) ro?.observe(contentRef.current);
        follow();
        return () => {
            el.removeEventListener('scroll', onScroll);
            ro?.disconnect();
        };
    }, [apply, toBottom, tolerance]);

    const jumpToLatest = useCallback(() => {
        apply({ type: 'jump' });
        toBottom();
    }, [apply, toBottom]);

    return { scrollRef, contentRef, stuck: state.stuck, unseen: unseenCount(state), jumpToLatest };
}
