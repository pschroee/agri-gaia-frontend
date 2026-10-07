// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Colours of the agent prototype, derived from the platform theme (primary #0f5432, secondary #ba000d).
export const agentColors = {
    green: '#0f5432',
    greenTint: '#eef3f0',
    greenLine: '#c6d8ce',
    amber: '#ed6c02',
    amberTint: '#fdf3e8',
    amberLine: '#f0c9a0',
    amberText: '#8a4b06',
    red: '#ba000d',
    redTint: '#fdeceb',
    redLine: '#f0b4b0',
    ok: '#2e7d32',
    muted: 'rgba(0, 0, 0, 0.6)',
    panelBg: '#fafafa',
    /** Marks the read-only view of a subagent (left border, breadcrumb, read-only line; issue #48). */
    subagent: '#5e35b1',
    subagentTint: '#f3effa',
    /** The user's message bubble (design "Agent Chat Panel v2", issue #54). */
    userBubble: '#e3efe8',
    /** Outline of fields and buttons in the panel (MUI's outlined input border). */
    outline: 'rgba(0, 0, 0, 0.23)',
};

export const MONO = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** White block with a thin border, the basic container of the agent panel. */
export const blockSx = {
    bgcolor: '#fff',
    border: 1,
    borderColor: 'divider',
    borderRadius: 1,
} as const;

/** Fenced code block in an answer (Markdown, Mermaid source). */
export const codeBlockSx = {
    fontFamily: MONO,
    fontSize: 12,
    lineHeight: 1.6,
    bgcolor: '#fafafa',
    border: 1,
    borderColor: 'divider',
    borderRadius: 1,
    p: 1.25,
    m: 0,
    overflowX: 'auto',
    whiteSpace: 'pre',
} as const;

/** Height of the panel's chat selector and the square buttons next to it (design: 48 px; issue #54). */
export const CHAT_ROW_HEIGHT = 44;

/**
 * Square outlined icon button of the panel's chat row ("New chat" plus and the internet globe), as high as the chat
 * selector. Both use it, so they keep the same size and look.
 */
export const rowIconButtonSx = {
    flex: 'none',
    width: CHAT_ROW_HEIGHT,
    height: CHAT_ROW_HEIGHT,
    border: 1,
    borderColor: agentColors.outline,
    borderRadius: 1,
    p: 0,
} as const;
