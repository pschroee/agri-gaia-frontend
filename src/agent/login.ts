// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/** The agent gateway is served on the platform host under /agent/ (Traefik strips the prefix). */
export const AGENT_BASE = '/agent';

/** Where the gateway's own UI starts; also the fallback return target of a login. */
export const AGENT_HOME = `${AGENT_BASE}/`;

/** Longest return target the gateway accepts (bytes; the paths here are ASCII after encoding). */
const MAX_RETURN = 512;

/**
 * Return target for the visible login at the gateway: the platform page the user is on (path, query and
 * fragment), so the login ends there and not in the gateway's own UI. The gateway accepts only absolute
 * paths on its own host (API.md, *Return after login*); anything it would refuse, and the gateway's own
 * paths under /agent, fall back to /agent/ here already.
 */
export function loginReturnTarget(loc: { pathname: string; search?: string; hash?: string }): string {
    const target = `${loc.pathname}${loc.search ?? ''}${loc.hash ?? ''}`;
    const path = loc.pathname;
    if (!path.startsWith('/') || path.startsWith('//') || target.includes('\\')) return AGENT_HOME;
    if (path === AGENT_BASE || path.startsWith(`${AGENT_BASE}/`)) return AGENT_HOME;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000- \u007f]/.test(target) || target.length > MAX_RETURN) return AGENT_HOME;
    if (/%(2f|5c|2e|7f|[01][0-9a-f])/i.test(path)) return AGENT_HOME;
    if (path.split('/').some((seg) => seg === '.' || seg === '..')) return AGENT_HOME;
    return target;
}

/** Visible login at the gateway that returns to `returnTo` (see loginReturnTarget). */
export const interactiveLoginUrl = (returnTo: string = AGENT_HOME) =>
    `${AGENT_BASE}/oidc/login?return=${encodeURIComponent(returnTo)}`;
