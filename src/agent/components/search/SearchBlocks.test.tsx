// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Tests of what a search puts into the history at its tool call (gateway issue #168): the card, the decided approval
// and the red line of a refused proposal or trial (A10, G2, G14), found by the MCP tool or by `agw-platform` in bash.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { emptyExperiments } from '../../experiments';
import { searchToolOf } from '../../searchView';
import { mockProposal, mockSearch, mockTrials } from '../../searchMock';
import type { Step } from '../../transcript';
import type { Approval } from '../../types';
import SearchBlocks from './SearchBlocks';
import type { SearchEnv } from './SearchCard';

afterEach(cleanup);

const env = (over: Partial<SearchEnv['experiments']> = {}): SearchEnv => ({
    chatId: 'c1',
    experiments: { ...emptyExperiments, loaded: true, ...over },
    actions: { stopTrial: async () => undefined, stopSearch: async () => undefined, changeBudget: async () => undefined, giveHint: async () => undefined, adoptTrial: async () => undefined, reload: async () => undefined },
    checks: [],
    layout: 'page',
});

const step = (over: Partial<Step>): Step => ({ id: 'call-1', tool: 'platform.propose_search', status: 'done', ...over }) as Step;

describe('finding the tool of a step', () => {
    it('knows the MCP tool and the CLI subcommand', () => {
        expect(searchToolOf({ name: 'mcp_platform_propose_search' })).toBe('propose_search');
        expect(searchToolOf({ tool: 'platform.search_next' })).toBe('search_next');
        expect(searchToolOf({ name: 'bash', args: { command: 'agw-platform search-next --params-file p.json' } })).toBe('search_next');
        expect(searchToolOf({ name: 'bash', args: { command: 'ls' } })).toBeUndefined();
    });
});

describe('the blocks of a search', () => {
    it('puts the card at the call that proposed the search', () => {
        render(<SearchBlocks steps={[step({})]} approvals={[]} env={env({ searches: [mockSearch()], trials: mockTrials() })} />);
        expect(screen.getByTestId('agent-search-card')).toBeTruthy();
    });

    it('puts the decided approval before the card', () => {
        const a = { id: 'a1', chat_id: 'c1', kind: 'search', tool_call_id: 'call-1', state: 'approved', created_at: '2026-10-20T09:00:00Z', search: mockProposal() } as unknown as Approval;
        render(<SearchBlocks steps={[step({})]} approvals={[a]} env={env({ searches: [mockSearch()], trials: mockTrials() })} />);
        const nodes = screen.getAllByTestId(/agent-search-(approval|card)$/).map((n) => n.getAttribute('data-testid'));
        expect(nodes).toEqual(['agent-search-approval', 'agent-search-card']);
    });

    it('shows a refused proposal as one line with the gateway text', () => {
        const s = step({ result: { isError: true, text: 'error: not enough compute calls left: 6 runs need 6, this chat has 4 left' } });
        render(<SearchBlocks steps={[s]} approvals={[]} env={env()} />);
        expect(screen.getByTestId('agent-search-refused').textContent).toContain('Start a training search · not enough compute calls left: 6 runs need 6, this chat has 4 left');
    });

    it('shows a refused trial as "Trial refused: …"', () => {
        const s = step({ id: 'call-2', tool: 'platform.search_next', result: { isError: true, text: 'learning_rate = 0.05 is outside the search space (float 0.0001 to 0.01, log)' } });
        render(<SearchBlocks steps={[s]} approvals={[]} env={env()} />);
        expect(screen.getByText('Trial refused:')).toBeTruthy();
        expect(screen.getByTestId('agent-search-refused').textContent).toContain('learning_rate = 0.05 is outside the search space');
    });

    it('shows nothing for other calls', () => {
        const { container } = render(<SearchBlocks steps={[step({ tool: 'bash', name: 'bash' })]} approvals={[]} env={env()} />);
        expect(container.textContent).toBe('');
    });
});
