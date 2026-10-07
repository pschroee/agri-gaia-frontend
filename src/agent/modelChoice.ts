// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

// Decision logic of the model and thinking level pickers (input row and "New chat"): which levels a model
// allows, when the pickers are disabled and why, and how a refused model switch is handled.

import { AgentApiError } from './api';
import type { Chat, ContextTooLarge, Model } from './types';

/** pi's thinking levels in order; which of them a model offers, pi reports per model. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const EFFORT_LABEL: Record<string, string> = {
    off: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Very high',
    max: 'Maximum',
};

export const effortLabel = (level: string): string => EFFORT_LABEL[level] ?? level;

/** Display name of a model id; unknown ids show as they are. */
export function modelName(models: Pick<Model, 'id' | 'name'>[], id: string): string {
    return models.find((m) => m.id === id)?.name || id;
}

/** Thinking levels per model, as the gateway reported them for the user's chats (the model list carries none). */
export function levelsByModel(chats: Pick<Chat, 'model' | 'thinking_levels'>[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const c of chats) {
        if (c.thinking_levels?.length && !out[c.model]) out[c.model] = c.thinking_levels;
    }
    return out;
}

/**
 * Levels that may be chosen for a model: the open chat's own report when it uses that model, otherwise what other
 * chats reported. Empty while unknown, never pi's full list: the gateway refuses levels the model does not know.
 */
export function allowedLevels(
    model: string,
    chat?: Pick<Chat, 'model' | 'thinking_levels'>,
    known: Record<string, string[]> = {},
): string[] {
    if (chat?.model === model && chat.thinking_levels?.length) return chat.thinking_levels;
    return known[model] ?? [];
}

/** A choice needs at least two levels; a model that only reports "off" has nothing to choose. */
export const hasLevelChoice = (levels: string[]) => levels.length > 1;

export type PickerState = {
    modelDisabled: boolean;
    /** Why the model picker is disabled (tooltip). */
    modelHint?: string;
    effortDisabled: boolean;
    effortHint?: string;
    levels: string[];
    /** Model the chat switches to after the running compaction. */
    pending?: string;
};

export const RUNNING_HINT = 'Can be changed once the agent has finished its response.';

/**
 * State of the pickers in the input row. While the agent works (or a chat resumes) both are locked, because the
 * gateway answers 409; with a scheduled switch (pending_model) the model stays locked until the compaction ends.
 */
export function pickerState(
    chat: Pick<Chat, 'model' | 'running' | 'resuming' | 'starting' | 'thinking_levels' | 'pending_model'> | undefined,
    busy = false,
): PickerState {
    if (!chat) return { modelDisabled: true, effortDisabled: true, levels: [] };
    const levels = allowedLevels(chat.model, chat);
    const locked = chat.running || !!chat.resuming;
    const lockHint = chat.starting
        ? 'Can be changed once the sandbox of the chat is ready.'
        : chat.resuming
          ? 'Can be changed once the chat has resumed.'
          : RUNNING_HINT;
    const pending = chat.pending_model || undefined;
    let modelHint: string | undefined;
    if (pending) modelHint = 'The model switches after the running compaction.';
    else if (locked) modelHint = lockHint;
    let effortHint: string | undefined;
    if (locked) effortHint = lockHint;
    else if (levels.length === 0) effortHint = 'Thinking levels are known once the agent has started with this model.';
    else if (!hasLevelChoice(levels)) effortHint = 'This model has no thinking levels.';
    return {
        modelDisabled: busy || locked || !!pending,
        modelHint,
        effortDisabled: busy || locked || !hasLevelChoice(levels),
        effortHint,
        levels,
        pending,
    };
}

export type SwitchFailure =
    | { kind: 'too_large'; details: ContextTooLarge }
    | { kind: 'running'; message: string }
    | { kind: 'error'; message: string };

/** Classifies a failed model or level switch: context too large (offer compacting), agent working, other. */
export function switchFailure(e: unknown): SwitchFailure {
    if (e instanceof AgentApiError && e.status === 409) {
        const d = e.details as Partial<ContextTooLarge> | undefined;
        if (e.code === 'context_too_large' && d && typeof d.model === 'string')
            return {
                kind: 'too_large',
                details: { model: d.model, tokens: d.tokens ?? 0, window: d.window ?? 0, limit: d.limit ?? 0 },
            };
        return { kind: 'running', message: 'The agent is working right now. ' + RUNNING_HINT };
    }
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
}

const num = (n: number) => n.toLocaleString('en-US');

/** Explanation in the "context too large" prompt. */
export function tooLargeText(d: ContextTooLarge, name: string): string {
    return (
        `The conversation so far has ${num(d.tokens)} tokens. ${name} takes at most ${num(d.limit)} ` +
        `(context window ${num(d.window)}). Compact the history first? The chat then continues with ${name}.`
    );
}
