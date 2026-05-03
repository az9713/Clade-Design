// @ts-nocheck
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractPatterns } from '../src/pattern-extractor.js';

// ---------- colors ----------

test('extracts hex colors', () => {
  const html = `<style>body { color: #E8372A; background: #ffffff; }</style>`;
  const patterns = extractPatterns(html);
  const colors = patterns.filter((p) => p.section === 'colors');
  assert.ok(colors.some((p) => p.value === '#e8372a'));
  assert.ok(colors.some((p) => p.value === '#ffffff'));
});

test('extracts CSS variable colors', () => {
  const html = `<style>:root { --primary: #533afd; --bg: #ffffff; }</style>`;
  const patterns = extractPatterns(html);
  const primary = patterns.find((p) => p.key === 'primary');
  assert.ok(primary, 'missing primary css var');
  assert.equal(primary.section, 'colors');
  assert.equal(primary.value, '#533afd');
});

test('CSS var color key uses var name, not value', () => {
  const html = `<style>:root { --brand-purple: #533afd; }</style>`;
  const patterns = extractPatterns(html);
  const p = patterns.find((p) => p.key === 'brand-purple');
  assert.ok(p);
  assert.equal(p.value, '#533afd');
});

test('deduplicates the same hex color appearing many times', () => {
  const html = `<style>
    h1 { color: #E8372A; }
    h2 { color: #E8372A; }
    h3 { color: #E8372A; }
    .btn { background: #E8372A; }
  </style>`;
  const patterns = extractPatterns(html);
  const e8372a = patterns.filter((p) => p.value === '#e8372a');
  // Should appear as the CSS var AND as a bare hex — but at most once each
  const bareHex = e8372a.filter((p) => p.key === '#e8372a');
  assert.equal(bareHex.length, 1);
});

test('extracts oklch colors', () => {
  const html = `<style>body { color: oklch(60% 0.2 30); }</style>`;
  const patterns = extractPatterns(html);
  assert.ok(patterns.some((p) => p.section === 'colors' && p.value.includes('oklch')));
});

// ---------- typography ----------

test('extracts font-family', () => {
  const html = `<style>body { font-family: "Inter", sans-serif; }</style>`;
  const patterns = extractPatterns(html);
  const fonts = patterns.filter((p) => p.section === 'typography');
  assert.ok(fonts.some((p) => p.value === 'Inter'));
});

test('font-family key uses slug of first font', () => {
  const html = `<style>body { font-family: 'Sohne Var', Arial; }</style>`;
  const patterns = extractPatterns(html);
  const font = patterns.find((p) => p.section === 'typography');
  assert.ok(font);
  assert.equal(font.key, 'font-sohne-var');
  assert.equal(font.value, 'Sohne Var');
});

test('deduplicates repeated font-family', () => {
  const html = `<style>
    body { font-family: Inter; }
    h1 { font-family: Inter; }
  </style>`;
  const fonts = extractPatterns(html).filter((p) => p.section === 'typography' && p.value === 'Inter');
  assert.equal(fonts.length, 1);
});

// ---------- atmosphere (box-shadow) ----------

test('extracts box-shadow into atmosphere section', () => {
  const html = `<style>.card { box-shadow: rgba(50,50,93,0.25) 0px 30px 45px -30px; }</style>`;
  const patterns = extractPatterns(html);
  const shadows = patterns.filter((p) => p.section === 'atmosphere');
  assert.equal(shadows.length, 1);
  assert.ok(shadows[0].key.startsWith('shadow-'));
  assert.ok(shadows[0].value.includes('rgba(50,50,93,0.25)'));
});

// ---------- motion (transition) ----------

test('extracts transition into motion section', () => {
  const html = `<style>.btn { transition: all 0.3s ease; }</style>`;
  const patterns = extractPatterns(html);
  const motions = patterns.filter((p) => p.section === 'motion');
  assert.equal(motions.length, 1);
  assert.ok(motions[0].key.startsWith('transition-'));
  assert.ok(motions[0].value.includes('0.3s'));
});

// ---------- layout (border-radius) ----------

test('extracts border-radius into layout section', () => {
  const html = `<style>.card { border-radius: 8px; }</style>`;
  const patterns = extractPatterns(html);
  const layout = patterns.filter((p) => p.section === 'layout');
  assert.ok(layout.some((p) => p.key === 'border-radius-8px' && p.value === '8px'));
});

// ---------- spacing ----------

test('extracts most common spacing value', () => {
  const html = `<style>
    .a { padding: 8px; }
    .b { margin: 8px; }
    .c { gap: 8px; }
    .d { padding: 16px; }
  </style>`;
  const patterns = extractPatterns(html);
  const spacing = patterns.find((p) => p.section === 'spacing' && p.key === 'base');
  assert.ok(spacing, 'should find base spacing');
  assert.equal(spacing.value, '8px');
});

test('does not emit spacing if no value appears twice', () => {
  const html = `<style>
    .a { padding: 8px; }
    .b { margin: 16px; }
  </style>`;
  const patterns = extractPatterns(html);
  const spacing = patterns.filter((p) => p.section === 'spacing');
  assert.equal(spacing.length, 0);
});

// ---------- stable hashing ----------

test('same value produces the same key across calls', () => {
  const html = `<style>.a { box-shadow: rgba(0,0,0,0.2) 0px 4px 8px; }</style>`;
  const p1 = extractPatterns(html);
  const p2 = extractPatterns(html);
  assert.equal(p1[0]?.key, p2[0]?.key);
});

// ---------- overall deduplication ----------

test('returns unique (section, key, value) tuples', () => {
  const html = `<style>
    .a { color: #533afd; }
    .b { color: #533afd; }
    .c { color: #533afd; }
  </style>`;
  const patterns = extractPatterns(html);
  const seen = new Set(patterns.map((p) => `${p.section}:${p.key}:${p.value}`));
  assert.equal(seen.size, patterns.length);
});
