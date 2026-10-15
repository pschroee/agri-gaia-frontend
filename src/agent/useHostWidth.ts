// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { useLayoutEffect, useState } from 'react';

/** The header a chat button sits in: the page's chat header or the context panel's (issue #88). */
export const HEADER_HOST = '[data-testid="agent-chat-header"], [data-testid="agent-panel-header"]';

/**
 * Width of the chat header the button sits in (= the chat area) and whether that is the context panel; 0 until
 * measured (the label is then the compact one). Used by the task button (#88) and the plan button (#138).
 */
export function useHostWidth(el: HTMLElement | null): { width: number; panel: boolean } {
    const [state, setState] = useState({ width: 0, panel: false });
    useLayoutEffect(() => {
        const host = el?.closest<HTMLElement>(HEADER_HOST);
        if (!host) return;
        const measure = () =>
            setState((s) => {
                const width = Math.round(host.getBoundingClientRect().width);
                const panel = host.dataset.testid === 'agent-panel-header';
                return s.width === width && s.panel === panel ? s : { width, panel };
            });
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, [el]);
    return state;
}
