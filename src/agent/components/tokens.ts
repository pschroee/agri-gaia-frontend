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
    panelBg: '#fafafa',
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
