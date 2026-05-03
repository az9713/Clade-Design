// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'vitest';

import {
  closeDatabase,
  getBrandField,
  getBrandNodeByProject,
  insertProject,
  listBrandHistory,
  openDatabase,
  upsertBrandCandidate,
  upsertBrandField,
} from '../src/db.js';
import {
  applyExtractedPatterns,
  createBrandNode,
  exportCladeJson,
  exportDesignMd,
  getBrandSnapshot,
  getHealthScore,
  getActiveDirectionPhilosophy,
  promoteBrandCandidate,
  rejectBrandCandidate,
  recordDirectionPick,
  updateFieldConfidence,
} from '../src/brand-brain.js';
import { findBrandCandidateByPattern, listBrandCandidates } from '../src/db.js';

const tempDirs = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-brand-brain-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.od') });
}

function seedProject(db, projectId = randomUUID()) {
  const now = Date.now();
  insertProject(db, { id: projectId, name: projectId, createdAt: now, updatedAt: now });
  return projectId;
}

// ----------

test('createBrandNode creates a root node for a project', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-1');
  const node = createBrandNode(db, pid, 'Test Brand');
  assert.equal(node.projectId, pid);
  assert.equal(node.label, 'Test Brand');
  assert.equal(node.health, 0);
  assert.equal(node.parentId, null);
});

test('getBrandNodeByProject resolves by projectId', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-2');
  createBrandNode(db, pid, 'My Brand');
  const node = getBrandNodeByProject(db, pid);
  assert.ok(node);
  assert.equal(node.label, 'My Brand');
});

test('getBrandSnapshot returns 9 empty sections for a new node', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-3');
  createBrandNode(db, pid, 'Brand');
  const snapshot = getBrandSnapshot(db, pid);
  const sections = Object.keys(snapshot);
  assert.equal(sections.length, 9);
  for (const s of sections) {
    assert.deepEqual(snapshot[s], {});
  }
});

test('getBrandSnapshot returns empty snapshot when project has no node', () => {
  const db = createDb();
  const snapshot = getBrandSnapshot(db, 'nonexistent-project');
  assert.equal(Object.keys(snapshot).length, 9);
});

test('updateFieldConfidence creates a new field at 0.1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const field = updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  assert.equal(field.confidence, 0.1);
  assert.equal(field.value, '#E8372A');
});

test('updateFieldConfidence increments an existing field by 0.1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  const field = updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  assert.ok(Math.abs(field.confidence - 0.3) < 0.001);
});

test('updateFieldConfidence caps at 1.0', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  for (let i = 0; i < 15; i++) {
    updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  }
  const field = getBrandField(db, node.id, 'colors', 'primary');
  assert.equal(field.confidence, 1.0);
});

test('getBrandSnapshot only includes fields with confidence >= 0.5', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  // 4 increments → 0.4 confidence (below threshold)
  for (let i = 0; i < 4; i++) {
    updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  }
  const snapshotBelow = getBrandSnapshot(db, pid);
  assert.deepEqual(snapshotBelow.colors, {});
  // 1 more → 0.5 (at threshold)
  updateFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  const snapshotAt = getBrandSnapshot(db, pid);
  assert.equal(snapshotAt.colors.primary, '#E8372A');
});

test('getHealthScore returns 0 for empty node', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  assert.equal(getHealthScore(db, node.id), 0);
});

test('getHealthScore increases after fields are added', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  // Add 3 fields at 0.35 confidence each
  for (const key of ['primary', 'secondary', 'background']) {
    upsertBrandField(db, {
      id: randomUUID(),
      nodeId: node.id,
      section: 'colors',
      key,
      value: '#aabbcc',
      confidence: 0.35,
      source: 'bootstrap',
      locked: 0,
      lockCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  const health = getHealthScore(db, node.id);
  assert.ok(health > 0, `health should be > 0, got ${health}`);
});

test('promoteBrandCandidate merges candidate into brand_fields at 0.9 confidence', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertBrandCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'colors',
    key: 'accent',
    value: '#FF6B00',
    occurrences: 3,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  promoteBrandCandidate(db, node.id, candidateId);
  const field = getBrandField(db, node.id, 'colors', 'accent');
  assert.ok(field, 'promoted field should exist');
  assert.equal(field.confidence, 0.9);
  assert.equal(field.source, 'promoted');
});

test('promoteBrandCandidate appears in snapshot', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertBrandCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'typography',
    key: 'heading-font',
    value: 'Inter',
    occurrences: 3,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  promoteBrandCandidate(db, node.id, candidateId);
  const snapshot = getBrandSnapshot(db, pid);
  assert.equal(snapshot.typography['heading-font'], 'Inter');
});

test('rejectBrandCandidate locks the field and sets confidence to 0', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  updateFieldConfidence(db, node.id, 'colors', 'primary', '#bad', 'extracted');
  const candidateId = randomUUID();
  upsertBrandCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'colors',
    key: 'primary',
    value: '#bad',
    occurrences: 3,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  rejectBrandCandidate(db, node.id, candidateId);
  const field = getBrandField(db, node.id, 'colors', 'primary');
  assert.equal(field.confidence, 0.0);
  assert.equal(field.locked, 1);
});

test('rejectBrandCandidate field does not appear in snapshot', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertBrandCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'colors',
    key: 'primary',
    value: '#bad',
    occurrences: 3,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  rejectBrandCandidate(db, node.id, candidateId);
  const snapshot = getBrandSnapshot(db, pid);
  assert.deepEqual(snapshot.colors, {});
});

test('exportDesignMd returns a string with all 9 sections', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Test Brand');
  const md = exportDesignMd(db, node.id);
  assert.ok(typeof md === 'string');
  for (const section of ['colors', 'typography', 'spacing', 'layout', 'components', 'motion', 'voice', 'anti-patterns', 'atmosphere']) {
    assert.ok(md.includes(`## ${section}`), `missing section: ${section}`);
  }
});

test('exportCladeJson returns node, fields, history, candidates', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const json = exportCladeJson(db, node.id);
  assert.ok(json.node);
  assert.ok(Array.isArray(json.fields));
  assert.ok(Array.isArray(json.history));
  assert.ok(Array.isArray(json.candidates));
});

test('brand_history records promote action', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertBrandCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'colors',
    key: 'bg',
    value: '#fff',
    occurrences: 3,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  promoteBrandCandidate(db, node.id, candidateId);
  const history = listBrandHistory(db, node.id);
  assert.ok(history.some((h) => h.action === 'promote' && h.key === 'bg'));
});

// ---------- applyExtractedPatterns ----------

test('applyExtractedPatterns creates new candidate with occurrences=1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  applyExtractedPatterns(db, node.id, [
    { section: 'colors', key: '#e8372a', value: '#e8372a' },
  ]);
  const candidate = findBrandCandidateByPattern(db, node.id, 'colors', '#e8372a', '#e8372a');
  assert.ok(candidate, 'candidate should exist');
  assert.equal(candidate.occurrences, 1);
});

test('applyExtractedPatterns increments existing candidate occurrences', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const patterns = [{ section: 'colors', key: '#e8372a', value: '#e8372a' }];
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  const candidate = findBrandCandidateByPattern(db, node.id, 'colors', '#e8372a', '#e8372a');
  assert.equal(candidate.occurrences, 3);
});

test('applyExtractedPatterns increments brand_fields confidence for matching field', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  // First promote a field to get it into brand_fields
  const candidateId = randomUUID();
  upsertBrandCandidate(db, { id: candidateId, nodeId: node.id, section: 'colors', key: 'primary', value: '#533afd', occurrences: 3, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
  promoteBrandCandidate(db, node.id, candidateId);
  const fieldBefore = getBrandField(db, node.id, 'colors', 'primary');
  assert.equal(fieldBefore.confidence, 0.9);
  // Now apply extraction with matching value
  applyExtractedPatterns(db, node.id, [{ section: 'colors', key: 'primary', value: '#533afd' }]);
  const fieldAfter = getBrandField(db, node.id, 'colors', 'primary');
  assert.ok(fieldAfter.confidence > 0.9, 'confidence should increase');
});

test('applyExtractedPatterns does not increment confidence for mismatched value', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  // Promote a field
  const candidateId = randomUUID();
  upsertBrandCandidate(db, { id: candidateId, nodeId: node.id, section: 'colors', key: 'primary', value: '#533afd', occurrences: 3, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
  promoteBrandCandidate(db, node.id, candidateId);
  // Apply extraction with different value (conflict)
  applyExtractedPatterns(db, node.id, [{ section: 'colors', key: 'primary', value: '#ff0000' }]);
  const field = getBrandField(db, node.id, 'colors', 'primary');
  // Confidence should not increase (different value)
  assert.equal(field.confidence, 0.9);
  // A candidate for the conflicting value should exist
  const conflictCandidate = findBrandCandidateByPattern(db, node.id, 'colors', 'primary', '#ff0000');
  assert.ok(conflictCandidate);
});

test('listBrandCandidates minOccurrences=3 filters correctly', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const patterns = [{ section: 'colors', key: '#e8372a', value: '#e8372a' }];
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  // Only 2 occurrences — should not surface
  assert.equal(listBrandCandidates(db, node.id, 'pending', { minOccurrences: 3 }).length, 0);
  // 3rd occurrence — should surface
  applyExtractedPatterns(db, node.id, patterns);
  assert.equal(listBrandCandidates(db, node.id, 'pending', { minOccurrences: 3 }).length, 1);
});

// ---------- direction pick ----------

test('recordDirectionPick writes action=direction_pick to brand_history at confidence 0.85', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const philosophy = { id: '05', name: 'Locomotive', school: 'Motion Poetics', tagline: '', dnaBlock: 'test dna' };
  recordDirectionPick(db, node.id, philosophy);
  const history = listBrandHistory(db, node.id);
  const pick = history.find((h) => h.action === 'direction_pick');
  assert.ok(pick, 'direction_pick entry should exist');
  assert.equal(pick.key, '05');
  assert.ok(pick.newValue.includes('Motion Poetics'));
  assert.ok(Math.abs(pick.confidence - 0.85) < 0.001);
});

test('getActiveDirectionPhilosophy returns the most recent pick', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const philosophies = [
    { id: '01', name: 'Pentagram', school: 'Information Architecture', tagline: '', dnaBlock: 'ia dna' },
    { id: '05', name: 'Locomotive', school: 'Motion Poetics', tagline: '', dnaBlock: 'mp dna' },
  ];
  recordDirectionPick(db, node.id, philosophies[0]);
  recordDirectionPick(db, node.id, philosophies[1]);
  const active = getActiveDirectionPhilosophy(db, node.id, philosophies);
  assert.ok(active, 'active direction should exist');
  assert.equal(active.id, '05');
  assert.equal(active.dnaBlock, 'mp dna');
});

test('getActiveDirectionPhilosophy returns null when no direction has been picked', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createBrandNode(db, pid, 'Brand');
  const active = getActiveDirectionPhilosophy(db, node.id, []);
  assert.equal(active, null);
});
