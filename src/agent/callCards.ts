// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Where the cards of a run of tool calls stand (issue #192): every decided approval, run card, search card, plan and
// other card hangs on the call that asked for it, so the group of calls is cut right after that call and the card
// stands there. This file holds the one binding rule and the cut; Conversation.tsx renders the pieces.

import type { AnnotationItem } from './annotation';
import { annotationCardsIn } from './annotation';
import type { CheckItem } from './assess';
import { checkCardsIn } from './assess';
import { deploymentCardsIn } from './deploymentCard';
import type { WatchJob } from './jobs';
import { notebookJobsOf } from './notebook';
import type { PlacedPlan } from './plan';
import { isProposal } from './searchApproval';
import { searchToolOf } from './searchView';
import type { Step } from './transcript';
import type { Approval } from './types';

/** The one binding rule: an approval (or search, job) belongs to the step whose `id` or `callId` it names. */
export function boundTo(a: { tool_call_id?: string }, s: { id: string; callId?: string }): boolean {
    return !!a.tool_call_id && (a.tool_call_id === s.id || a.tool_call_id === s.callId);
}

/** An approval that shows as a one-line row of its own once decided (everything but a plan, which has its card). */
export const isDecidedRow = (a: Approval): boolean => a.state !== 'pending' && a.kind !== 'plan';

/** What the cut needs to know about the chat. */
export type CallCardsCtx = {
    jobs: readonly WatchJob[];
    approvals?: readonly Approval[];
    searches?: readonly { tool_call_id?: string }[];
    searchOn: boolean;
    annotation: readonly AnnotationItem[];
    checks: readonly CheckItem[];
    plans?: readonly PlacedPlan[];
    /** Steps (`subagent` calls) that started subagent runs; their card stands right below the call (#197). */
    subagentCalls?: ReadonlySet<string>;
};

/**
 * The ids of the steps after which a card stands: decided approvals of every kind, plans (open or decided), runs of
 * the notebook server, refused search calls, searches, and the deployment, annotation and check cards. Open approvals
 * (except plans) do not cut: they stay in the group "Waiting for your approval".
 */
export function callAnchors(steps: readonly Step[], ctx: CallCardsCtx): Set<string> {
    const out = new Set<string>();
    for (const s of steps) {
        const hit =
            (ctx.approvals ?? []).some((a) => boundTo(a, s) && (isDecidedRow(a) || a.kind === 'plan')) ||
            (ctx.plans ?? []).some((p) => !!p.afterCallId && (p.afterCallId === s.id || p.afterCallId === s.callId)) ||
            notebookJobsOf([...ctx.jobs], [s.id, ...(s.callId ? [s.callId] : [])]).length > 0 ||
            (ctx.searchOn &&
                (((searchToolOf(s) === 'propose_search' || searchToolOf(s) === 'search_next') && !!s.result?.isError) ||
                    (ctx.searches ?? []).some((x) => boundTo(x, s)) ||
                    (ctx.approvals ?? []).some((a) => a.kind === 'search' && boundTo(a, s) && isProposal(a.search)))) ||
            deploymentCardsIn([s], ctx.jobs).length > 0 ||
            annotationCardsIn([s], ctx.annotation).length > 0 ||
            checkCardsIn([s], ctx.checks).length > 0 ||
            !!ctx.subagentCalls?.has(s.id);
        if (hit) out.add(s.id);
    }
    return out;
}

/** The steps cut after every anchor: never an empty piece, and exactly one piece when there is no anchor. */
export function splitAfter<T extends { id: string }>(steps: T[], anchors: Set<string>): T[][] {
    const out: T[][] = [];
    let cur: T[] = [];
    for (const s of steps) {
        cur.push(s);
        if (anchors.has(s.id)) {
            out.push(cur);
            cur = [];
        }
    }
    if (cur.length > 0 || out.length === 0) out.push(cur);
    return out;
}
