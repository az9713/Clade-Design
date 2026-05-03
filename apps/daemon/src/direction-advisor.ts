// @ts-nocheck
// Direction advisor — parses the 20×5 philosophy matrix from
// craft/huashu-references/design-styles.md, detects vague briefs, and
// selects 3 directions from different schools for the direction-picker flow.

export type Philosophy = {
  id: string;       // two-digit string e.g. '01', '05'
  name: string;     // full name from heading e.g. 'Pentagram - Michael Bierut风格'
  school: string;   // e.g. 'Information Architecture'
  tagline: string;  // the **哲学**：... line (Chinese)
  dnaBlock: string; // body of the ```...``` DNA block (English)
};

// Schools assigned by ID range — hardcoded to mirror design-styles.md sections.
const SCHOOL_BY_ID: Record<string, string> = {
  '01': 'Information Architecture', '02': 'Information Architecture',
  '03': 'Information Architecture', '04': 'Information Architecture',
  '05': 'Motion Poetics',           '06': 'Motion Poetics',
  '07': 'Motion Poetics',           '08': 'Motion Poetics',
  '09': 'Minimalism',               '10': 'Minimalism',
  '11': 'Minimalism',               '12': 'Minimalism',
  '13': 'Experimental',             '14': 'Experimental',
  '15': 'Experimental',             '16': 'Experimental',
  '17': 'Eastern Philosophy',       '18': 'Eastern Philosophy',
  '19': 'Eastern Philosophy',       '20': 'Eastern Philosophy',
};

// Words that signal a purely-stylistic brief with no product or audience noun.
const VAGUE_KEYWORDS = new Set([
  'modern', 'clean', 'nice', 'minimal', 'minimalist', 'professional',
  'good', 'simple', 'elegant', 'beautiful', 'pretty', 'cool', 'awesome',
  'great', 'sleek', 'stylish', 'fresh', 'sharp', 'polished', 'slick',
  'crisp', 'bold', 'flat', 'fancy', 'dark', 'light', 'bright', 'vibrant',
]);

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export function parseDesignStyles(markdown: string): Philosophy[] {
  const philosophies: Philosophy[] = [];
  const lines = markdown.split(/\r?\n/);

  let current: Partial<Philosophy> | null = null;
  let afterDnaMarker = false;
  let inDnaBlock = false;
  const dnaLines: string[] = [];

  const flush = () => {
    if (current?.id && current.dnaBlock) {
      philosophies.push(current as Philosophy);
    }
    current = null;
    afterDnaMarker = false;
    inDnaBlock = false;
    dnaLines.length = 0;
  };

  for (const line of lines) {
    // New philosophy subsection: ### NN. Name
    const philMatch = /^### (\d{2})\.\s+(.+)/.exec(line);
    if (philMatch) {
      flush();
      const id = philMatch[1];
      current = {
        id,
        name: philMatch[2].trim(),
        school: SCHOOL_BY_ID[id] ?? 'Unknown',
        tagline: '',
        dnaBlock: '',
      };
      continue;
    }

    if (!current) continue;

    // Philosophy tagline
    const taglineMatch = /^\*\*哲学\*\*：(.+)/.exec(line);
    if (taglineMatch) {
      current.tagline = taglineMatch[1].trim();
      continue;
    }

    // DNA marker line
    if (/^\*\*提示词DNA\*\*/.test(line)) {
      afterDnaMarker = true;
      continue;
    }

    if (afterDnaMarker) {
      // Opening fence (``` or ```text etc.)
      if (!inDnaBlock && /^```/.test(line.trim())) {
        inDnaBlock = true;
        continue;
      }
      if (inDnaBlock) {
        // Closing fence
        if (/^```\s*$/.test(line.trim())) {
          current.dnaBlock = dnaLines.join('\n');
          inDnaBlock = false;
          afterDnaMarker = false;
        } else {
          dnaLines.push(line);
        }
      }
    }
  }

  flush();
  return philosophies;
}

// ---------------------------------------------------------------------------
// Vague-brief detection
// ---------------------------------------------------------------------------

export function detectVagueBrief(text: string, healthScore: number): boolean {
  // Health gate fires unconditionally.
  if (healthScore < 30) return true;

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Fewer than 15 words.
  if (words.length < 15) return true;

  // Longer brief composed entirely of vague style keywords.
  const alpha = words.filter((w) => /^[a-z]/i.test(w));
  if (
    alpha.length > 0 &&
    alpha.every((w) => VAGUE_KEYWORDS.has(w.toLowerCase().replace(/[^a-z]/g, '')))
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Direction selection
// ---------------------------------------------------------------------------

export type PriorPick = {
  id: string;     // philosophy id e.g. '05'
  school: string; // school name
};

/**
 * Select n directions from different schools, preferring schools not yet
 * explored in brand history (per design-styles.md rule: one per school).
 */
export function selectDirections(
  philosophies: Philosophy[],
  priorPicks: PriorPick[],
  n = 3,
): Philosophy[] {
  if (philosophies.length === 0) return [];

  const seenSchools = new Set(priorPicks.map((p) => p.school));
  const seenIds = new Set(priorPicks.map((p) => p.id));

  const allSchools = [...new Set(philosophies.map((p) => p.school))];

  // Schools not yet used → preferred; already-used → fallback.
  const fresh = shuffled(allSchools.filter((s) => !seenSchools.has(s)));
  const used = shuffled(allSchools.filter((s) => seenSchools.has(s)));
  const orderedSchools = [...fresh, ...used];

  const picked: Philosophy[] = [];
  const usedSchools = new Set<string>();

  for (const school of orderedSchools) {
    if (picked.length >= n) break;
    if (usedSchools.has(school)) continue;

    const candidates = philosophies.filter((p) => p.school === school);
    if (candidates.length === 0) continue;

    // Within a school, prefer philosophies not previously shown.
    const unseenCandidates = candidates.filter((p) => !seenIds.has(p.id));
    const pool = unseenCandidates.length > 0 ? unseenCandidates : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    picked.push(pick);
    usedSchools.add(school);
  }

  return picked;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
