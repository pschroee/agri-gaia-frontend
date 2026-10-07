// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AGENT_ROUTE, expandToAgentPage } from './expand';

function recorder() {
    const calls: string[] = [];
    return {
        calls,
        deps: {
            selectChat: (id: string) => calls.push(`select ${id}`),
            setPanelOpen: (open: boolean) => calls.push(`panel ${open}`),
            navigate: (path: string) => calls.push(`navigate ${path}`),
        },
    };
}

describe('expandToAgentPage', () => {
    it('selects the chat, closes the panel and opens the Chat tab of the agent page', () => {
        const r = recorder();
        expect(expandToAgentPage('c1', r.deps)).toBe(true);
        expect(r.calls).toEqual(['select c1', 'panel false', 'navigate /ai-agent']);
    });

    it('opens the Chat tab, not a remembered other tab', () => {
        expect(AGENT_ROUTE).toBe('/ai-agent');
        expect(AGENT_ROUTE).not.toContain('tab=');
    });

    it('does nothing without a chat', () => {
        const r = recorder();
        expect(expandToAgentPage(undefined, r.deps)).toBe(false);
        expect(r.calls).toEqual([]);
    });
});
