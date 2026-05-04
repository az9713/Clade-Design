// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { upsertBrandField, insertBrandHistory, updateBrandNodeHealth } from './db.js';
import { getHealthScore } from './brand-brain.js';

// DESIGN.md section number → brand-brain section name
const SECTION_MAP = {
  1: 'atmosphere',   // 1. Visual Theme & Atmosphere
  2: 'colors',       // 2. Color Palette & Roles
  3: 'typography',   // 3. Typography Rules
  4: 'components',   // 4. Component Stylings
  5: 'layout',       // 5. Layout Principles
  6: 'motion',       // 6. Depth & Elevation
  7: 'anti-patterns',// 7. Do's and Don'ts
  8: 'spacing',      // 8. Responsive Behavior
  9: 'voice',        // 9. Agent Prompt Guide
};

// Also map by keyword in heading for robustness
const HEADING_KEYWORD_MAP = [
  { pattern: /visual theme|atmosphere/i, section: 'atmosphere' },
  { pattern: /color palette|colours?/i, section: 'colors' },
  { pattern: /typography/i, section: 'typography' },
  { pattern: /component styling/i, section: 'components' },
  { pattern: /layout principle/i, section: 'layout' },
  { pattern: /depth|elevation/i, section: 'motion' },
  { pattern: /do.s and don.t/i, section: 'anti-patterns' },
  { pattern: /responsive behavior/i, section: 'spacing' },
  { pattern: /agent prompt guide/i, section: 'voice' },
];

/**
 * Convert a string to camelCase.
 * "Stripe Purple" → "stripePurple"
 * "primary brand" → "primaryBrand"
 */
function toCamelCase(str) {
  return str
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word, i) => i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Determine the brand-brain section for a DESIGN.md heading line.
 * First tries numbered prefix (e.g. "## 1. Visual..."), then keyword fallback.
 */
function headingToSection(headingText) {
  // Try numbered prefix: "1. Visual Theme & Atmosphere" → 1
  const numMatch = /^(\d+)\.\s+/.exec(headingText.trim());
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (SECTION_MAP[num]) return SECTION_MAP[num];
  }
  // Keyword fallback
  for (const { pattern, section } of HEADING_KEYWORD_MAP) {
    if (pattern.test(headingText)) return section;
  }
  return null;
}

/**
 * Split a DESIGN.md body into sections.
 * Returns array of { heading: string, section: string, content: string }.
 */
function splitDesignMdSections(content) {
  const lines = content.split(/\r?\n/);
  const result = [];
  let currentHeading = null;
  let currentSection = null;
  let currentLines = [];

  for (const line of lines) {
    const h2Match = /^##\s+(.+)$/.exec(line);
    if (h2Match) {
      if (currentSection !== null) {
        result.push({ heading: currentHeading, section: currentSection, content: currentLines.join('\n') });
      }
      currentHeading = h2Match[1].trim();
      currentSection = headingToSection(currentHeading);
      currentLines = [];
    } else if (currentSection !== null) {
      currentLines.push(line);
    }
  }
  if (currentSection !== null) {
    result.push({ heading: currentHeading, section: currentSection, content: currentLines.join('\n') });
  }
  return result;
}

/**
 * Extract named colors from a DESIGN.md section body.
 * Returns up to 10 { key, value } pairs where key is camelCase color name.
 */
function extractColors(content) {
  const colors = [];
  const seen = new Set();

  function push(name, value) {
    const key = toCamelCase(name.replace(/[*_`]+/g, '').trim());
    if (!key || seen.has(key)) return;
    seen.add(key);
    colors.push({ key, value: value.trim() });
  }

  // Form A: "- **Background:** `#FAFAFA`"
  const reA = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*\**\s*[:：]\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m;
  while ((m = reA.exec(content)) !== null) push(m[1], m[2]);

  // Form B: "**Stripe Purple** (`#533afd`)"
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(content)) !== null) push(m[1], m[2]);

  return colors.slice(0, 10);
}

/**
 * Extract font names from a typography section body.
 * Looks for backtick or bold-wrapped font names.
 * Returns up to 3 names.
 */
function extractFonts(content) {
  const fonts = [];
  const seen = new Set();

  // Match `FontName` (backtick wrapped) — but only word-like names (no pure hex, no URLs)
  const reBacktick = /`([A-Z][A-Za-z0-9 \-]{1,50})`/g;
  let m;
  while ((m = reBacktick.exec(content)) !== null) {
    const name = m[1].trim();
    // Filter out obvious non-font tokens: pure uppercase abbreviations, hex-ish, CSS-ish
    if (/^#/.test(name)) continue;
    if (/^\d/.test(name)) continue;
    if (name.includes('{') || name.includes(':')) continue;
    if (!seen.has(name)) {
      seen.add(name);
      fonts.push(name);
    }
  }

  // Match **FontName** patterns
  const reBold = /\*\*([A-Z][A-Za-z0-9 \-]{1,50})\*\*/g;
  while ((m = reBold.exec(content)) !== null) {
    const name = m[1].trim();
    if (/^#/.test(name)) continue;
    if (/^\d/.test(name)) continue;
    if (name.includes('{') || name.includes(':')) continue;
    // Only accept if it looks like a font name (contains a capital + letters, no full sentences)
    if (name.split(' ').length > 5) continue;
    if (!seen.has(name)) {
      seen.add(name);
      fonts.push(name);
    }
  }

  return fonts.slice(0, 3);
}

/**
 * Extract up to 5 bullet point items from a section body.
 * Patterns: "- **key**: value" or "- **key** — value"
 * Returns array of { key, value }.
 */
function extractBullets(content) {
  const items = [];
  // Match "- **key**: rest" or "- **key** — rest" or "- **key** – rest"
  const re = /^[\s]*-\s+\*\*([^*]{1,80})\*\*\s*(?:[:：—–\-])\s*(.{1,200})/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rawKey = m[1].trim();
    const rawValue = m[2].trim();
    // camelCase the first word of the key
    const key = toCamelCase(rawKey.split(/\s+/)[0]);
    if (!key) continue;
    const value = rawValue.replace(/\s+/g, ' ').slice(0, 120);
    items.push({ key, value });
    if (items.length >= 5) break;
  }
  return items;
}

/**
 * Seed a brand node from a DESIGN.md string (Bootstrap Path A).
 *
 * @param {object} db        - better-sqlite3 Database instance
 * @param {string} nodeId    - brand node UUID
 * @param {string} content   - raw DESIGN.md text
 * @param {string} systemId  - design system ID (for history entry)
 * @returns {number}         - health score after seeding
 */
export function seedFromDesignMd(db, nodeId, content, systemId) {
  const now = Date.now();
  const sections = splitDesignMdSections(content);

  for (const { section, content: body } of sections) {
    if (!section) continue;

    let fields = [];

    if (section === 'colors') {
      fields = extractColors(body).map(({ key, value }) => ({ key, value }));
    } else if (section === 'typography') {
      const fonts = extractFonts(body);
      const fontKeys = ['fontFamily', 'fontFamilyAlt', 'fontFamilyMono'];
      fields = fonts.map((name, i) => ({ key: fontKeys[i], value: name }));
    } else {
      fields = extractBullets(body);
    }

    for (const { key, value } of fields) {
      upsertBrandField(db, {
        id: randomUUID(),
        nodeId,
        section,
        key,
        value,
        confidence: 0.35,
        source: 'bootstrap',
        locked: 0,
        lockCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Write a single import history entry
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section: 'meta',
    key: 'bootstrap',
    oldValue: null,
    newValue: 'Seeded from ' + systemId,
    confidence: null,
    action: 'import',
    createdAt: now,
  });

  // Recalculate and persist health
  const health = getHealthScore(db, nodeId);
  return health;
}

/**
 * Parse a brand-spec.md produced by the Huashu Brand Asset Protocol (Bootstrap Path B).
 * Format:
 *   ## SectionName
 *   key: value
 *   key: value
 *
 *   ## NextSection
 *   ...
 *
 * @param {object} db      - better-sqlite3 Database instance
 * @param {string} nodeId  - brand node UUID
 * @param {string} content - brand-spec.md text
 * @returns {number}       - health score after parsing
 */
export function parseBrandSpec(db, nodeId, content) {
  const now = Date.now();

  // Map section headings to brand-brain sections (case-insensitive)
  function mapSection(name) {
    const n = name.trim().toLowerCase();
    if (n === 'colors' || n === 'colour' || n === 'colors') return 'colors';
    if (n === 'typography') return 'typography';
    if (n === 'spacing') return 'spacing';
    if (n === 'layout') return 'layout';
    if (n === 'components') return 'components';
    if (n === 'motion') return 'motion';
    if (n === 'voice') return 'voice';
    if (n === 'anti-patterns' || n === 'anti patterns') return 'anti-patterns';
    if (n === 'atmosphere') return 'atmosphere';
    return null;
  }

  // Split on ## headings
  const sectionRegex = /^##\s+(.+)$/gm;
  const sectionStarts = [];
  let m;
  while ((m = sectionRegex.exec(content)) !== null) {
    sectionStarts.push({ heading: m[1].trim(), index: m.index, endOfHeading: m.index + m[0].length });
  }

  for (let i = 0; i < sectionStarts.length; i++) {
    const { heading, endOfHeading } = sectionStarts[i];
    const section = mapSection(heading);
    if (!section) continue;

    const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].index : content.length;
    const body = content.slice(endOfHeading, end);

    // Parse "key: value" lines
    const lineRegex = /^([A-Za-z][A-Za-z0-9 _-]{0,60})\s*:\s*(.+)$/gm;
    let lm;
    while ((lm = lineRegex.exec(body)) !== null) {
      const key = toCamelCase(lm[1].trim());
      const value = lm[2].trim().slice(0, 200);
      if (!key || !value) continue;

      upsertBrandField(db, {
        id: randomUUID(),
        nodeId,
        section,
        key,
        value,
        confidence: 0.65,
        source: 'bootstrap',
        locked: 0,
        lockCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // Write import history entry
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section: 'meta',
    key: 'bootstrap',
    oldValue: null,
    newValue: 'Extracted via brand asset protocol',
    confidence: null,
    action: 'import',
    createdAt: now,
  });

  const health = getHealthScore(db, nodeId);
  return health;
}

/**
 * Delete all brand_fields for a node and reset health to 0.
 * Used before re-seeding to avoid stale data.
 *
 * @param {object} db      - better-sqlite3 Database instance
 * @param {string} nodeId  - brand node UUID
 */
export function clearBrandNodeFields(db, nodeId) {
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM brand_fields WHERE node_id = ?').run(nodeId);
    db.prepare('DELETE FROM brand_candidates WHERE node_id = ?').run(nodeId);
    insertBrandHistory(db, {
      id: randomUUID(),
      nodeId,
      section: 'meta',
      key: 'bootstrap',
      oldValue: null,
      newValue: 'Bootstrap reset',
      confidence: null,
      action: 'reset',
      createdAt: now,
    });
    updateBrandNodeHealth(db, nodeId, 0);
  });
  tx();
}
