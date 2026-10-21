// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Pure helpers of the internet grants views (gateway issue #175, design `internet-access`): the texts of the approval
// card, the decided line, the indicator, the popover, the snackbar, the blocked lines in the chat and the activity
// tables. No React, no network: every function takes the data and the time it needs, so a test can check the wording.
// The decisions behind the wording are the comment "Entscheidungen zu Übernahme (A1–A22) und Gegenprüfung (G1–G16)".

import type {
    ActivityGrant,
    Connection,
    ConnectionsSummary,
    EndedReason,
    GrantBrief,
    InternetApproval,
    InternetBlocked,
    InternetGrant,
    InternetKind,
    PackageEntry,
    PackageState,
    UnlistedBytes,
} from './internet';

/** The grant data the texts need; both the chat's grant and the activity's `grant` fit. */
type GrantLike = Pick<InternetGrant, 'kind'> & Partial<Pick<InternetGrant, 'domains' | 'max_bytes' | 'bytes' | 'expires_at'>>;

// ---------------------------------------------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------------------------------------------

export const KINDS: InternetKind[] = ['search', 'domains', 'packages', 'full'];

/** The chip on a card and in a row: the kind in capitals (`domains` is called "sites" in the UI). */
export const KIND_CHIP: Record<InternetKind, string> = {
    search: 'SEARCH ONLY',
    domains: 'SITES',
    packages: 'PACKAGES',
    full: 'FULL ACCESS',
};

/** The kind in a word ("Sites approved for the agent", "Sites ended: …"). */
export const KIND_NAME: Record<InternetKind, string> = {
    search: 'Search',
    domains: 'Sites',
    packages: 'Packages',
    full: 'Full access',
};

/** Names of the MUI icons of the design: TravelExplore, Link, Inventory2, Public (warning colour for full). */
export const KIND_ICON: Record<InternetKind, 'TravelExplore' | 'Link' | 'Inventory2' | 'Public'> = {
    search: 'TravelExplore',
    domains: 'Link',
    packages: 'Inventory2',
    full: 'Public',
};

/** Warning text colour (AA on white, G13); areas and icons may keep `#e65100`. */
export const WARNING_TEXT_COLOR = '#b23c00';
export const WARNING_AREA_COLOR = '#e65100';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
export const sitesText = (n: number): string => plural(n, 'site', 'sites');
export const packagesText = (n: number): string => plural(n, 'package', 'packages');

// ---------------------------------------------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------------------------------------------

/** A package request parsed from the canonical string of `approval.internet.packages` (`pip:torch[a,b]==2.5.1`). */
export type PackageSpec = { ecosystem: 'pip' | 'npm'; name: string; extras: string[]; version?: string };

/** Parses `pip:name[extras]==version` and `npm:@scope/name@version`; undefined for something else. */
export function parsePackage(s: string): PackageSpec | undefined {
    const colon = s.indexOf(':');
    if (colon < 0) return undefined;
    const ecosystem = s.slice(0, colon);
    let rest = s.slice(colon + 1);
    if (ecosystem === 'pip') {
        let version: string | undefined;
        const eq = rest.indexOf('==');
        if (eq >= 0) {
            version = rest.slice(eq + 2) || undefined;
            rest = rest.slice(0, eq);
        }
        let extras: string[] = [];
        const br = rest.indexOf('[');
        if (br >= 0 && rest.endsWith(']')) {
            extras = rest
                .slice(br + 1, -1)
                .split(',')
                .map((e) => e.trim())
                .filter(Boolean);
            rest = rest.slice(0, br);
        }
        return rest ? { ecosystem, name: rest, extras, version } : undefined;
    }
    if (ecosystem === 'npm') {
        // the version follows the last "@" that is not the scope's
        const at = rest.lastIndexOf('@');
        let version: string | undefined;
        if (at > 0) {
            version = rest.slice(at + 1) || undefined;
            rest = rest.slice(0, at);
        }
        return rest ? { ecosystem, name: rest, extras: [], version } : undefined;
    }
    return undefined;
}

/** Name with extras in monospace form: `torch[opt]` (A19). */
export const packageLabel = (p: Pick<PackageSpec, 'name' | 'extras'>): string =>
    p.extras.length ? `${p.name}[${p.extras.join(',')}]` : p.name;

/** The version column of a card: the pin, else "any version" — never "latest" (G4). */
export const versionText = (version: string | undefined): string => version || 'any version';

/** Packages of an approval, parsed; strings that do not parse are kept as pip-less names so nothing disappears. */
export function approvalPackages(a: Pick<InternetApproval, 'packages'>): PackageSpec[] {
    return (a.packages ?? []).map((s) => parsePackage(s) ?? { ecosystem: 'pip' as const, name: s, extras: [] });
}

/** Cards fold a list longer than this behind "Show all {n}". */
export const PACKAGE_FOLD = 5;

export const showAllText = (n: number): string => `Show all ${n}`;
export const SHOW_FEWER_TEXT = 'Show fewer';

/** The packages the agent asked for (no parent), in the order the gateway sends them. */
export const rootPackages = (list: PackageEntry[] | undefined): PackageEntry[] => (list ?? []).filter((p) => !p.parent);
export const dependencyPackages = (list: PackageEntry[] | undefined): PackageEntry[] => (list ?? []).filter((p) => !!p.parent);

/** One package's state in words (G7): there is no "installing". */
export function packageStateText(p: Pick<PackageEntry, 'state' | 'installed_version'>): string {
    if (p.state === 'installed') return p.installed_version ? `installed ${p.installed_version}` : 'installed';
    return p.state === 'downloaded' ? 'downloaded' : 'waiting';
}

export const PACKAGE_STATE_ORDER: PackageState[] = ['waiting', 'downloaded', 'installed'];

/** Progress of a packages grant: roots installed of all roots, and the dependencies found so far. */
export function packageProgress(list: PackageEntry[] | undefined): {
    roots: number;
    rootsInstalled: number;
    dependencies: number;
    dependenciesInstalled: number;
} {
    const roots = rootPackages(list);
    const deps = dependencyPackages(list);
    return {
        roots: roots.length,
        rootsInstalled: roots.filter((p) => p.state === 'installed').length,
        dependencies: deps.length,
        dependenciesInstalled: deps.filter((p) => p.state === 'installed').length,
    };
}

/** "1 of 2 installed · Ends when installed". */
export function packageProgressText(list: PackageEntry[] | undefined): string {
    const p = packageProgress(list);
    return `${p.rootsInstalled} of ${p.roots} installed`;
}

/** "+ 9 dependencies so far" (A13); empty while there are none. */
export function dependenciesText(list: PackageEntry[] | undefined): string {
    const n = packageProgress(list).dependencies;
    return n ? `+ ${n} ${n === 1 ? 'dependency' : 'dependencies'} so far` : '';
}

/** The ecosystem a host belongs to: pypi.org and files.pythonhosted.org are pip, registry.npmjs.org is npm. */
export function ecosystemOfHost(host: string): 'pip' | 'npm' | undefined {
    const h = host.toLowerCase();
    if (h === 'pypi.org' || h.endsWith('pythonhosted.org')) return 'pip';
    if (h === 'registry.npmjs.org' || h.endsWith('npmjs.org') || h.endsWith('npmjs.com')) return 'npm';
    return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Sizes and times
// ---------------------------------------------------------------------------------------------------------------

/** Bytes as "133 kB", "7.2 MB", "2.6 GB" (the gateway counts MiB: `MaxBytes>>20`; the design prints MB and GB). */
export function formatData(n: number | undefined): string {
    if (n === undefined || !Number.isFinite(n) || n < 0) return '–';
    if (n < 1024) return `${n} B`;
    const units = ['kB', 'MB', 'GB'];
    let v = n / 1024;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[u]}`;
}

/** A limit given in MB: "500 MB", "4 GB" (multiples of 1000 are named in GB, as the design does). */
export function megabytesText(mb: number): string {
    return mb >= 1000 && mb % 1000 === 0 ? `${mb / 1000} GB` : `${Math.round(mb)} MB`;
}

/** The limit of a grant in bytes as "500 MB" / "4 GB". */
export const limitText = (maxBytes: number): string => megabytesText(Math.round(maxBytes / (1 << 20)));

/** Minutes left, rounded up, never below 1 while time remains; "0 min" once over. */
export function minutesLeft(expiresAt: string | undefined, now: number): number | undefined {
    if (!expiresAt) return undefined;
    const t = Date.parse(expiresAt);
    if (Number.isNaN(t)) return undefined;
    const ms = t - now;
    return ms <= 0 ? 0 : Math.max(1, Math.ceil(ms / 60000));
}

const clockFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
/** "14:38" in the browser's time zone; empty for an invalid time. */
export function clock(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : clockFmt.format(d);
}

// ---------------------------------------------------------------------------------------------------------------
// Approval card
// ---------------------------------------------------------------------------------------------------------------

type CardData = Pick<InternetApproval, 'kind' | 'by'> & Partial<Pick<InternetApproval, 'domains' | 'packages'>>;

/** Number of packages the card names: the agent's own, no dependencies. */
export const requestedPackageCount = (a: Pick<InternetApproval, 'packages'>): number => (a.packages ?? []).length;

/** "The agent asks to search the web", "A helper of the agent asks to download from 2 sites", … (G9). */
export function approvalTitle(a: CardData): string {
    const who = a.by === 'helper' ? 'A helper of the agent asks' : 'The agent asks';
    switch (a.kind) {
        case 'search':
            return `${who} to search the web`;
        case 'domains':
            return `${who} to download from ${sitesText((a.domains ?? []).length)}`;
        case 'packages':
            return `${who} to install ${packagesText(requestedPackageCount({ packages: a.packages ?? [] }))}`;
        default:
            return `${who} for full internet access`;
    }
}

/** Label of the ALLOW button: "ALLOW SEARCH", "ALLOW 1 SITE", "ALLOW 2 PACKAGES", "ALLOW FULL ACCESS". */
export function allowLabel(a: CardData): string {
    switch (a.kind) {
        case 'search':
            return 'ALLOW SEARCH';
        case 'domains':
            return `ALLOW ${sitesText((a.domains ?? []).length).toUpperCase()}`;
        case 'packages':
            return `ALLOW ${packagesText((a.packages ?? []).length).toUpperCase()}`;
        default:
            return 'ALLOW FULL ACCESS';
    }
}

/** aria-label of the ALLOW button: it names what is allowed. */
export function allowAria(a: CardData): string {
    switch (a.kind) {
        case 'search':
            return 'Allow web search for this chat';
        case 'domains': {
            const d = a.domains ?? [];
            return `Allow ${sitesText(d.length)}: ${d.join(', ')}`;
        }
        case 'packages': {
            const names = approvalPackages({ packages: a.packages ?? [] }).map((p) => p.name);
            return `Allow ${packagesText(names.length)}: ${names.join(', ')}`;
        }
        default:
            return 'Allow full internet access for this chat';
    }
}

export type CardTexts = {
    /** The line under "What is allowed" (for search and full; sites and packages show their list instead). */
    allowText?: string;
    /** Extra hints of the card in order (G5, G6, the upload hint). */
    hints: string[];
    /** Text of the warning `Alert` (full only). */
    warning?: string;
};

export const FULL_WARNING =
    'Full access: the agent can reach any address the server can reach, also with programs other than downloads and package installs; those connections are counted but not all listed one by one.';

/** Texts of a pending card by kind; `ecosystems` are the ecosystems of the listed packages (npm adds "any version"). */
export function cardTexts(kind: InternetKind, ecosystems: ('pip' | 'npm')[] = []): CardTexts {
    switch (kind) {
        case 'search':
            return {
                allowText: 'Web search and reading pages through the web tools. Commands stay offline.',
                hints: ["The agent's web tools read any public page; the page address leaves the platform."],
            };
        case 'domains':
            return { hints: ['Data can be sent to these sites too.', 'The web tools can use these sites too.'] };
        case 'packages': {
            const npm = ecosystems.includes('npm');
            return {
                hints: [
                    'Packages these need are allowed too, and shown afterwards.',
                    npm
                        ? 'Dependencies of these packages (npm: any version of them), build tools (pip, setuptools, wheel) and install scripts run too.'
                        : 'Dependencies of these packages, build tools (pip, setuptools, wheel) and install scripts run too.',
                ],
            };
        }
        default:
            return { allowText: 'Any address the server can reach, with any program.', hints: [], warning: FULL_WARNING };
    }
}

/** The limit line of a card, from the values the gateway clamped (A18). */
export function limitsLine(a: Pick<InternetApproval, 'kind' | 'minutes' | 'megabytes'>): string {
    if (a.kind === 'packages')
        return `Ends when these packages are installed (at the latest after ${a.minutes} min or ${megabytesText(a.megabytes)}).`;
    return `Ends after ${a.minutes} min or ${megabytesText(a.megabytes)}, whichever comes first. You can switch it off any time.`;
}

/** "Request lapses at 14:20" for a pending card (G14); empty without `expires_at`. */
export function expiresText(a: Pick<InternetApproval, 'expires_at'>): string {
    const t = clock(a.expires_at);
    return t ? `Request lapses at ${t}` : '';
}

/** Question of the user's own switch (Off → On): the default limits are part of the text. */
export const SWITCH_ON_TITLE = 'Switch on full access?';
export function switchOnText(minutes = 30, megabytes = 500): string {
    return `The agent can reach any address the server can reach, with any program. Ends after ${minutes} min or ${megabytesText(megabytes)}, whichever comes first.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Decided line
// ---------------------------------------------------------------------------------------------------------------

/** Title and summary of a decided card (A2): "Search the web" / "web tools", "Download from 1 site" / the host, … */
export function decidedTitle(a: CardData): { title: string; summary: string } {
    switch (a.kind) {
        case 'search':
            return { title: 'Search the web', summary: 'web tools' };
        case 'domains': {
            const d = a.domains ?? [];
            return { title: `Download from ${sitesText(d.length)}`, summary: d.join(', ') };
        }
        case 'packages': {
            const names = approvalPackages({ packages: a.packages ?? [] }).map((p) => p.name);
            return { title: `Install ${packagesText(names.length)}`, summary: names.join(', ') };
        }
        default:
            return { title: 'Full internet access', summary: 'any address' };
    }
}

/** What happened to a grant, in the words of the card and the activity (A3, A10, A11). */
export type EndInfo = {
    /** After "ended:" on the card: "time is up", "data limit reached", "packages installed". */
    long: string;
    /** The activity's result word: "ended: time". */
    short: string;
    /** MUI icon name (A3): TaskAlt, TimerOff, DataUsage, PublicOff, ErrorOutline. */
    icon: 'TaskAlt' | 'TimerOff' | 'DataUsage' | 'PublicOff' | 'ErrorOutline';
};

const END_INFO: Record<EndedReason, EndInfo> = {
    time: { long: 'time is up', short: 'ended: time', icon: 'TimerOff' },
    bytes: { long: 'data limit reached', short: 'ended: data limit', icon: 'DataUsage' },
    installed: { long: 'packages installed', short: 'ended: installed', icon: 'TaskAlt' },
    user: { long: 'switched off', short: 'switched off', icon: 'PublicOff' },
    agent: { long: 'ended by the agent', short: 'ended by the agent', icon: 'PublicOff' },
    error: { long: 'error', short: 'ended: error', icon: 'ErrorOutline' },
};

/** Texts and icon of an end reason; an unknown or missing reason is shown like an error. */
export function endInfo(reason: string | undefined): EndInfo {
    return END_INFO[(reason ?? '') as EndedReason] ?? END_INFO.error;
}

/**
 * The state part of a decided card: "approved 14:08 · active until 14:38", "approved 14:08 · installing",
 * "rejected 14:09", "no decision in time", "ended: time is up 14:38", "ended by the agent 14:20".
 * `approval` is the approval's state; `grant` the grant it started (missing for a rejected or expired request).
 */
export function decidedStateText(
    approval: { state: 'pending' | 'approved' | 'rejected' | 'expired'; decided_at?: string },
    grant?: Pick<InternetGrant, 'kind' | 'state' | 'started_at' | 'expires_at' | 'ended_at' | 'ended_reason'>,
): string {
    if (approval.state === 'rejected') return `rejected ${clock(approval.decided_at)}`.trim();
    if (approval.state === 'expired') return 'no decision in time';
    if (approval.state === 'pending') return 'waiting for your approval';
    const started = clock(grant?.started_at ?? approval.decided_at);
    if (grant && grant.state === 'ended') {
        const e = endInfo(grant.ended_reason);
        const at = clock(grant.ended_at);
        return grant.ended_reason === 'agent' || grant.ended_reason === 'user' ? `${e.long} ${at}`.trim() : `ended: ${e.long} ${at}`.trim();
    }
    if (grant?.kind === 'packages') return `approved ${started} · installing`.trim();
    const until = clock(grant?.expires_at);
    return until ? `approved ${started} · active until ${until}` : `approved ${started}`.trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Indicator, popover, snackbar
// ---------------------------------------------------------------------------------------------------------------

/** Active means running now: state "active". */
export const isActive = (g: Pick<InternetGrant, 'state'>): boolean => g.state === 'active';

/** The progress of a grant's data limit: 0..1, undefined without a limit. */
export function dataFraction(g: Pick<InternetGrant, 'bytes' | 'max_bytes'>): number | undefined {
    return g.max_bytes > 0 ? Math.min(1, Math.max(0, g.bytes / g.max_bytes)) : undefined;
}

export type Remaining =
    | { kind: 'minutes'; minutes: number }
    | { kind: 'bytes'; bytes: number }
    | { kind: 'installing' }
    | { kind: 'none' };

/** Below this share of the data limit left the display names the amount instead of the time (G12). */
export const LOW_DATA_SHARE = 0.2;
const LOW_DATA_DIVISOR = 5; // 1 / LOW_DATA_SHARE, in integers so the boundary is exact

/**
 * What the display shows of a grant (G12, A15): the time left, unless less than 20 % of the data is left, then the
 * data left. A packages grant ends when installed, so it shows "installing" — except that the data warning applies too.
 */
export function remaining(g: Pick<InternetGrant, 'kind' | 'bytes' | 'max_bytes' | 'expires_at'>, now: number): Remaining {
    const left = g.max_bytes > 0 ? Math.max(0, g.max_bytes - g.bytes) : undefined;
    if (left !== undefined && left * LOW_DATA_DIVISOR < g.max_bytes) return { kind: 'bytes', bytes: left };
    if (g.kind === 'packages') return { kind: 'installing' };
    const minutes = minutesLeft(g.expires_at, now);
    return minutes === undefined ? { kind: 'none' } : { kind: 'minutes', minutes };
}

/** "24 min", "272 MB left", "installing"; empty for none. */
export function remainingText(r: Remaining): string {
    switch (r.kind) {
        case 'minutes':
            return `${r.minutes} min`;
        case 'bytes':
            return `${formatData(r.bytes)} left`;
        case 'installing':
            return 'installing';
        default:
            return '';
    }
}

/** Of several active grants the one that ends first (time left; a grant without a time sorts last). */
export function firstEnding<T extends Pick<InternetGrant, 'kind' | 'bytes' | 'max_bytes' | 'expires_at' | 'id'>>(
    grants: T[],
    now: number,
): T | undefined {
    const key = (g: T): number => {
        const r = remaining(g, now);
        if (r.kind === 'bytes') return -1; // about to run out of data: ends first
        const t = g.expires_at ? Date.parse(g.expires_at) : NaN;
        return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };
    return [...grants].sort((a, b) => key(a) - key(b) || a.id - b.id)[0];
}

/** What the grant is called in short: "Search", "1 site", "2 packages", "Full access". */
export function grantName(g: GrantLike & { packages?: PackageEntry[] }): string {
    switch (g.kind) {
        case 'search':
            return 'Search';
        case 'domains':
            return sitesText((g.domains ?? []).length);
        case 'packages':
            return packagesText(rootPackages(g.packages).length || (g.packages ?? []).length);
        default:
            return 'Full access';
    }
}

/** Header label: "Search · 24 min", "1 site · 272 MB left", "Packages · installing", "Full access · 18 min". */
export function grantLabel(g: Pick<InternetGrant, 'kind' | 'domains' | 'packages' | 'bytes' | 'max_bytes' | 'expires_at'>, now: number): string {
    const name = g.kind === 'packages' ? 'Packages' : grantName(g);
    const r = remainingText(remaining(g, now));
    return r ? `${name} · ${r}` : name;
}

export type IndicatorState = {
    /** off | limited | full: full when a full grant is among the active ones. */
    mode: 'off' | 'limited' | 'full';
    /** The text on the button; "Internet off" without a grant. */
    text: string;
    /** aria-label from the state (design `sec-x`). */
    aria: string;
    /** Number of active grants (badge only above 1). */
    count: number;
    /** "4 blocked" or empty. */
    blockedText: string;
};

/** The indicator of a chat from its active grants, the refusal counter and the time. */
export function indicatorState(active: InternetGrant[], blocked: InternetBlocked | undefined, now: number): IndicatorState {
    const grants = active.filter(isActive);
    const n = blocked?.count ?? 0;
    const blockedText = n ? blockedCountText(n) : '';
    if (!grants.length) {
        return {
            mode: 'off',
            text: 'Internet off',
            aria: n ? `Internet access: off, ${n} blocked` : 'Internet access: off',
            count: 0,
            blockedText,
        };
    }
    const first = firstEnding(grants, now) ?? grants[0];
    const text = grantLabel(first, now);
    const parts = grants.length > 1 ? grants.map((g) => grantName(g)).join(', ') : ariaWhat(first, now);
    const aria = `Internet access: ${parts}${grants.length > 1 ? ` (${ariaWhen(first, now)})` : ''}${n ? `, ${n} blocked` : ''}`;
    return { mode: grants.some((g) => g.kind === 'full') ? 'full' : 'limited', text, aria, count: grants.length, blockedText };
}

function ariaWhat(g: InternetGrant, now: number): string {
    const name = g.kind === 'search' ? 'search only' : g.kind === 'full' ? 'full access' : grantName(g).toLowerCase();
    return `${name}, ${ariaWhen(g, now)}`;
}

function ariaWhen(g: InternetGrant, now: number): string {
    const r = remaining(g, now);
    if (r.kind === 'minutes') return `${plural(r.minutes, 'minute', 'minutes')} left`;
    if (r.kind === 'bytes') return `${formatData(r.bytes)} left`;
    return r.kind === 'installing' ? 'installing' : 'active';
}

/** "4 blocked". */
export const blockedCountText = (n: number): string => `${n} blocked`;

/** Popover heading: "Internet access · 3 active". */
export const popoverTitle = (active: number): string => (active > 0 ? `Internet access · ${active} active` : 'Internet access');
export const POPOVER_EMPTY = 'No internet access in this chat. The agent asks when it needs it.';
export const NOTHING_BLOCKED = 'Nothing blocked.';
export const SEARCH_POPOVER_LINE = 'Web tools only. Commands stay offline.';
/** The popover line for a full grant (A6): no connection count. */
export const FULL_POPOVER_LINE = 'Any address, any program. Data is counted; connections are listed only where they go through the web proxy.';

/** "Blocked since 14:05 · 4". */
export function blockedHeading(b: Pick<InternetBlocked, 'count' | 'since'> | undefined): string {
    if (!b) return 'Blocked';
    const t = clock(b.since);
    return t ? `Blocked since ${t} · ${b.count}` : `Blocked · ${b.count}`;
}

/** "228 MB of 500 MB" for the progress bar's aria-valuetext and the caption. */
export function dataUsedText(g: Pick<InternetGrant, 'bytes' | 'max_bytes'>): string {
    return `${formatData(g.bytes)} of ${limitText(g.max_bytes)}`;
}

/** "27 min left · until 14:38" for a timed grant; empty for a packages grant. */
export function timeLeftLine(g: Pick<InternetGrant, 'kind' | 'expires_at'>, now: number): string {
    if (g.kind === 'packages') return '';
    const m = minutesLeft(g.expires_at, now);
    if (m === undefined) return '';
    return `${m} min left · until ${clock(g.expires_at)}`;
}

/** "at the latest until 14:38" for a packages grant (A13). */
export function latestUntilText(g: Pick<InternetGrant, 'expires_at'>): string {
    const t = clock(g.expires_at);
    return t ? `at the latest until ${t}` : '';
}

/**
 * Snackbar when a grant ended by itself (A10, A11): "Internet access ended: data limit reached (500 MB)",
 * "Internet access ended (1 site): time is up" when other grants were active too, "Internet access ended by the agent".
 * Undefined for the user's own switch-off (no notice needed).
 */
export function endedNotice(
    g: Pick<InternetGrant, 'kind' | 'domains' | 'packages' | 'max_bytes' | 'ended_reason'>,
    othersActive: number,
): string | undefined {
    if (g.ended_reason === 'user') return undefined;
    const which = othersActive > 0 ? ` (${grantName({ kind: g.kind, domains: g.domains, packages: g.packages }).toLowerCase()})` : '';
    switch (g.ended_reason) {
        case 'bytes':
            return `Internet access ended${which}: data limit reached (${limitText(g.max_bytes)})`;
        case 'installed':
            return `Internet access ended${which}: packages installed`;
        case 'time':
            return `Internet access ended${which}: time is up`;
        case 'agent':
            return `Internet access ended${which} by the agent`;
        default:
            return `Internet access ended${which}: error`;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------------------------------------------

/** Short reason of a refusal code (A7) as the tables show it; unknown codes fall back to the code in words. */
export function reasonText(code: string | undefined): string {
    switch (code) {
        case 'not_listed':
        case 'package_not_listed':
            return 'not in the list';
        case 'version_mismatch':
            return 'other version';
        case 'too_large':
            return 'too large for the sandbox';
        case 'https_only':
            return 'only https';
        case 'sni_mismatch':
            return 'name mismatch';
        case 'ip_literal':
            return 'address without a name';
        case 'search_only':
            return 'search only';
        case 'access_ended':
            return 'access ended';
        case 'internet_off':
            return 'internet off';
        case 'not_public':
            return 'not a public address';
        case 'port_not_allowed':
            return 'port not allowed';
        case 'upstream':
            return 'site not reachable';
        case 'unassigned':
            return 'not assigned to a chat';
        case 'cache_redirect':
            return 'redirect';
        case 'bad_request':
            return 'bad request';
        default: {
            const words = (code ?? '').replace(/_/g, ' ').trim();
            return words || 'refused';
        }
    }
}

/** The blocked row under a `bash` call: "Blocked: github.com is not in the allowed sites". */
export function blockedLine(c: Pick<Connection, 'host' | 'reason' | 'package' | 'denied'>, endedAt?: string, endedReason?: string): string {
    const eco = ecosystemOfHost(c.host);
    const pkg = c.package ? `${eco ?? 'pip'}:${c.package}` : '';
    switch (c.reason) {
        case 'not_listed':
            return `Blocked: ${c.host} is not in the allowed sites`;
        case 'package_not_listed':
            return `Blocked: ${pkg || c.host} is not in the allowed packages`;
        case 'version_mismatch':
            return `Blocked: ${pkg || c.host} is not the approved version`;
        case 'too_large':
            return `Blocked: ${pkg || c.host} is too large for the sandbox – use a notebook run`;
        case 'https_only':
            return `Blocked: ${c.host} – only https is allowed`;
        case 'sni_mismatch':
            return `Blocked: ${c.host} – the name in the connection does not match`;
        case 'ip_literal':
            return `Blocked: ${c.host} – addresses without a name are not allowed`;
        case 'search_only':
            return `Blocked: ${c.host} – commands stay offline with search only`;
        case 'access_ended': {
            const t = clock(endedAt);
            const why = endedReason ? ` (${endInfo(endedReason).long})` : '';
            return `Blocked: internet access ended${t ? ` at ${t}` : ''}${why}`;
        }
        case 'internet_off':
            return 'Blocked: internet access is off for this chat';
        default:
            return `Blocked: ${c.host} – ${reasonText(c.reason)}`;
    }
}

/** Summary of several refusals under one call: "3 blocked · github.com and 2 more". */
export function blockedGroupText(hosts: string[]): string {
    const unique = [...new Set(hosts)];
    const first = unique[0] ?? '';
    const more = hosts.length - 1;
    return `${hosts.length} blocked · ${more > 0 ? `${first} and ${more} more` : first}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Activity: access rows and connections
// ---------------------------------------------------------------------------------------------------------------

/** Via = the way the request came (A14): CLI, MCP, API; "UI" only for the user's own switch; "–" otherwise. */
export function viaText(via: string | undefined): string {
    switch (via) {
        case 'cli':
            return 'CLI';
        case 'mcp':
            return 'MCP';
        case 'api':
            return 'API';
        case 'user':
            return 'UI';
        default:
            return '–';
    }
}

/** "web tools" / "any address" / hosts / package names + dependencies: the list part of an access row. */
export function accessList(g: Pick<ActivityGrant, 'kind' | 'domains' | 'packages'>): string {
    switch (g.kind) {
        case 'search':
            return 'web tools';
        case 'domains':
            return (g.domains ?? []).join(', ');
        case 'packages': {
            const names = (g.packages ?? []).map((s) => parsePackage(s)?.name ?? s);
            return names.join(', ');
        }
        default:
            return 'any address';
    }
}

/** "{n} approvals · {x} GB · {n} blocked" (A16). */
export function accessSummaryText(approvals: number, bytes: number, blocked: number): string {
    return `${plural(approvals, 'approval', 'approvals')} · ${formatData(bytes)} · ${blocked} blocked`;
}

/** "31 connections · 2.85 GB · 4 blocked" for the connection table. */
export function connectionsSummaryText(s: ConnectionsSummary): string {
    return `${plural(s.count, 'connection', 'connections')} · ${formatData(s.bytes_down + s.bytes_up)} · ${s.blocked} blocked`;
}

/** The row for data a full grant moved that no listed connection accounts for. */
export const unlistedText = (u: Pick<UnlistedBytes, 'bytes'>): string => `Full access · ${formatData(u.bytes)} · not listed`;

/** From column (the origin of the connection). */
export function originText(origin: string | undefined): string {
    switch (origin) {
        case 'exec':
            return 'Commands';
        case 'pkg':
            return 'Packages';
        default:
            return 'Web tools';
    }
}

export type TargetInfo = {
    /** "web search", "pypi index", "npm registry", the host, or the package with its version. */
    name: string;
    /** Chip before the name for package rows: "pip" or "npm". */
    chip?: 'pip' | 'npm';
    /** Second line: "dependency of torch", "214 requests", the full URL of a plain http request. */
    detail?: string;
};

/** Target column (A12): never an internal host name; packages as chip + name + version. */
export function connectionTarget(c: Connection): TargetInfo {
    const eco = ecosystemOfHost(c.host);
    if (c.service === 'search') return { name: 'web search', detail: c.count > 1 ? `${c.count} requests` : undefined };
    if (c.service === 'index')
        return { name: eco === 'npm' ? 'npm registry' : 'pypi index', detail: c.count > 1 ? `${c.count} requests` : undefined };
    if (c.package) {
        const detail = c.parent ? `dependency of ${c.parent}` : c.path ? lastSegment(c.path) : undefined;
        return { name: c.version ? `${c.package} ${c.version}` : c.package, chip: eco, detail };
    }
    const detail = c.count > 1 ? `${c.count} requests` : c.port === 80 ? `http://${c.host}${c.path ?? ''}` : undefined;
    return { name: c.host, detail };
}

function lastSegment(path: string): string {
    const clean = path.split('?')[0];
    return clean.slice(clean.lastIndexOf('/') + 1);
}

/** Data column: "↓ 4.8 MB · ↑ 6 kB"; one direction only when the other is 0, "–" for nothing. */
export function connectionData(c: Pick<Connection, 'bytes_down' | 'bytes_up'>): string {
    const parts: string[] = [];
    if (c.bytes_down > 0) parts.push(`↓ ${formatData(c.bytes_down)}`);
    if (c.bytes_up > 0) parts.push(`↑ ${formatData(c.bytes_up)}`);
    return parts.length ? parts.join(' · ') : '–';
}

/** Result column: allowed, or blocked with the reason. */
export function connectionResult(c: Pick<Connection, 'denied' | 'reason'>): { blocked: boolean; word: 'allowed' | 'blocked'; reason: string } {
    const blocked = !!c.denied || !!c.reason;
    return { blocked, word: blocked ? 'blocked' : 'allowed', reason: blocked ? reasonText(c.reason) : '' };
}

export const NO_CONNECTIONS_TEXT = 'No internet connections in this period.';
export const NO_BLOCKED_TEXT = 'Nothing blocked.';

/** The "Show N more" text of a connection list: the rest of the filter beyond the rows shown. */
export function showMoreText(total: number, shown: number): string {
    const rest = Math.max(0, total - shown);
    return rest > 0 ? `Show ${rest} more` : '';
}

/** Chips of the connection table's Approval column: "Search", "2 packages", "1 site"; from the page's `grants` map. */
export function grantChip(b: GrantBrief | undefined): string {
    if (!b) return '';
    return b.kind === 'packages' ? packagesText((b.packages ?? []).length) : grantName({ kind: b.kind, domains: b.domains });
}

/** Whether a request is a refusal the chat should show under its `bash` call (A8): origin exec with a tool call. */
export const showsUnderCall = (c: Pick<Connection, 'origin' | 'tool_call_id' | 'denied' | 'reason'>): boolean =>
    c.origin === 'exec' && !!c.tool_call_id && (!!c.denied || !!c.reason);
