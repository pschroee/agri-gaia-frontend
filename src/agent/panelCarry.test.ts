// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { expandToAgentPage } from './expand';
import {
    PanelAction,
    PanelState,
    agentTabOf,
    chatShownAt,
    onAgentChatTab,
    onAgentPage,
    panelReducer,
    panelShown,
} from './panelCarry';

const closed: PanelState = { open: false, carry: false };
const route = (pathname: string, hasChat = true, search = ''): PanelAction => ({
    type: 'route',
    pathname,
    search,
    hasChat,
});
const run = (s: PanelState, ...actions: PanelAction[]) => actions.reduce(panelReducer, s);

describe('routes', () => {
    it('knows the agent page and its tabs', () => {
        expect(onAgentPage('/ai-agent')).toBe(true);
        expect(onAgentPage('/ai-agent/x')).toBe(true);
        expect(onAgentPage('/ai-agents')).toBe(false);
        expect(onAgentPage('/data')).toBe(false);
        expect(agentTabOf(null)).toBe('chat');
        expect(agentTabOf('activity')).toBe('activity');
        expect(agentTabOf('status')).toBe('status');
        expect(agentTabOf('other')).toBe('chat');
        expect(onAgentChatTab('/ai-agent', '')).toBe(true);
        expect(onAgentChatTab('/ai-agent', '?tab=activity')).toBe(false);
        expect(onAgentChatTab('/data', '')).toBe(false);
    });

    it('needs the chat stream on platform pages and on the Chat tab only', () => {
        expect(chatShownAt('/data', '')).toBe(true);
        expect(chatShownAt('/models/7', '?tab=activity')).toBe(true);
        expect(chatShownAt('/ai-agent', '')).toBe(true);
        expect(chatShownAt('/ai-agent', '?tab=activity')).toBe(false);
        expect(chatShownAt('/ai-agent', '?tab=status')).toBe(false);
    });
});

describe('panelReducer', () => {
    it('opens the panel after leaving the Chat tab with a chat', () => {
        const s = run(closed, route('/ai-agent'), route('/data'));
        expect(panelShown(s)).toBe(true);
    });

    it('keeps the carried panel open while navigating between platform pages', () => {
        const s = run(closed, route('/ai-agent'), route('/data'), route('/models'), route('/train'));
        expect(panelShown(s)).toBe(true);
    });

    it('behaves as before without a chat on the agent page', () => {
        expect(panelShown(run(closed, route('/ai-agent', false), route('/data', false)))).toBe(false);
        const open = { open: true, carry: false };
        expect(panelShown(run(open, route('/ai-agent', false), route('/data', false)))).toBe(true);
    });

    it('does not carry from the Activity or Status tab', () => {
        expect(panelShown(run(closed, route('/ai-agent', true, '?tab=activity'), route('/data')))).toBe(false);
        // Chat tab first, then Activity: leaving from Activity does not carry
        expect(
            panelShown(run(closed, route('/ai-agent'), route('/ai-agent', true, '?tab=status'), route('/data'))),
        ).toBe(false);
    });

    it('keeps a closed panel closed between platform pages until the user comes from the Chat tab again', () => {
        let s = run(closed, route('/ai-agent'), route('/data'));
        s = panelReducer(s, { type: 'set', open: false });
        s = run(s, route('/models'), route('/train'), route('/data'));
        expect(panelShown(s)).toBe(false);
        s = run(s, route('/ai-agent'), route('/models'));
        expect(panelShown(s)).toBe(true);
    });

    it('opens again with the floating button after a close', () => {
        let s = run(closed, route('/ai-agent'), route('/data'), { type: 'set', open: false });
        s = run(s, { type: 'set', open: true }, route('/models'));
        expect(s).toEqual({ open: true, carry: false });
    });

    it('carries the chat back after "Open in agent page"', () => {
        let s: PanelState = { open: true, carry: false };
        expandToAgentPage('c1', {
            selectChat: () => undefined,
            setPanelOpen: (open) => (s = panelReducer(s, { type: 'set', open })),
            navigate: (path) => (s = panelReducer(s, route(path))),
        });
        expect(s).toEqual({ open: false, carry: true });
        expect(panelShown(panelReducer(s, route('/data')))).toBe(true);
    });

    it('follows a chat selected or removed while on the agent page', () => {
        let s = run(closed, route('/ai-agent', false));
        expect(s.carry).toBe(false);
        s = panelReducer(s, route('/ai-agent', true));
        expect(s.carry).toBe(true);
        s = panelReducer(s, route('/ai-agent', false));
        expect(s.carry).toBe(false);
    });

    it('returns the same state when nothing changes', () => {
        const s = { open: true, carry: false };
        expect(panelReducer(s, route('/data'))).toBe(s);
        expect(panelReducer(s, { type: 'set', open: true })).toBe(s);
        const c = { open: false, carry: true };
        expect(panelReducer(c, route('/ai-agent'))).toBe(c);
    });
});
