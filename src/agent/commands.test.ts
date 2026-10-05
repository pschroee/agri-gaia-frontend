// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { AgentApiError } from './api';
import {
    activeIndex,
    autoCompactSwitch,
    commandErrorText,
    commandProblem,
    commandResultText,
    filterCommands,
    filterOptions,
    initialMenu,
    isBuiltinCommand,
    isSlashCommand,
    menuKey,
    menuOpen,
    noticeAnchor,
    pickedText,
    renameTitle,
    slashArg,
    slashItems,
    slashQuery,
    withLiveOptions,
} from './commands';
import type { MenuState } from './commands';
import type { Command } from './types';

const cmds: Command[] = [
    { name: 'compact', description: 'Summarize the context now', source: 'builtin', args: '[instructions]' },
    { name: 'autocompact', description: 'Turn automatic compaction on or off', source: 'builtin', args: 'on|off' },
    { name: 'rename', description: 'Rename the chat', source: 'builtin', args: '<name>' },
    {
        name: 'model',
        description: 'Switch the model',
        source: 'builtin',
        args: '<provider/model>',
        options: [
            { value: 'deepseek/deepseek-flash', label: 'DeepSeek V4.1 Flash · 1M tokens', current: true },
            { value: 'deepseek/deepseek-pro', label: 'DeepSeek V4.1 Pro · 1M tokens' },
            { value: 'local/qwen-small', label: 'Qwen3 8B (local) · 33K tokens' },
        ],
    },
    {
        name: 'effort',
        description: "Set the model's thinking level",
        source: 'builtin',
        args: '<level>',
        options: [{ value: 'off' }, { value: 'low' }, { value: 'high' }],
    },
    { name: 'skill:yolo-train', description: 'Train a YOLO model on a platform dataset', source: 'skill' },
    { name: 'commit', description: 'Prepare a git commit', source: 'prompt' },
    { name: 'todos', description: 'Show the todo list', source: 'extension' },
];
const names = (l: { name: string }[]) => l.map((c) => c.name);

describe('slashQuery and slashArg', () => {
    it.each([
        ['/', ''],
        ['/co', 'co'],
        ['/Skill:Y', 'skill:y'],
    ])('%j → %j', (text, q) => expect(slashQuery(text)).toBe(q));
    it.each(['', 'hello /co', ' /co', '/compact now', '/compact\n'])('no command list for %j', (text) =>
        expect(slashQuery(text)).toBeUndefined(),
    );
    it('reads the started argument', () => {
        expect(slashArg('/model deep')).toEqual({ name: 'model', query: 'deep' });
        expect(slashArg('/Effort ')).toEqual({ name: 'effort', query: '' });
        expect(slashArg('/compact focus on code')).toBeUndefined();
    });
});

describe('filterCommands', () => {
    it('lists everything for "/" except commands that only work in the terminal', () => {
        expect(names(filterCommands(cmds, ''))).toEqual([
            'compact',
            'autocompact',
            'rename',
            'model',
            'effort',
            'skill:yolo-train',
            'commit',
        ]);
        expect(names(filterCommands(cmds, 'todo'))).toEqual([]);
    });
    it('ranks prefix matches before partial matches', () => {
        expect(names(filterCommands(cmds, 'comp'))).toEqual(['compact', 'autocompact']);
        expect(names(filterCommands(cmds, 'co'))).toEqual(['compact', 'commit', 'autocompact']);
    });
    it('searches the description from three characters, after the name matches', () => {
        expect(names(filterCommands(cmds, 'yolo'))).toEqual(['skill:yolo-train']);
        expect(names(filterCommands(cmds, 'git'))).toEqual(['commit']);
        expect(names(filterCommands(cmds, 'mo'))).toEqual(['model']);
        // "mod" matches the name of /model, then the descriptions of /effort and /skill:yolo-train ("model")
        expect(names(filterCommands(cmds, 'mod'))).toEqual(['model', 'effort', 'skill:yolo-train']);
    });
    it('ignores case', () => expect(names(filterCommands(cmds, 'SKILL'))).toEqual(['skill:yolo-train']));
});

describe('filterOptions and slashItems', () => {
    const model = cmds[3].options ?? [];
    it('ranks value prefixes before matches in value or label', () => {
        expect(filterOptions(model, 'loc').map((o) => o.value)).toEqual(['local/qwen-small']);
        expect(filterOptions(model, 'pro').map((o) => o.value)).toEqual(['deepseek/deepseek-pro']);
        expect(filterOptions(model, 'qwen3').map((o) => o.value)).toEqual(['local/qwen-small']);
    });
    it('suggests commands for "/x" and values for "/model x"', () => {
        expect(slashItems(cmds, '/ren').items.map((i) => i.command.name)).toEqual(['rename']);
        const v = slashItems(cmds, '/model deepseek');
        expect(v.argsOf?.name).toBe('model');
        expect(v.items.map((i) => i.option?.value)).toEqual(['deepseek/deepseek-flash', 'deepseek/deepseek-pro']);
    });
    it('has nothing to suggest once the value is complete, or for commands without values', () => {
        expect(slashItems(cmds, '/effort high').items).toEqual([]);
        expect(slashItems(cmds, '/rename x').items).toEqual([]);
        expect(slashItems(cmds, 'hello').items).toEqual([]);
    });
    it('puts the picked entry into the input', () => {
        expect(pickedText({ command: cmds[2] })).toBe('/rename ');
        expect(pickedText({ command: cmds[4], option: { value: 'low' } })).toBe('/effort low');
    });
});

describe('withLiveOptions', () => {
    it('marks the chat model and offers the levels pi reports, with labels', () => {
        const l = withLiveOptions(cmds, {
            model: 'deepseek/deepseek-pro',
            thinking_level: 'xhigh',
            thinking_levels: ['off', 'high', 'xhigh'],
        });
        const model = l.find((c) => c.name === 'model');
        const effort = l.find((c) => c.name === 'effort');
        expect(model?.options?.filter((o) => o.current).map((o) => o.value)).toEqual(['deepseek/deepseek-pro']);
        expect(effort?.options).toEqual([
            { value: 'off', label: 'Off', current: false },
            { value: 'high', label: 'High', current: false },
            { value: 'xhigh', label: 'Very high', current: true },
        ]);
    });
    it('keeps the gateway levels while pi has not reported any', () => {
        const effort = withLiveOptions(cmds, { model: 'x', thinking_level: 'low' }).find((c) => c.name === 'effort');
        expect(effort?.options?.map((o) => `${o.value}:${o.current}`)).toEqual(['off:false', 'low:true', 'high:false']);
    });
});

describe('menuKey: keyboard state machine', () => {
    const text = '/';
    const n = 4;
    const press = (s: MenuState, key: string, extra: Partial<{ shiftKey: boolean; isComposing: boolean }> = {}) =>
        menuKey(s, text, n, { key, ...extra });

    it('opens with entries and starts on the first one', () => {
        expect(menuOpen(initialMenu, text, n)).toBe(true);
        expect(menuOpen(initialMenu, text, 0)).toBe(false);
        expect(activeIndex(initialMenu, text, n)).toBe(0);
    });
    it('moves with the arrow keys and wraps around', () => {
        let s = press(initialMenu, 'ArrowDown').state;
        expect(activeIndex(s, text, n)).toBe(1);
        s = press(s, 'ArrowUp').state;
        s = press(s, 'ArrowUp').state;
        expect(activeIndex(s, text, n)).toBe(3);
        s = press(s, 'ArrowDown').state;
        expect(activeIndex(s, text, n)).toBe(0);
    });
    it('picks the highlighted entry with Enter or Tab, not with Shift', () => {
        const s = press(press(initialMenu, 'ArrowDown').state, 'ArrowDown').state;
        expect(press(s, 'Enter')).toMatchObject({ handled: true, pick: 2 });
        expect(press(s, 'Tab')).toMatchObject({ handled: true, pick: 2 });
        expect(press(s, 'Enter', { shiftKey: true })).toMatchObject({ handled: false });
        expect(press(s, 'Enter', { shiftKey: true }).pick).toBeUndefined();
    });
    it('closes with Esc for this text and opens again once the text changes', () => {
        const r = press(initialMenu, 'Escape');
        expect(r.handled).toBe(true);
        expect(menuOpen(r.state, text, n)).toBe(false);
        // closed: keys go to the input again (Enter sends)
        expect(menuKey(r.state, text, n, { key: 'Enter' }).handled).toBe(false);
        expect(menuOpen(r.state, '/c', n)).toBe(true);
    });
    it('leaves typing, composing and other keys to the input', () => {
        expect(press(initialMenu, 'c').handled).toBe(false);
        expect(press(initialMenu, 'Enter', { isComposing: true }).handled).toBe(false);
        expect(menuKey(initialMenu, 'hello', 0, { key: 'ArrowDown' }).handled).toBe(false);
    });
    it('resets the highlight when the text changes and clamps it to a shorter list', () => {
        const s = press(press(initialMenu, 'ArrowDown').state, 'ArrowDown').state;
        expect(activeIndex(s, '/c', n)).toBe(0);
        expect(activeIndex(s, text, 2)).toBe(1);
    });
});

describe('running commands', () => {
    it.each([
        ['/compact', true],
        ['  /skill:yolo-train data', true],
        ['/', false],
        ['path /workspace', false],
        ['//comment', false],
    ])('isSlashCommand(%j) → %s', (text, yes) => expect(isSlashCommand(text)).toBe(yes));

    it('tells built-in commands from pi commands', () => {
        expect(isBuiltinCommand('/compact focus on code')).toBe(true);
        expect(isBuiltinCommand('/Rename x')).toBe(true);
        expect(isBuiltinCommand('/compacted')).toBe(false);
        expect(isBuiltinCommand('/skill:yolo-train')).toBe(false);
    });
    it('reads /autocompact and /rename like the gateway', () => {
        expect(autoCompactSwitch('/autocompact on')).toBe(true);
        expect(autoCompactSwitch('/autocompact FALSE')).toBe(false);
        expect(autoCompactSwitch('/autocompact maybe')).toBeUndefined();
        expect(renameTitle('/rename   Night  images ')).toBe('Night images');
        expect(renameTitle('/rename ')).toBeUndefined();
    });
    it('catches built-in commands that cannot work as typed', () => {
        expect(commandProblem('/rename')).toMatch(/needs a name/);
        expect(commandProblem('/autocompact')).toMatch(/on or off/);
        expect(commandProblem('/model ')).toMatch(/needs a model/);
        expect(commandProblem('/effort')).toMatch(/needs a level/);
        expect(commandProblem('/compact')).toBeUndefined();
        expect(commandProblem('/rename Night images')).toBeUndefined();
    });
    it('describes the result', () => {
        expect(commandResultText('/compact')).toBe('Compacting the context');
        expect(commandResultText('/compact keep the training runs')).toBe(
            'Compacting the context, focus: keep the training runs',
        );
        expect(commandResultText('/autocompact off')).toBe('Automatic compaction off');
        expect(commandResultText('/rename Night images')).toBe('Chat renamed to "Night images"');
        expect(commandResultText('/model deepseek/deepseek-pro', () => 'DeepSeek V4.1 Pro')).toBe(
            'Model switched to DeepSeek V4.1 Pro',
        );
        expect(commandResultText('/effort xhigh')).toBe('Thinking level set to Very high');
    });
    it('explains a 409 while the agent works', () => {
        const busy = new AgentApiError(409, 'The agent is working; /compact only works afterwards.');
        expect(commandErrorText('/compact', busy)).toBe(
            'The agent is working right now; /compact works once the current response has finished.',
        );
        expect(commandErrorText('/effort low', busy)).toMatch(/\/effort works once/);
        expect(commandErrorText('/rename x', new AgentApiError(404, 'chat not found'))).toBe(
            '/rename failed: chat not found',
        );
    });
    it('anchors a note before the first message stored after it', () => {
        const items = [{ seq: 1 }, { seq: 2 }, {}, { seq: 5 }];
        expect(noticeAnchor(items, 2)).toBe(3);
        expect(noticeAnchor(items, 0)).toBe(0);
        expect(noticeAnchor(items, 5)).toBe(-1);
    });
});
