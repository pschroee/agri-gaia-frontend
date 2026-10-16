// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { attachHint } from './files';
import { formatMs } from './format';
import { viaLabel } from './activity';
import { backgroundStatus } from './background';
import { olderChatsLabel } from './chatSearch';
import { newChatErrorText } from './newChat';
import { RUN_STATE_HINT } from './runState';
import { RESUME_STEP_LABEL, resumeSummary } from './resume';
import { internetHint } from './settings';
import { EXCERPT_NOTE } from './stepDetail';
import { runStatusLabel, subagentStateText, subagentStopErrorText } from './subagents';
import { abortLabel, abortLineText } from './transcript';
import type { ResumeView } from './resume';

// Visible texts of the agent UI name no infrastructure terms (issue #78, thesis #75/#78).
const INFRA = /sandbox|pool|slot|orchestrator|\/workspace/i;

const resume = (over: Partial<ResumeView>) => ({ state: 'running', start: false, steps: [], ...over }) as unknown as ResumeView;

describe('visible agent UI texts', () => {
    it('resume steps and summaries', () => {
        for (const label of Object.values(RESUME_STEP_LABEL)) expect(label).not.toMatch(INFRA);
        const texts = [
            resumeSummary(resume({ start: true }), formatMs),
            resumeSummary(resume({ start: false }), formatMs),
            resumeSummary(resume({ start: true, state: 'failed', error: 'x' }), formatMs),
            resumeSummary(resume({ start: false, state: 'failed' }), formatMs),
            resumeSummary(resume({ start: true, state: 'done', totalMs: 16200 }), formatMs),
            resumeSummary(resume({ start: false, state: 'done', totalMs: 2400 }), formatMs),
        ];
        for (const t of texts) expect(t).not.toMatch(INFRA);
    });

    it('new chat busy error', () => {
        expect(newChatErrorText(503, 'anything')).not.toMatch(INFRA);
    });

    it('background state of a lost task', () => {
        expect(backgroundStatus({ state: 'lost' }).label).not.toMatch(INFRA);
    });

    it('run state hints', () => {
        for (const hint of Object.values(RUN_STATE_HINT)) expect(hint).not.toMatch(INFRA);
    });

    it('internet and attachment hints', () => {
        expect(internetHint({ internet: true, state: 'dormant' })).not.toMatch(INFRA);
        expect(internetHint({ internet: false, state: 'active' })).not.toMatch(INFRA);
        expect(attachHint(10)).not.toMatch(INFRA);
    });

    it('the activity names the gateway without an infrastructure term', () => {
        // issue L2/#119: the gateway's own reads show up as "System", not as "orchestrator".
        expect(viaLabel('orchestrator')).not.toMatch(INFRA);
        expect(viaLabel('user')).not.toMatch(INFRA);
    });

    it('the number of older chats reads as a sentence, in both numbers', () => {
        // issue #122: "1 older chat – search above or open the agent page" in the panel's chat list.
        expect(olderChatsLabel(1)).toBe('1 older chat');
        expect(olderChatsLabel(12)).toBe('12 older chats');
        for (const n of [1, 2, 12]) expect(olderChatsLabel(n)).not.toMatch(INFRA);
    });

    it('stopping a subagent and its reasons (issue #120)', () => {
        // the labels of a stopped step, the closing line and every state of a run
        for (const reason of ['user', 'trash', 'time_limit', 'turn_limit', 'subagent_limit', undefined, 'other']) {
            expect(abortLabel(reason), String(reason)).not.toMatch(INFRA);
            expect(abortLineText(reason), String(reason)).not.toMatch(INFRA);
        }
        for (const state of ['running', 'idle', 'done', 'failed', 'stopped'] as const) {
            expect(runStatusLabel(state), state).not.toMatch(INFRA);
            expect(subagentStateText(state), state).not.toMatch(INFRA);
        }
        expect(runStatusLabel('stopped', 'user')).not.toMatch(INFRA);
        expect(runStatusLabel('stopped', 'limit')).not.toMatch(INFRA);
        // the texts the interface shows around a refused stop
        for (const o of [
            { code: 'not_running' },
            { code: 'chat_in_trash' },
            { code: 'subagents_unavailable' },
            { status: 404 },
            {},
        ]) {
            expect(subagentStopErrorText(o), JSON.stringify(o)).not.toMatch(INFRA);
        }
        expect(EXCERPT_NOTE, 'excerpt').not.toMatch(INFRA);
        // the texts of the stop controls, tooltip and accessible name
        expect('Stop subagent Count the images').not.toMatch(INFRA);
        expect('Stop this subagent').not.toMatch(INFRA);
    });
});
