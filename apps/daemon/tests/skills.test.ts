// @ts-nocheck
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listSkills } from '../src/skills.js';

let skillsDir;

async function writeSkill(name, yamlFrontmatter, body = 'Do the thing.') {
  const dir = path.join(skillsDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\n${yamlFrontmatter}\n---\n\n${body}`, 'utf8');
}

beforeAll(async () => {
  skillsDir = await mkdtemp(path.join(tmpdir(), 'od-skills-test-'));

  await writeSkill('no-bb', 'name: no-bb\ndescription: plain skill');

  await writeSkill('bb-never', `name: bb-never\ndescription: self-contained\nod:\n  clade_brain:\n    injection: never`);

  await writeSkill('bb-conditional', `name: bb-conditional\ndescription: conditional injection\nod:\n  clade_brain:\n    injection: conditional`);

  await writeSkill('bb-unknown', `name: bb-unknown\ndescription: unknown injection value\nod:\n  clade_brain:\n    injection: maybe`);

  await writeSkill('bb-dir', `name: bb-dir\ndescription: manages direction\nod:\n  clade_brain:\n    manages_direction: true`);

  await writeSkill('bb-no-dir', `name: bb-no-dir\ndescription: does not manage direction\nod:\n  clade_brain:\n    manages_direction: false`);
});

afterAll(async () => {
  if (skillsDir) await rm(skillsDir, { recursive: true, force: true });
});

describe('listSkills — clade_brain frontmatter', () => {
  it('defaults cladeBrainInjection to auto when field is absent', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'no-bb');
    expect(s.cladeBrainInjection).toBe('auto');
  });

  it('parses injection: never', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'bb-never');
    expect(s.cladeBrainInjection).toBe('never');
  });

  it('parses injection: conditional', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'bb-conditional');
    expect(s.cladeBrainInjection).toBe('conditional');
  });

  it('falls back to auto for unrecognised injection values', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'bb-unknown');
    expect(s.cladeBrainInjection).toBe('auto');
  });

  it('defaults cladeBrainManagesDirection to false when absent', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'no-bb');
    expect(s.cladeBrainManagesDirection).toBe(false);
  });

  it('parses manages_direction: true', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'bb-dir');
    expect(s.cladeBrainManagesDirection).toBe(true);
  });

  it('parses manages_direction: false explicitly', async () => {
    const skills = await listSkills(skillsDir);
    const s = skills.find((x) => x.id === 'bb-no-dir');
    expect(s.cladeBrainManagesDirection).toBe(false);
  });
});
