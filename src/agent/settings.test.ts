// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import {
    approvalWho,
    autoCompactOn,
    compactErrorText,
    compactNowState,
    internetApprovalText,
    internetHint,
    settingErrorText,
} from './settings';

describe('internetHint', () => {
    it('explains on and off', () => {
        expect(internetHint({ internet: true, state: 'active' })).toMatch(/^Internet access on/);
        expect(internetHint({ internet: false, state: 'active' })).toMatch(/^Internet access off.*ask for internet/);
    });
    it('says when a change reaches a dormant chat', () => {
        expect(internetHint({ internet: false, state: 'dormant' })).toMatch(/when the chat resumes\.$/);
        expect(internetHint({ internet: false, state: 'active' })).not.toMatch(/resumes/);
    });
});

describe('settingErrorText and compactErrorText', () => {
    it('explains a 409 of /compact as the agent working', () => {
        const e = new AgentApiError(409, 'chat is running');
        expect(compactErrorText(e)).toMatch(/agent is working right now/);
        expect(settingErrorText('compact', e)).toBe(compactErrorText(e));
    });
    it('names other failures with the message', () => {
        expect(compactErrorText(new AgentApiError(500, 'boom'))).toBe('Compaction failed: boom');
        expect(settingErrorText('internet', new Error('network down'))).toBe(
            'Switching internet access failed: network down',
        );
        expect(settingErrorText('autocompact', new AgentApiError(409, 'busy'))).toBe(
            'Switching auto-compaction is not possible right now: busy',
        );
    });
});

describe('compactNowState', () => {
    const idle = { running: false, resuming: false, state: 'active' as const };
    it('is enabled for an idle chat', () => {
        expect(compactNowState(idle, undefined)).toEqual({
            disabled: false,
            hint: 'Summarises older parts of the conversation now.',
        });
    });
    it('is locked while the agent works, resumes or compacts', () => {
        expect(compactNowState({ ...idle, running: true }, undefined).disabled).toBe(true);
        expect(compactNowState({ ...idle, resuming: true }, undefined).disabled).toBe(true);
        expect(compactNowState({ ...idle, resuming: true, starting: true }, undefined)).toEqual({
            disabled: true,
            hint: 'The sandbox of the chat is being prepared; nothing to compact yet.',
        });
        expect(compactNowState(idle, { reason: 'manual', since: 1 })).toEqual({
            disabled: true,
            hint: 'Compacting the context …',
        });
        expect(compactNowState(idle, undefined, true).disabled).toBe(true);
        expect(compactNowState(undefined, undefined).disabled).toBe(true);
    });
    it('says that a dormant chat resumes first', () => {
        const s = compactNowState({ ...idle, state: 'dormant' }, undefined);
        expect(s.disabled).toBe(false);
        expect(s.hint).toMatch(/Resumes the chat/);
    });
});

describe('autoCompactOn', () => {
    it("follows the chat and defaults to pi's on", () => {
        expect(autoCompactOn({ auto_compact: false })).toBe(false);
        expect(autoCompactOn({ auto_compact: true })).toBe(true);
        expect(autoCompactOn({})).toBe(true);
        expect(autoCompactOn(undefined)).toBe(true);
    });
});

describe('internet approvals', () => {
    it('names the agent or a subagent', () => {
        expect(approvalWho({ session: 'main' })).toBe('The agent');
        expect(approvalWho({})).toBe('The agent');
        expect(approvalWho({ session: 'run-42' })).toBe('A subagent');
    });
    it('shows the reason and what allowing does', () => {
        const t = internetApprovalText({ session: 'main', name: '  pip install pandas  ', via: 'cli' });
        expect(t.title).toBe('The agent asks for internet access');
        expect(t.reason).toBe('pip install pandas');
        expect(t.explain).toMatch(/globe in the chat header/);
    });
    it("drops the gateway's placeholder for a missing reason", () => {
        expect(internetApprovalText({ name: '(no reason given)', via: 'mcp' }).reason).toBeUndefined();
        expect(internetApprovalText({ name: '', via: 'mcp' }).reason).toBeUndefined();
    });
});
