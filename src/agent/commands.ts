// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

/** Slash commands in the chat input: filtering, the suggestion list's key handling and the texts of the results. */
import { AgentApiError } from './api';
import { effortLabel } from './modelChoice';
import type { Chat, Command, CommandOption } from './types';

/** Commands that only work in pi's terminal UI (output via notify/widget) and show nothing here. */
const TERMINAL_ONLY = new Set(['todos']);

/** Built-in commands of the gateway; they create no user message. */
export const BUILTIN = ['compact', 'autocompact', 'rename', 'model', 'effort'] as const;

/** Search text while only "/name" without a space has been typed; otherwise undefined (no command list). */
export function slashQuery(text: string): string | undefined {
    const m = /^\/(\S*)$/.exec(text);
    return m ? m[1].toLowerCase() : undefined;
}

/** Command and started argument while "/name arg" with at most one argument word is typed. */
export function slashArg(text: string): { name: string; query: string } | undefined {
    const m = /^\/(\S+)\s+(\S*)$/.exec(text);
    return m ? { name: m[1].toLowerCase(), query: m[2] } : undefined;
}

/**
 * Filters and ranks commands: prefix matches in the name first, then partial matches in the name, then (from three
 * characters) matches in the description. Within each group the gateway's order stays (built-in ones first).
 */
export function filterCommands(all: Command[], query: string): Command[] {
    const list = all.filter((c) => !TERMINAL_ONLY.has(c.name));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const prefix: Command[] = [];
    const infix: Command[] = [];
    const desc: Command[] = [];
    for (const c of list) {
        const name = c.name.toLowerCase();
        if (name.startsWith(q)) prefix.push(c);
        else if (name.includes(q)) infix.push(c);
        else if (q.length >= 3 && c.description?.toLowerCase().includes(q)) desc.push(c);
    }
    return [...prefix, ...infix, ...desc];
}

/** Filters arguments of /model and /effort: prefix matches in the value, then partial matches in value or label. */
export function filterOptions(options: CommandOption[], query: string): CommandOption[] {
    const q = query.toLowerCase();
    if (!q) return options;
    const prefix = options.filter((o) => o.value.toLowerCase().startsWith(q));
    const rest = options.filter(
        (o) => !prefix.includes(o) && (o.value.toLowerCase().includes(q) || !!o.label?.toLowerCase().includes(q)),
    );
    return [...prefix, ...rest];
}

/** An entry of the suggestion list: a command, or a value for the argument of one (/model, /effort). */
export type SlashItem = { command: Command; option?: CommandOption };

/**
 * Entries for the list: for "/name" the commands, for "/name arg" the values of that command. Once the argument
 * matches a value exactly, nothing is left to suggest, so Enter sends.
 */
export function slashItems(commands: Command[], text: string): { items: SlashItem[]; argsOf?: Command } {
    const query = slashQuery(text);
    if (query !== undefined) return { items: filterCommands(commands, query).map((command) => ({ command })) };
    const arg = slashArg(text);
    const command = arg && commands.find((c) => c.name.toLowerCase() === arg.name && c.options?.length);
    if (!arg || !command?.options) return { items: [] };
    if (command.options.some((o) => o.value === arg.query)) return { items: [] };
    return {
        items: filterOptions(command.options, arg.query).map((option) => ({ command, option })),
        argsOf: command,
    };
}

/** Input text after picking an entry: "/name " for a command, "/name value" for a value. */
export const pickedText = (item: SlashItem): string =>
    item.option ? `/${item.command.name} ${item.option.value}` : `/${item.command.name} `;

/** Stable key of an entry (also the DOM id suffix of the option). */
export const itemKey = (item: SlashItem): string =>
    item.option ? `${item.command.name} ${item.option.value}` : item.command.name;

/**
 * Puts the chat's current values into the suggestions of /model and /effort; the command list is loaded less often
 * than the chat. /effort offers the levels pi reports for the chat's model.
 */
export function withLiveOptions(
    commands: Command[],
    chat?: Pick<Chat, 'model' | 'thinking_level' | 'thinking_levels'>,
): Command[] {
    if (!chat) return commands;
    return commands.map((c) => {
        if (c.name === 'model' && c.options) {
            return { ...c, options: c.options.map((o) => ({ ...o, current: o.value === chat.model })) };
        }
        if (c.name === 'effort') {
            const levels = chat.thinking_levels?.length ? chat.thinking_levels : c.options?.map((o) => o.value);
            if (!levels) return c;
            return {
                ...c,
                options: levels.map((l) => ({ value: l, label: effortLabel(l), current: l === chat.thinking_level })),
            };
        }
        return c;
    });
}

// ---- key handling of the suggestion list (pure, unit-tested) ----

/** State of the list: the highlighted entry belongs to the text it was chosen for; Esc hides the list for a text. */
export type MenuState = { active: number; activeFor: string; dismissed?: string };

export const initialMenu: MenuState = { active: 0, activeFor: '' };

/** The list is open when there is something to suggest and Esc has not hidden it for exactly this text. */
export const menuOpen = (s: MenuState, text: string, count: number): boolean => count > 0 && s.dismissed !== text;

/** Highlighted entry: reset to the first one whenever the text changes, clamped to the list. */
export const activeIndex = (s: MenuState, text: string, count: number): number =>
    s.activeFor === text ? Math.min(Math.max(0, s.active), Math.max(0, count - 1)) : 0;

export type MenuKey = { key: string; shiftKey?: boolean; isComposing?: boolean };

/**
 * Result of a key in the input field: `handled` means the list consumed it (prevent the default, do not send);
 * `pick` is the index of the entry to take over.
 */
export type MenuKeyResult = { state: MenuState; handled: boolean; pick?: number };

/** Arrow keys move (wrapping), Enter and Tab take the highlighted entry, Esc closes; everything else types. */
export function menuKey(s: MenuState, text: string, count: number, k: MenuKey): MenuKeyResult {
    if (!menuOpen(s, text, count) || k.isComposing) return { state: s, handled: false };
    const idx = activeIndex(s, text, count);
    switch (k.key) {
        case 'ArrowDown':
            return { state: { ...s, active: (idx + 1) % count, activeFor: text }, handled: true };
        case 'ArrowUp':
            return { state: { ...s, active: (idx - 1 + count) % count, activeFor: text }, handled: true };
        case 'Enter':
        case 'Tab':
            if (k.shiftKey) return { state: s, handled: false };
            return { state: { ...s, active: 0, activeFor: '' }, handled: true, pick: idx };
        case 'Escape':
            return { state: { ...s, dismissed: text }, handled: true };
        default:
            return { state: s, handled: false };
    }
}

// ---- running a command ----

/** An input that goes to POST …/commands instead of being sent as a message ("/x…", not "/" or "//"). */
export const isSlashCommand = (text: string): boolean => /^\/[\p{L}\p{N}]/u.test(text.trim());

const nameOf = (text: string) => /^\/(\S+)/.exec(text.trim())?.[1].toLowerCase() ?? '';
const argOf = (text: string) => text.trim().replace(/^\/\S+\s*/, '');

/** Built-in command of the gateway (/compact, /autocompact, /rename, /model, /effort). */
export const isBuiltinCommand = (text: string): boolean =>
    (BUILTIN as readonly string[]).includes(nameOf(text)) && isSlashCommand(text);

/** Switch value of "/autocompact on|off" (like the gateway: on/true, off/false); otherwise undefined. */
export function autoCompactSwitch(text: string): boolean | undefined {
    if (nameOf(text) !== 'autocompact') return undefined;
    const v = argOf(text).toLowerCase();
    if (v === 'on' || v === 'true') return true;
    if (v === 'off' || v === 'false') return false;
    return undefined;
}

/** New name from "/rename Name" (whitespace collapsed); undefined without a name. */
export function renameTitle(text: string): string | undefined {
    if (nameOf(text) !== 'rename') return undefined;
    const t = argOf(text).split(/\s+/).join(' ');
    return t || undefined;
}

/** A built-in command that cannot work as typed; checked before calling the gateway. */
export function commandProblem(text: string): string | undefined {
    switch (nameOf(text)) {
        case 'rename':
            return renameTitle(text) ? undefined : '/rename needs a name, e.g. "/rename Night images".';
        case 'autocompact':
            return autoCompactSwitch(text) !== undefined ? undefined : '/autocompact expects on or off.';
        case 'model':
            return argOf(text) ? undefined : '/model needs a model, e.g. "/model deepseek/deepseek-pro".';
        case 'effort':
            return argOf(text) ? undefined : '/effort needs a level, e.g. "/effort high".';
        default:
            return undefined;
    }
}

/** What a built-in command did, as shown in the transcript. */
export function commandResultText(text: string, modelName: (id: string) => string = (id) => id): string {
    const arg = argOf(text);
    switch (nameOf(text)) {
        case 'compact':
            return arg ? `Compacting the context, focus: ${arg}` : 'Compacting the context';
        case 'autocompact':
            return `Automatic compaction ${autoCompactSwitch(text) ? 'on' : 'off'}`;
        case 'rename':
            return `Chat renamed to "${renameTitle(text) ?? ''}"`;
        case 'model':
            return `Model switched to ${modelName(arg)}`;
        case 'effort':
            return `Thinking level set to ${effortLabel(arg)}`;
        default:
            return `Ran ${text.trim()}`;
    }
}

/** Why a command failed, in words; a 409 means the agent is working (for /compact, /model and /effort). */
export function commandErrorText(text: string, e: unknown): string {
    const name = nameOf(text);
    if (e instanceof AgentApiError && e.status === 409) {
        if (name === 'compact')
            return 'The agent is working right now; /compact works once the current response has finished.';
        if (name === 'model' || name === 'effort')
            return `The agent is working right now; /${name} works once the current response has finished.`;
    }
    const msg = e instanceof Error ? e.message : String(e);
    return `/${name} failed: ${msg}`;
}

/** Note of a command in the transcript; exists only in this view (not stored by the gateway). */
export type CommandNotice = {
    key: string;
    /** The command as typed. */
    command: string;
    text: string;
    tone: 'done' | 'error';
    /** Last stored message when the command ran; the note sits before the first message after it. */
    afterSeq: number;
};

/** Index of the transcript item the note goes before (the first one stored after it ran); -1: at the end. */
export function noticeAnchor(items: { seq?: number }[], afterSeq: number): number {
    return items.findIndex((it) => it.seq !== undefined && it.seq > afterSeq);
}

export const SOURCE_LABEL: Record<string, string> = {
    builtin: 'built-in',
    extension: 'extension',
    prompt: 'template',
    skill: 'skill',
};
