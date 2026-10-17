// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

import {
    canAsk,
    defaultOptIn,
    effectiveOptIn,
    isOn,
    notificationBody,
    notifyCheckbox,
    permissionOf,
    requestPermission,
    shouldNotify,
    showNotification,
    NOTIFY_TITLE,
} from './notify';
import type { NotifyApi } from './notify';
import type { PlanAlert } from './planAlerts';

const alert = (over: Partial<PlanAlert> = {}): PlanAlert => ({
    chat_id: 'c1',
    plan_id: 'p1',
    kind: 'completed',
    title: 'Train pigs v1',
    ...over,
});

/** A stand-in for the browser: it holds a permission and answers the request with `next`. */
function api(permission: string, next = permission) {
    const requestPermission = vi.fn(async () => next);
    const Ctor = vi.fn();
    const notify = Object.assign(Ctor, { permission, requestPermission }) as unknown as NotifyApi;
    return { notify, requestPermission, Ctor };
}

describe('permissionOf', () => {
    it('reads the browser state and treats everything unknown as undecided', () => {
        expect(permissionOf(api('granted').notify)).toBe('granted');
        expect(permissionOf(api('denied').notify)).toBe('denied');
        expect(permissionOf(api('default').notify)).toBe('default');
        expect(permissionOf(undefined)).toBe('unsupported');
    });

    it('accepts a bare permission as the browser reports it', () => {
        expect(permissionOf('granted')).toBe('granted');
        expect(permissionOf('weird')).toBe('default');
    });
});

describe('requestPermission', () => {
    it('asks only while the browser has not decided', async () => {
        const undecided = api('default', 'granted');
        expect(await requestPermission(undecided.notify)).toBe('granted');
        expect(undecided.requestPermission).toHaveBeenCalledTimes(1);

        const allowed = api('granted');
        expect(await requestPermission(allowed.notify)).toBe('granted');
        expect(allowed.requestPermission).not.toHaveBeenCalled();

        const blocked = api('denied');
        expect(await requestPermission(blocked.notify)).toBe('denied');
        expect(blocked.requestPermission).not.toHaveBeenCalled();
    });

    it('without a browser interface nothing is asked', async () => {
        expect(await requestPermission(undefined)).toBe('unsupported');
    });

    it('a browser that throws leaves the state as it was', async () => {
        const notify = Object.assign(vi.fn(), {
            permission: 'default',
            requestPermission: vi.fn(async () => {
                throw new Error('no gesture');
            }),
        }) as unknown as NotifyApi;
        expect(await requestPermission(notify)).toBe('default');
    });
});

describe('shouldNotify (D4.4)', () => {
    it("only with a hidden tab and the user's permission", () => {
        expect(shouldNotify(alert(), true, true)).toBe(true);
        expect(shouldNotify(alert(), false, true)).toBe(false);
        expect(shouldNotify(alert(), true, false)).toBe(false);
    });

    it('only for the kinds the checkbox names: completes, fails, needs input', () => {
        for (const kind of ['completed', 'failed', 'needs_input']) {
            expect(shouldNotify(alert({ kind }), true, true)).toBe(true);
        }
        for (const kind of ['paused', 'attention', 'something']) {
            expect(shouldNotify(alert({ kind }), true, true)).toBe(false);
        }
    });
});

describe('the choice of a plan (D4.4)', () => {
    it('without a stored choice the browser permission decides: a granted one means on', () => {
        expect(defaultOptIn('granted')).toBe(true);
        for (const p of ['default', 'denied', 'unsupported'] as const) expect(defaultOptIn(p)).toBe(false);
        expect(effectiveOptIn(undefined, 'granted')).toBe(true);
        expect(effectiveOptIn(undefined, 'default')).toBe(false);
    });

    it('a stored choice wins over the permission', () => {
        expect(effectiveOptIn(false, 'granted')).toBe(false);
        expect(effectiveOptIn(true, 'default')).toBe(true);
    });
});

describe('canAsk and isOn', () => {
    it('the browser is asked while it has not decided and notifies once it allowed it', () => {
        expect(canAsk('default')).toBe(true);
        expect(canAsk('granted')).toBe(false);
        expect(canAsk('denied')).toBe(false);
        expect(isOn('granted')).toBe(true);
        expect(isOn('default')).toBe(false);
    });
});

describe('notificationBody', () => {
    it('is the snackbar text, with the step as a second line where it helps', () => {
        expect(notificationBody(alert())).toBe("Plan 'Train pigs v1' completed");
        expect(notificationBody(alert({ kind: 'failed', step: 3 }), 'Run training\nloss 0.1')).toBe(
            "Plan 'Train pigs v1' failed at step 3\nStep 3: Run training",
        );
    });
});

describe('showNotification', () => {
    it('shows one notification with the plan as its tag, and only with the permission', () => {
        const granted = api('granted');
        showNotification(alert(), undefined, granted.notify);
        expect(granted.Ctor).toHaveBeenCalledWith(NOTIFY_TITLE, {
            body: "Plan 'Train pigs v1' completed",
            tag: 'p1:completed',
        });

        const denied = api('denied');
        showNotification(alert(), undefined, denied.notify);
        expect(denied.Ctor).not.toHaveBeenCalled();
    });
});

describe('notifyCheckbox (L26)', () => {
    it('is open while the browser has not decided', () => {
        expect(notifyCheckbox('default', false)).toEqual({
            checked: false,
            disabled: false,
            blocked: false,
            help: expect.stringContaining('completes, fails or needs your input'),
        });
        expect(notifyCheckbox('default', true).checked).toBe(true);
    });

    it('is on but stays switchable once the browser allowed it', () => {
        const on = notifyCheckbox('granted', true);
        expect(on).toMatchObject({ checked: true, disabled: false, blocked: false });
        expect(on.help).toContain('On · completes, fails, needs input');
        // one plan kept quiet: the box is off and offers the normal hint again
        const off = notifyCheckbox('granted', false);
        expect(off).toMatchObject({ checked: false, disabled: false, blocked: false });
        expect(off.help).not.toContain('On ·');
    });

    it('is locked with the explanation once the browser blocked it', () => {
        const s = notifyCheckbox('denied', true);
        expect(s).toMatchObject({ checked: false, disabled: true, blocked: true });
        expect(s.help).toContain('Notifications are blocked');
        expect(notifyCheckbox('unsupported', false).disabled).toBe(true);
    });
});
