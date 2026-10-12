// SPDX-FileCopyrightText: 2026 Philipp Schröer
//
// SPDX-License-Identifier: MIT

import type { Step, StepStatus } from './transcript';

/** Directory in which the gateway keeps the agent's skills (issue #73). */
export const SKILLS_ROOT = '/opt/agw/skills/';

/** A `read` of a file inside a skill: `load` for its SKILL.md, `file` for any other file of the skill. */
export type SkillRead = { kind: 'load' | 'file'; skill: string; file?: string; path: string };

/** `/opt/agw/skills/<name>/<rest>`; the name starts with a letter or digit, no normalisation of the path. */
const SKILL_PATH = /^\/opt\/agw\/skills\/([A-Za-z0-9][A-Za-z0-9._-]*)\/(.+)$/;

/**
 * Whether a step is a `read` of a skill file (issue #73). Only the tool `read` counts, and only its real arguments:
 * `path`, or `file_path` in its place. `bash`, `grep`, `ls` and the like stay ordinary steps.
 */
export function skillRead(step: Pick<Step, 'name' | 'args'>): SkillRead | undefined {
    if (step.name !== 'read') return undefined;
    const args = step.args;
    if (!args || typeof args !== 'object') return undefined;
    const a = args as Record<string, unknown>;
    const path = typeof a.path === 'string' ? a.path : a.file_path;
    if (typeof path !== 'string') return undefined;
    const m = SKILL_PATH.exec(path);
    if (!m) return undefined;
    const rest = m[2];
    if (rest.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return undefined;
    if (rest === 'SKILL.md') return { kind: 'load', skill: m[1], path };
    return { kind: 'file', skill: m[1], file: rest, path };
}

/** Label and text of a skill row: "Skill loaded" / "internet", or "Skill web-research" / "read references/api.md". */
export function skillLabel(r: SkillRead): { label: string; text: string } {
    if (r.kind === 'load') return { label: 'Skill loaded', text: r.skill };
    return { label: `Skill ${r.skill}`, text: `read ${r.file}` };
}

/** A row of the step list: one step, or a run of consecutive skill loads shown as one group. */
export type StepGroup =
    | { type: 'step'; step: Step }
    | { type: 'skills'; key: string; steps: Step[]; skills: string[] };

/**
 * Groups runs of at least two consecutive `load` steps (issue #73). Unit reads of a skill, and everything else, break
 * a run and stay single steps; a skill that is loaded twice appears once in `skills`.
 */
export function groupSkillLoads(steps: Step[]): StepGroup[] {
    const groups: StepGroup[] = [];
    let run: Step[] = [];
    const flush = () => {
        if (run.length >= 2) {
            const skills: string[] = [];
            for (const s of run) {
                const name = skillRead(s)?.skill;
                if (name && !skills.includes(name)) skills.push(name);
            }
            groups.push({ type: 'skills', key: `skills:${run[0].id}`, steps: run, skills });
        } else {
            for (const s of run) groups.push({ type: 'step', step: s });
        }
        run = [];
    };
    for (const s of steps) {
        if (skillRead(s)?.kind === 'load') {
            run.push(s);
        } else {
            flush();
            groups.push({ type: 'step', step: s });
        }
    }
    flush();
    return groups;
}

/** Status of a group: running if one runs, else the first of waiting, blocked, error, aborted, stopped, else done. */
export function groupStatus(steps: Step[]): StepStatus {
    if (steps.some((s) => s.status === 'running')) return 'running';
    for (const status of ['waiting', 'blocked', 'error', 'aborted', 'stopped'] as const) {
        if (steps.some((s) => s.status === status)) return status;
    }
    return 'done';
}
