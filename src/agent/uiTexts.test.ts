// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { attachHint } from './files';
import { formatMs } from './format';
import { viaLabel } from './activity';
import { backgroundStatus } from './background';
import { newChatErrorText } from './newChat';
import { RUN_STATE_HINT } from './runState';
import { RESUME_STEP_LABEL, resumeSummary } from './resume';
import { internetHint } from './settings';
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
});
