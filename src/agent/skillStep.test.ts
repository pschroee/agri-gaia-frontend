// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import { groupSkillLoads, groupStatus, skillLabel, skillRead } from './skillStep';
import type { Step, StepStatus } from './transcript';

const step = (id: string, name: string, args: unknown, status: StepStatus = 'done'): Step =>
    ({ id, tool: name, name, args, status }) as Step;

const load = (id: string, skill: string, status?: StepStatus) =>
    step(id, 'read', { path: `/opt/agw/skills/${skill}/SKILL.md` }, status);

describe('skillRead', () => {
    it('recognises a SKILL.md load', () => {
        const r = skillRead(step('1', 'read', { path: '/opt/agw/skills/internet/SKILL.md' }));
        expect(r).toEqual({ kind: 'load', skill: 'internet', path: '/opt/agw/skills/internet/SKILL.md' });
        expect(skillLabel(r!)).toEqual({ label: 'Skill loaded', text: 'internet' });
    });

    it('accepts names with hyphens and dots', () => {
        expect(skillRead(load('1', 'web-research'))?.skill).toBe('web-research');
        expect(skillRead(load('2', 'writing-typst'))?.skill).toBe('writing-typst');
        expect(skillRead(load('3', 'model-card.v2'))?.skill).toBe('model-card.v2');
    });

    it('treats another file of a skill as a file read, also in a subfolder', () => {
        const r = skillRead(step('1', 'read', { path: '/opt/agw/skills/web-research/references/api.md' }));
        expect(r).toMatchObject({ kind: 'file', skill: 'web-research', file: 'references/api.md' });
        expect(skillLabel(r!)).toEqual({ label: 'Skill web-research', text: 'read references/api.md' });
    });

    it('reads file_path in place of path', () => {
        expect(skillRead(step('1', 'read', { file_path: '/opt/agw/skills/internet/SKILL.md' }))?.kind).toBe('load');
    });

    it('ignores arguments that are not an object', () => {
        expect(skillRead(step('1', 'read', 'SKILL'))).toBeUndefined();
        expect(skillRead(step('1', 'read', undefined))).toBeUndefined();
        expect(skillRead(step('1', 'read', null))).toBeUndefined();
    });

    it('matches only the read tool', () => {
        const path = '/opt/agw/skills/x/SKILL.md';
        expect(skillRead(step('1', 'bash', { command: `cat ${path}` }))).toBeUndefined();
        expect(skillRead(step('2', 'grep', { path: '/opt/agw/skills/x' }))).toBeUndefined();
        expect(skillRead(step('3', 'ls', { path: '/opt/agw/skills/x' }))).toBeUndefined();
        expect(skillRead(step('4', 'write', { path }))).toBeUndefined();
    });

    it('rejects other prefixes, names and unsafe paths', () => {
        const bad = [
            '/opt/agw/skillsX/x/SKILL.md',
            '/opt/agw/other/x/SKILL.md',
            '/workspace/SKILL.md',
            '/opt/agw/skills/SKILL.md',
            '/opt/agw/skills/x/../SKILL.md',
            '/opt/agw/skills/x/./SKILL.md',
            '/opt/agw/skills/x//SKILL.md',
            '/opt/agw/skills/x/',
        ];
        for (const path of bad) expect(skillRead(step('1', 'read', { path }))).toBeUndefined();
    });

    it('does not count skill.md in lower case as the load', () => {
        expect(skillRead(step('1', 'read', { path: '/opt/agw/skills/x/skill.md' }))?.kind).toBe('file');
    });
});

describe('groupSkillLoads', () => {
    it('groups three loads in a row into one group with three names', () => {
        const groups = groupSkillLoads([load('a', 'internet'), load('b', 'web-research'), load('c', 'writing-typst')]);
        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({
            type: 'skills',
            key: 'skills:a',
            skills: ['internet', 'web-research', 'writing-typst'],
        });
    });

    it('keeps a load, a bash call and a load as single steps', () => {
        const groups = groupSkillLoads([
            load('a', 'internet'),
            step('b', 'bash', { command: 'cat /opt/agw/skills/x/SKILL.md' }),
            load('c', 'web-research'),
        ]);
        expect(groups.map((g) => g.type)).toEqual(['step', 'step', 'step']);
    });

    it('leaves a single load as a step', () => {
        const groups = groupSkillLoads([load('a', 'internet')]);
        expect(groups).toEqual([{ type: 'step', step: load('a', 'internet') }]);
    });

    it('breaks the run at a file read of a skill', () => {
        const groups = groupSkillLoads([
            load('a', 'internet'),
            load('b', 'web-research'),
            step('c', 'read', { path: '/opt/agw/skills/web-research/references/api.md' }),
            load('d', 'writing-typst'),
            load('e', 'model-card'),
        ]);
        expect(groups.map((g) => g.type)).toEqual(['skills', 'step', 'skills']);
    });

    it('lists a repeated skill once', () => {
        const groups = groupSkillLoads([load('a', 'internet'), load('b', 'internet'), load('c', 'web-research')]);
        expect(groups[0]).toMatchObject({ type: 'skills', skills: ['internet', 'web-research'] });
    });
});

describe('groupStatus', () => {
    it('running wins over everything', () => {
        expect(groupStatus([load('a', 'x', 'error'), load('b', 'y', 'running')])).toBe('running');
    });

    it('waiting comes before error', () => {
        expect(groupStatus([load('a', 'x', 'error'), load('b', 'y', 'waiting')])).toBe('waiting');
    });

    it('is done when all are done', () => {
        expect(groupStatus([load('a', 'x', 'done'), load('b', 'y', 'done')])).toBe('done');
    });
});
