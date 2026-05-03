// @ts-nocheck
import { describe, expect, it, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  parseDesignStyles,
  detectVagueBrief,
  selectDirections,
} from '../src/direction-advisor.js';

// The real design-styles.md lives two levels above the daemon package.
const DESIGN_STYLES_PATH = path.resolve(
  __dirname,
  '../../../craft/huashu-references/design-styles.md',
);

let philosophies;

beforeAll(async () => {
  const md = await readFile(DESIGN_STYLES_PATH, 'utf8');
  philosophies = parseDesignStyles(md);
});

// ---------------------------------------------------------------------------
// parseDesignStyles
// ---------------------------------------------------------------------------

describe('parseDesignStyles', () => {
  it('extracts exactly 20 philosophies', () => {
    expect(philosophies).toHaveLength(20);
  });

  it('assigns correct schools to id ranges', () => {
    const byId = Object.fromEntries(philosophies.map((p) => [p.id, p.school]));
    expect(byId['01']).toBe('Information Architecture');
    expect(byId['04']).toBe('Information Architecture');
    expect(byId['05']).toBe('Motion Poetics');
    expect(byId['08']).toBe('Motion Poetics');
    expect(byId['09']).toBe('Minimalism');
    expect(byId['12']).toBe('Minimalism');
    expect(byId['13']).toBe('Experimental');
    expect(byId['16']).toBe('Experimental');
    expect(byId['17']).toBe('Eastern Philosophy');
    expect(byId['20']).toBe('Eastern Philosophy');
  });

  it('every philosophy has a non-empty dnaBlock', () => {
    for (const p of philosophies) {
      expect(p.dnaBlock.trim().length).toBeGreaterThan(10);
    }
  });

  it('every philosophy has a non-empty name', () => {
    for (const p of philosophies) {
      expect(p.name.trim().length).toBeGreaterThan(0);
    }
  });

  it('Pentagram (01) DNA block contains expected English content', () => {
    const p = philosophies.find((x) => x.id === '01');
    expect(p).toBeDefined();
    expect(p.dnaBlock).toContain('Pentagram');
    expect(p.dnaBlock).toContain('whitespace');
  });

  it('each school has exactly 4 philosophies', () => {
    const counts = new Map();
    for (const p of philosophies) {
      counts.set(p.school, (counts.get(p.school) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// detectVagueBrief
// ---------------------------------------------------------------------------

describe('detectVagueBrief', () => {
  it('fires when health < 30 regardless of text', () => {
    expect(detectVagueBrief('Build me a detailed enterprise SaaS dashboard with user analytics charts', 29)).toBe(true);
  });

  it('does not fire when health >= 30 and brief is specific and long', () => {
    expect(detectVagueBrief(
      'Build a landing page for a B2B expense management SaaS targeting finance teams at mid-market companies',
      35,
    )).toBe(false);
  });

  it('fires when brief is fewer than 15 words', () => {
    expect(detectVagueBrief('Make it look good', 50)).toBe(true);
  });

  it('fires when brief is exactly 14 words', () => {
    const brief = 'A modern clean homepage for a product I am building right now today here';
    expect(brief.split(/\s+/).filter(Boolean).length).toBe(14);
    expect(detectVagueBrief(brief, 50)).toBe(true);
  });

  it('does not fire when brief >= 15 specific words and health >= 30', () => {
    expect(detectVagueBrief(
      'Design a dark-mode analytics dashboard for a fintech startup with revenue charts and user cohort tables',
      40,
    )).toBe(false);
  });

  it('fires on all-vague-keywords brief even if >= 15 words', () => {
    // 16 words, all vague
    const brief = 'modern clean minimal elegant professional sleek crisp fresh bold polished stylish flat bright cool great simple';
    expect(brief.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(15);
    expect(detectVagueBrief(brief, 50)).toBe(true);
  });

  it('fires on empty string', () => {
    expect(detectVagueBrief('', 50)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// selectDirections
// ---------------------------------------------------------------------------

describe('selectDirections', () => {
  it('returns 3 philosophies from different schools', () => {
    const dirs = selectDirections(philosophies, []);
    expect(dirs).toHaveLength(3);
    const schools = dirs.map((d) => d.school);
    expect(new Set(schools).size).toBe(3);
  });

  it('returns fewer when n > available schools', () => {
    const subset = philosophies.filter((p) => p.school === 'Minimalism');
    const dirs = selectDirections(subset, [], 3);
    // Only one school available, so only 1 direction returned
    expect(dirs).toHaveLength(1);
  });

  it('avoids already-seen schools when fresh ones exist', () => {
    const priorPicks = [
      { id: '01', school: 'Information Architecture' },
      { id: '05', school: 'Motion Poetics' },
      { id: '09', school: 'Minimalism' },
    ];
    // 3 schools used; remaining: Experimental + Eastern Philosophy
    const dirs = selectDirections(philosophies, priorPicks, 2);
    expect(dirs).toHaveLength(2);
    const schools = new Set(dirs.map((d) => d.school));
    expect(schools.has('Experimental') || schools.has('Eastern Philosophy')).toBe(true);
    // Should NOT include any of the 3 already-seen schools when 2 fresh ones are available
    expect(schools.has('Information Architecture')).toBe(false);
    expect(schools.has('Motion Poetics')).toBe(false);
    expect(schools.has('Minimalism')).toBe(false);
  });

  it('falls back to seen schools when not enough fresh ones', () => {
    // All 5 schools have been seen — must still return 3 from different schools
    const priorPicks = [
      { id: '01', school: 'Information Architecture' },
      { id: '05', school: 'Motion Poetics' },
      { id: '09', school: 'Minimalism' },
      { id: '13', school: 'Experimental' },
      { id: '17', school: 'Eastern Philosophy' },
    ];
    const dirs = selectDirections(philosophies, priorPicks, 3);
    expect(dirs).toHaveLength(3);
    expect(new Set(dirs.map((d) => d.school)).size).toBe(3);
  });

  it('returns empty array for empty input', () => {
    expect(selectDirections([], [], 3)).toHaveLength(0);
  });
});
