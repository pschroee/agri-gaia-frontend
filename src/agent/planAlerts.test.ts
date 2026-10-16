// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
    alertDetail,
    alertKey,
    alertName,
    alertShown,
    alertSticky,
    alertText,
    ALERT_MS,
    ALERT_QUEUE_MAX,
    badgeCount,
    badgeTooltip,
    dismissAlert,
    planAlertAction,
    pushAlert,
    QueuedAlert,
} from './planAlerts';
import type { PlanAlert } from './planAlerts';

const alert = (over: Partial<PlanAlert> = {}): PlanAlert => ({
    chat_id: 'c1',
    plan_id: 'p1',
    kind: 'completed',
    title: 'Train pigs v1',
    ...over,
});

describe('alertText', () => {
    it('names the plan and what happened, one wording per kind', () => {
        expect(alertText(alert({ kind: 'completed' }))).toBe("Plan 'Train pigs v1' completed");
        expect(alertText(alert({ kind: 'needs_input' }))).toBe("Plan 'Train pigs v1' needs your input");
        expect(alertText(alert({ kind: 'failed', step: 3 }))).toBe("Plan 'Train pigs v1' failed at step 3");
        expect(alertText(alert({ kind: 'paused', reason: 'login' }))).toBe("Plan 'Train pigs v1' paused · login lost");
        expect(alertText(alert({ kind: 'attention', reason: 'platform not readable' }))).toBe(
            "Plan 'Train pigs v1' needs attention · platform not readable",
        );
    });

    it('uses the short form of every pause reason (L24)', () => {
        const short: Record<string, string> = {
            user: 'by you',
            abort: 'agent stopped',
            login: 'login lost',
            budget_turns: 'turn budget used up',
            budget_cost: 'cost limit reached',
            restart: 'gateway restarted',
        };
        for (const [reason, word] of Object.entries(short)) {
            expect(alertText(alert({ kind: 'paused', reason }))).toBe(`Plan 'Train pigs v1' paused · ${word}`);
        }
    });

    it('keeps an unknown pause reason as the gateway wrote it', () => {
        expect(alertText(alert({ kind: 'paused', reason: 'something_new' }))).toBe(
            "Plan 'Train pigs v1' paused · something_new",
        );
    });

    it('without a title the sentence stands alone, and a long one is cut', () => {
        expect(alertText(alert({ title: '' }))).toBe('Plan completed');
        const long = 'x'.repeat(100);
        const text = alertText(alert({ title: long }));
        expect(text.startsWith("Plan 'xxx")).toBe(true);
        expect(text.endsWith("' completed")).toBe(true);
        expect(text.includes('…')).toBe(true);
    });

    it('a failed plan without a step number still says it failed', () => {
        expect(alertText(alert({ kind: 'failed' }))).toBe("Plan 'Train pigs v1' failed");
    });
});

describe('alertName', () => {
    it('cuts at ALERT_NAME_MAX characters and squeezes whitespace', () => {
        expect(alertName('  many   spaces ')).toBe(" 'many spaces'");
        expect(alertName(undefined)).toBe('');
    });
});

describe('alertDetail', () => {
    it('names the step and its first line', () => {
        expect(alertDetail(alert({ step: 2 }), 'Run training\nloss 0.1')).toBe('Step 2: Run training');
    });

    it('without a step or without a summary there is no second line', () => {
        expect(alertDetail(alert(), 'Run training')).toBe('');
        expect(alertDetail(alert({ step: 2 }), '')).toBe('');
    });
});

describe('duration and stickiness (D4.4)', () => {
    it('a snackbar stays 6 s (the design wanted 8), a question stays until it is answered', () => {
        expect(ALERT_MS).toBe(6000);
        expect(alertSticky(alert({ kind: 'needs_input' }))).toBe(true);
        for (const kind of ['completed', 'failed', 'paused', 'attention']) {
            expect(alertSticky(alert({ kind }))).toBe(false);
        }
    });
});

describe('alertShown', () => {
    it('hides the open chat on the agent page, where the card is already in front of the user', () => {
        expect(alertShown(alert({ chat_id: 'c1' }), { openChatId: 'c1', onAgentPage: true })).toBe(false);
        expect(alertShown(alert({ chat_id: 'c2' }), { openChatId: 'c1', onAgentPage: true })).toBe(true);
        expect(alertShown(alert({ chat_id: 'c1' }), { openChatId: 'c1', onAgentPage: false })).toBe(true);
    });
});

describe('the queue', () => {
    it('keeps one entry per plan and kind and puts the newest in front', () => {
        let queue: QueuedAlert[] = [];
        queue = pushAlert(queue, alert({ kind: 'paused' }));
        queue = pushAlert(queue, alert({ kind: 'paused', reason: 'again' }));
        expect(queue).toHaveLength(1);
        expect(queue[0].reason).toBe('again');
    });

    it('keeps at most ALERT_QUEUE_MAX entries', () => {
        let queue: QueuedAlert[] = [];
        for (let i = 0; i < ALERT_QUEUE_MAX + 3; i++) queue = pushAlert(queue, alert({ plan_id: `p${i}` }));
        expect(queue).toHaveLength(ALERT_QUEUE_MAX);
        expect(queue[0].plan_id).toBe(`p${ALERT_QUEUE_MAX + 2}`);
    });

    it('dismissing takes exactly that entry out', () => {
        const queue = [alert({ kind: 'paused' }), alert({ plan_id: 'p2' })].map((a) => ({
            ...a,
            id: alertKey(a),
        }));
        const left = dismissAlert(queue, alertKey(alert({ kind: 'paused' })));
        expect(left.map((q) => q.plan_id)).toEqual(['p2']);
    });
});

describe('planAlertAction', () => {
    it('reads a plan_alert of the stream', () => {
        const a = planAlertAction(JSON.stringify({ kind: 'plan_alert', data: alert({ step: 2 }) }));
        expect(a?.plan_id).toBe('p1');
        expect(a?.step).toBe(2);
    });

    it('ignores approvals, broken JSON and entries without a plan', () => {
        expect(planAlertAction(JSON.stringify({ kind: 'approval', data: {} }))).toBeUndefined();
        expect(planAlertAction('{')).toBeUndefined();
        expect(planAlertAction(JSON.stringify({ kind: 'plan_alert', data: { kind: 'paused' } }))).toBeUndefined();
    });

    it('drops unknown fields instead of passing them on', () => {
        const a = planAlertAction(
            JSON.stringify({ kind: 'plan_alert', data: { ...alert(), extra: { x: 1 }, step: 'two' } }),
        );
        expect(a).not.toHaveProperty('extra');
        expect(a?.step).toBeUndefined();
    });
});

describe('the badges (D4.4)', () => {
    it('count plans that need input plus open approvals', () => {
        expect(badgeCount(0, 0)).toBe(0);
        expect(badgeCount(1, 2)).toBe(3);
    });

    it('the tooltip names both parts and leaves out the empty one', () => {
        expect(badgeTooltip(1, 2)).toBe('1 plan needs your input · 2 approvals waiting');
        expect(badgeTooltip(2, 0)).toBe('2 plans need your input');
        expect(badgeTooltip(0, 1)).toBe('1 approval waiting');
        expect(badgeTooltip(0, 0)).toBe('');
    });
});
