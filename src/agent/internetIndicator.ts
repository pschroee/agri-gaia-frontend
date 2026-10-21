// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Pure helpers of the internet indicator and its popover (gateway issue #175, design `internet-access`, b1–b8): the
// blocked block, the link into Activity, the package lines and the grant title. The texts of the shared views live in
// `internetView.ts`; this file only combines them for the popover.

import type { InternetBlocked, InternetBlockedEntry, InternetGrant, PackageEntry } from './internet';
import {
    PACKAGE_FOLD,
    clock,
    dependenciesText,
    ecosystemOfHost,
    formatData,
    grantName,
    latestUntilText,
    limitText,
    packageProgress,
    packageProgressText,
    reasonText,
    rootPackages,
    timeLeftLine,
    versionText,
} from './internetView';

/** How many refusals the popover lists. */
export const BLOCKED_SHOWN = 3;

/** Activity › Internet connections › Blocked, for the chat (the Activity view reads `kind`, `result` and `chat`). */
export function blockedActivityLink(chatId: string): string {
    const q = new URLSearchParams({ tab: 'activity', kind: 'connections', result: 'blocked', chat: chatId });
    return `/ai-agent?${q.toString()}`;
}

/** The refusals the popover lists: the latest three, newest first as the gateway sends them. */
export const shownBlocked = (b: InternetBlocked | undefined): InternetBlockedEntry[] =>
    (b?.last ?? []).slice(0, BLOCKED_SHOWN);

/** "Show in Activity", or "Show all 7 in Activity" when the list shows fewer than the counter (G15). */
export function showInActivityText(b: InternetBlocked | undefined): string {
    const count = b?.count ?? 0;
    return count > shownBlocked(b).length ? `Show all ${count} in Activity` : 'Show in Activity';
}

/** What a refusal names: the host, or "pip:opencv-python" for a package the gate refused. */
export function blockedTarget(e: Pick<InternetBlockedEntry, 'host' | 'package'>): string {
    return e.package ? `${ecosystemOfHost(e.host) ?? 'pip'}:${e.package}` : e.host;
}

/** Second line of a refusal: "not in the list · 14:10". */
export function blockedDetail(e: Pick<InternetBlockedEntry, 'reason' | 'at'>): string {
    const t = clock(e.at);
    return t ? `${reasonText(e.reason)} · ${t}` : reasonText(e.reason);
}

/** The title of a grant in the popover: "Web search", "2 packages", "1 site", "Full access". */
export function popoverGrantTitle(g: Pick<InternetGrant, 'kind' | 'domains' | 'packages'>): string {
    return g.kind === 'search' ? 'Web search' : grantName(g);
}

/** One line of a packages grant: "2.5.1 · installed", "any version · waiting". */
export function packageNote(p: Pick<PackageEntry, 'state' | 'version' | 'installed_version'>): string {
    const version = p.state === 'installed' ? p.installed_version || versionText(p.version) : versionText(p.version);
    return `${version} · ${p.state}`;
}

/** The roots of a packages grant, the first five or all of them. */
export function shownRoots(list: PackageEntry[] | undefined, all: boolean): PackageEntry[] {
    const roots = rootPackages(list);
    return all ? roots : roots.slice(0, PACKAGE_FOLD);
}

export type Progress = { value: number; valueText: string; caption: string; time: string; extra: string };

/**
 * Bar and captions of a grant (A13): a packages grant shows the roots installed, the dependencies found so far with the
 * data used against the safety net, and "Ends when installed · at the latest until 14:38"; the others the data used and
 * the time left.
 */
export function grantProgress(g: InternetGrant, now: number): Progress {
    const data = g.max_bytes > 0 ? `${formatData(g.bytes)} of ${limitText(g.max_bytes)}` : formatData(g.bytes);
    const dataValue = g.max_bytes > 0 ? Math.min(100, Math.max(0, (g.bytes / g.max_bytes) * 100)) : 0;
    if (g.kind !== 'packages') {
        return { value: dataValue, valueText: data, caption: data, time: timeLeftLine(g, now), extra: '' };
    }
    const p = packageProgress(g.packages);
    const text = packageProgressText(g.packages);
    const until = latestUntilText(g);
    return {
        value: p.roots > 0 ? (p.rootsInstalled / p.roots) * 100 : 0,
        valueText: text,
        caption: text,
        time: until ? `Ends when installed · ${until}` : 'Ends when installed',
        extra: [dependenciesText(g.packages), data].filter(Boolean).join(' · '),
    };
}
