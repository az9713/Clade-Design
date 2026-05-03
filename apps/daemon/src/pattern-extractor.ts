// @ts-nocheck

export interface ExtractedPattern {
  section: string;
  key: string;
  value: string;
}

/**
 * Extracts brand patterns from generated artifact HTML.
 * Returns deduplicated (section, key, value) tuples — each unique pattern
 * counts as one occurrence regardless of how many times it appears in the HTML.
 */
export function extractPatterns(html: string): ExtractedPattern[] {
  const seen = new Map<string, ExtractedPattern>();

  const add = (section: string, key: string, value: string) => {
    const k = `${section}\x00${key}\x00${value}`;
    if (!seen.has(k)) seen.set(k, { section, key, value });
  };

  // 1. CSS variable colors: --primary: #E8372A
  const cssVarColorRe = /--([a-zA-Z][\w-]*):\s*(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|rgb[a]?\([^)]+\))\s*[;,}]/g;
  for (const m of html.matchAll(cssVarColorRe)) {
    add('colors', m[1].toLowerCase(), normalizeColor(m[2]));
  }

  // 2. Bare hex colors (deduplicated per artifact)
  const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
  for (const m of html.matchAll(hexRe)) {
    const value = '#' + m[1].toLowerCase();
    add('colors', value, value);
  }

  // 3. OKLch colors not already captured by CSS var rule
  const oklchRe = /oklch\([^)]+\)/gi;
  for (const m of html.matchAll(oklchRe)) {
    const value = m[0].replace(/\s+/g, ' ').trim().toLowerCase();
    add('colors', value, value);
  }

  // 4. font-family declarations
  const fontFamilyRe = /font-family:\s*([^;}\n]{1,120})/gi;
  for (const m of html.matchAll(fontFamilyRe)) {
    const firstFont = m[1]
      .split(',')[0]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim();
    if (firstFont.length > 0 && firstFont.length < 80) {
      const slug = firstFont.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      add('typography', `font-${slug}`, firstFont);
    }
  }

  // 5. Box-shadow
  const boxShadowRe = /box-shadow:\s*([^;}\n]{10,})/gi;
  for (const m of html.matchAll(boxShadowRe)) {
    const value = m[1].trim();
    if (value.length <= 200) {
      add('atmosphere', `shadow-${stableHash(value)}`, value);
    }
  }

  // 6. Transition
  const transitionRe = /(?:^|[;\s{])transition:\s*([^;}\n]{5,})/gi;
  for (const m of html.matchAll(transitionRe)) {
    const value = m[1].trim();
    if (value.length <= 200) {
      add('motion', `transition-${stableHash(value)}`, value);
    }
  }

  // 7. Border-radius
  const borderRadiusRe = /border-radius:\s*([^;}\n]{1,40})/gi;
  for (const m of html.matchAll(borderRadiusRe)) {
    const value = m[1].trim();
    if (/^\d/.test(value)) {
      const slug = value.replace(/\s+/g, '-').replace(/[^a-z0-9.-]/gi, '');
      add('layout', `border-radius-${slug}`, value);
    }
  }

  // 8. Spacing: find the most common padding/margin/gap single-value
  const spacingRe = /(?:padding|margin|gap):\s*(\d+(?:\.\d+)?(?:px|rem|em))\b/gi;
  const spacingCounts = new Map<string, number>();
  for (const m of html.matchAll(spacingRe)) {
    const v = m[1].toLowerCase();
    spacingCounts.set(v, (spacingCounts.get(v) ?? 0) + 1);
  }
  let topSpacing: string | null = null;
  let topCount = 0;
  for (const [v, count] of spacingCounts) {
    if (count > topCount) { topCount = count; topSpacing = v; }
  }
  if (topSpacing && topCount >= 2) {
    add('spacing', 'base', topSpacing);
  }

  return Array.from(seen.values());
}

function normalizeColor(s: string): string {
  return s.trim().toLowerCase();
}

function stableHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).padStart(6, '0').slice(0, 8);
}
