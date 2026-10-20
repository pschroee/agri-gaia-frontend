// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    approvalTitle,
    codeChangeFoot,
    codeChangeSummary,
    diffCounts,
    diffRows,
    endsByText,
    fixedSummary,
    holdoutText,
    isCodeChange,
    isProposal,
    proposalSummary,
    waitingText,
} from './searchApproval';
import { mockCodeChange, mockProposal } from './searchMock';

describe('the approval of a proposal', () => {
    it('tells a proposal from a code change', () => {
        expect(isProposal(mockProposal())).toBe(true);
        expect(isCodeChange(mockCodeChange())).toBe(true);
        expect(approvalTitle(mockProposal())).toBe('Start a training search');
        expect(approvalTitle(mockCodeChange())).toBe("Code changed in training search 'tf-flowers'");
    });

    it('summarises the runs, the dataset and the target', () => {
        expect(proposalSummary(mockProposal())).toBe('Up to 6 training runs on dataset tf-flowers-mini-train (#59), stops at val. accuracy ≥ 0.9');
        const loss = mockProposal({ objective: { metric: 'val_loss', mode: 'min' }, budget: { target: 0.4 } });
        expect(proposalSummary(loss)).toContain('val. loss ≤ 0.4');
    });

    it('counts down from the expiry of the approval', () => {
        const now = Date.parse('2026-10-20T10:00:00Z');
        expect(waitingText('2026-10-20T10:09:00Z', now)).toBe('Waiting for you · 9 min left');
        expect(waitingText(undefined, now)).toBe('Waiting for you');
        expect(waitingText('2026-10-20T09:59:00Z', now)).toBe('Waiting for you · about to expire');
    });

    it('lists the fixed settings and the test set', () => {
        expect(fixedSummary({ optimizer: 'AdamW', scheduler: 'ReduceLROnPlateau', weight_decay: 0.01 })).toBe(
            'Fixed settings · 3 (optimizer AdamW, scheduler ReduceLROnPlateau, …)',
        );
        expect(holdoutText({ available: false })).toBe('No held-back test set — the final test is skipped.');
        expect(holdoutText(mockProposal().holdout)).toContain('92 images of tf-flowers-mini (#58)');
        expect(endsByText(12)).toBe('The search ends after 12 h at the latest.');
        expect(endsByText(undefined)).toContain('time limit');
    });
});

describe('the code change', () => {
    it('numbers the lines of the diff and marks added and removed lines', () => {
        const rows = diffRows(mockCodeChange().files[0].diff);
        expect(rows).toEqual([
            { kind: 'line', n: 7, sign: '', text: 'context' },
            { kind: 'line', n: 8, sign: '−', text: 'old line' },
            { kind: 'line', n: 8, sign: '+', text: 'new line' },
            { kind: 'line', n: 9, sign: '+', text: 'second new line' },
            { kind: 'line', n: 10, sign: '', text: 'tail' },
        ]);
        expect(diffCounts(rows)).toBe('1 line removed, 2 added');
    });

    it('separates hunks', () => {
        expect(diffRows('@@ -1 +1 @@\n-a\n+b\n@@ -20 +20 @@\n-c\n+d').filter((r) => r.kind === 'gap')).toHaveLength(1);
        expect(diffRows(undefined)).toEqual([]);
    });

    it('says what approving means', () => {
        const c = mockCodeChange();
        expect(codeChangeSummary(c)).toBe('Version 1 → 2 · train.py changed · applies to trial 6 and later');
        expect(codeChangeFoot(c)).toBe('Approving makes version 2 the code of the following trials. Trials 1–5 keep version 1.');
    });
});
