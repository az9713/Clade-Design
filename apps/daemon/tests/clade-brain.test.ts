// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, test } from 'vitest';

import {
  closeDatabase,
  getCladeField,
  getCladeNodeByProject,
  insertProject,
  listCladeHistory,
  openDatabase,
  upsertCladeCandidate,
  upsertCladeField,
} from '../src/db.js';
import {
  applyExtractedPatterns,
  createCladeNode,
  exportCladeJson,
  exportDesignMd,
  getCladeSnapshot,
  getCladeHealthScore,
  getActiveDirectionPhilosophy,
  promoteCladeCandidate,
  rejectCladeCandidate,
  recordDirectionPick,
  updateCladeFieldConfidence,
} from '../src/clade-brain.js';
import { findCladeCandidateByPattern, listCladeCandidates } from '../src/db.js';
import { clearCladeNodeFields } from '../src/clade-brain-bootstrap.js';

const tempDirs = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-clade-brain-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.od') });
}

function seedProject(db, projectId = randomUUID()) {
  const now = Date.now();
  insertProject(db, { id: projectId, name: projectId, createdAt: now, updatedAt: now });
  return projectId;
}

// ----------

test('createCladeNode creates a root node for a project', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-1');
  const node = createCladeNode(db, pid, 'Test Brand');
  assert.equal(node.projectId, pid);
  assert.equal(node.label, 'Test Brand');
  assert.equal(node.health, 0);
  assert.equal(node.parentId, null);
});

test('getCladeNodeByProject resolves by projectId', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-2');
  createCladeNode(db, pid, 'My Brand');
  const node = getCladeNodeByProject(db, pid);
  assert.ok(node);
  assert.equal(node.label, 'My Brand');
});

test('getCladeSnapshot returns 9 empty sections for a new node', () => {
  const db = createDb();
  const pid = seedProject(db, 'proj-3');
  createCladeNode(db, pid, 'Brand');
  const snapshot = getCladeSnapshot(db, pid);
  const sections = Object.keys(snapshot);
  assert.equal(sections.length, 9);
  for (const s of sections) {
    assert.deepEqual(snapshot[s], {});
  }
});

test('getCladeSnapshot returns empty snapshot when project has no node', () => {
  const db = createDb();
  const snapshot = getCladeSnapshot(db, 'nonexistent-project');
  assert.equal(Object.keys(snapshot).length, 9);
});

test('updateCladeFieldConfidence creates a new field at 0.1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const field = updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  assert.equal(field.confidence, 0.1);
  assert.equal(field.value, '#E8372A');
});

test('updateCladeFieldConfidence increments an existing field by 0.1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  const field = updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  assert.ok(Math.abs(field.confidence - 0.3) < 0.001);
});

test('updateCladeFieldConfidence caps at 1.0', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  for (let i = 0; i < 15; i++) {
    updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  }
  const field = getCladeField(db, node.id, 'colors', 'primary');
  assert.equal(field.confidence, 1.0);
});

test('getCladeSnapshot only includes fields with confidence >= 0.5', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  // 4 increments → 0.4 confidence (below threshold)
  for (let i = 0; i < 4; i++) {
    updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  }
  const snapshotBelow = getCladeSnapshot(db, pid);
  assert.deepEqual(snapshotBelow.colors, {});
  // 1 more → 0.5 (at threshold)
  updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#E8372A', 'extracted');
  const snapshotAt = getCladeSnapshot(db, pid);
  assert.equal(snapshotAt.colors.primary, '#E8372A');
});

test('getCladeHealthScore returns 0 for empty node', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  assert.equal(getCladeHealthScore(db, node.id), 0);
});

test('getCladeHealthScore increases after fields are added', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  // Add 3 fields at 0.35 confidence each
  for (const key of ['primary', 'secondary', 'background']) {
    upsertCladeField(db, {
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
  const health = getCladeHealthScore(db, node.id);
  assert.ok(health > 0, `health should be > 0, got ${health}`);
});

test('promoteCladeCandidate merges candidate into clade_fields at 0.9 confidence', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
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
  promoteCladeCandidate(db, node.id, candidateId);
  const field = getCladeField(db, node.id, 'colors', 'accent');
  assert.ok(field, 'promoted field should exist');
  assert.equal(field.confidence, 0.9);
  assert.equal(field.source, 'promoted');
});

test('promoteCladeCandidate appears in snapshot', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
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
  promoteCladeCandidate(db, node.id, candidateId);
  const snapshot = getCladeSnapshot(db, pid);
  assert.equal(snapshot.typography['heading-font'], 'Inter');
});

test('rejectCladeCandidate locks the field and sets confidence to 0', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  updateCladeFieldConfidence(db, node.id, 'colors', 'primary', '#bad', 'extracted');
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
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
  rejectCladeCandidate(db, node.id, candidateId);
  const field = getCladeField(db, node.id, 'colors', 'primary');
  assert.equal(field.confidence, 0.0);
  assert.equal(field.locked, 1);
});

test('rejectCladeCandidate field does not appear in snapshot', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
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
  rejectCladeCandidate(db, node.id, candidateId);
  const snapshot = getCladeSnapshot(db, pid);
  assert.deepEqual(snapshot.colors, {});
});

test('exportDesignMd returns a string with all 9 sections', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Test Brand');
  const md = exportDesignMd(db, node.id);
  assert.ok(typeof md === 'string');
  for (const section of ['colors', 'typography', 'spacing', 'layout', 'components', 'motion', 'voice', 'anti-patterns', 'atmosphere']) {
    assert.ok(md.includes(`## ${section}`), `missing section: ${section}`);
  }
});

test('exportCladeJson returns node, fields, history, candidates', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const json = exportCladeJson(db, node.id);
  assert.ok(json.node);
  assert.ok(Array.isArray(json.fields));
  assert.ok(Array.isArray(json.history));
  assert.ok(Array.isArray(json.candidates));
});

test('clade_history records promote action', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
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
  promoteCladeCandidate(db, node.id, candidateId);
  const history = listCladeHistory(db, node.id);
  assert.ok(history.some((h) => h.action === 'promote' && h.key === 'bg'));
});

// ---------- applyExtractedPatterns ----------

test('applyExtractedPatterns creates new candidate with occurrences=1', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  applyExtractedPatterns(db, node.id, [
    { section: 'colors', key: '#e8372a', value: '#e8372a' },
  ]);
  const candidate = findCladeCandidateByPattern(db, node.id, 'colors', '#e8372a', '#e8372a');
  assert.ok(candidate, 'candidate should exist');
  assert.equal(candidate.occurrences, 1);
});

test('applyExtractedPatterns increments existing candidate occurrences', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const patterns = [{ section: 'colors', key: '#e8372a', value: '#e8372a' }];
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  const candidate = findCladeCandidateByPattern(db, node.id, 'colors', '#e8372a', '#e8372a');
  assert.equal(candidate.occurrences, 3);
});

test('applyExtractedPatterns increments clade_fields confidence for matching field', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  // First promote a field to get it into clade_fields
  const candidateId = randomUUID();
  upsertCladeCandidate(db, { id: candidateId, nodeId: node.id, section: 'colors', key: 'primary', value: '#533afd', occurrences: 3, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
  promoteCladeCandidate(db, node.id, candidateId);
  const fieldBefore = getCladeField(db, node.id, 'colors', 'primary');
  assert.equal(fieldBefore.confidence, 0.9);
  // Now apply extraction with matching value
  applyExtractedPatterns(db, node.id, [{ section: 'colors', key: 'primary', value: '#533afd' }]);
  const fieldAfter = getCladeField(db, node.id, 'colors', 'primary');
  assert.ok(fieldAfter.confidence > 0.9, 'confidence should increase');
});

test('applyExtractedPatterns does not increment confidence for mismatched value', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  // Promote a field
  const candidateId = randomUUID();
  upsertCladeCandidate(db, { id: candidateId, nodeId: node.id, section: 'colors', key: 'primary', value: '#533afd', occurrences: 3, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() });
  promoteCladeCandidate(db, node.id, candidateId);
  // Apply extraction with different value (conflict)
  applyExtractedPatterns(db, node.id, [{ section: 'colors', key: 'primary', value: '#ff0000' }]);
  const field = getCladeField(db, node.id, 'colors', 'primary');
  // Confidence should not increase (different value)
  assert.equal(field.confidence, 0.9);
  // A candidate for the conflicting value should exist
  const conflictCandidate = findCladeCandidateByPattern(db, node.id, 'colors', 'primary', '#ff0000');
  assert.ok(conflictCandidate);
});

test('listCladeCandidates minOccurrences=3 filters correctly', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const patterns = [{ section: 'colors', key: '#e8372a', value: '#e8372a' }];
  applyExtractedPatterns(db, node.id, patterns);
  applyExtractedPatterns(db, node.id, patterns);
  // Only 2 occurrences — should not surface
  assert.equal(listCladeCandidates(db, node.id, 'pending', { minOccurrences: 3 }).length, 0);
  // 3rd occurrence — should surface
  applyExtractedPatterns(db, node.id, patterns);
  assert.equal(listCladeCandidates(db, node.id, 'pending', { minOccurrences: 3 }).length, 1);
});

// ---------- direction pick ----------

test('recordDirectionPick writes action=direction_pick to clade_history at confidence 0.85', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const philosophy = { id: '05', name: 'Locomotive', school: 'Motion Poetics', tagline: '', dnaBlock: 'test dna' };
  recordDirectionPick(db, node.id, philosophy);
  const history = listCladeHistory(db, node.id);
  const pick = history.find((h) => h.action === 'direction_pick');
  assert.ok(pick, 'direction_pick entry should exist');
  assert.equal(pick.key, '05');
  assert.ok(pick.newValue.includes('Motion Poetics'));
  assert.ok(Math.abs(pick.confidence - 0.85) < 0.001);
});

test('getActiveDirectionPhilosophy returns the most recent pick', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
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
  const node = createCladeNode(db, pid, 'Brand');
  const active = getActiveDirectionPhilosophy(db, node.id, []);
  assert.equal(active, null);
});

// --- Regression: reject must not erase an accepted field with a different value ---

test('rejectCladeCandidate does not overwrite a promoted field with a different value', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const now = Date.now();

  // Simulate a previously promoted field: colors.primary = #533afd
  upsertCladeField(db, {
    id: randomUUID(),
    nodeId: node.id,
    section: 'colors',
    key: 'primary',
    value: '#533afd',
    confidence: 0.9,
    source: 'promoted',
    locked: 0,
    lockCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  // Insert a conflicting candidate with a different value
  const candidateId = randomUUID();
  upsertCladeCandidate(db, {
    id: candidateId,
    nodeId: node.id,
    section: 'colors',
    key: 'primary',
    value: '#ff0000',
    occurrences: 5,
    status: 'pending',
    artifactId: null,
    createdAt: now,
    updatedAt: now,
  });

  // Reject the conflicting candidate
  const result = rejectCladeCandidate(db, node.id, candidateId);
  assert.ok(result, 'reject should return a result');

  // The accepted field must be untouched
  const field = getCladeField(db, node.id, 'colors', 'primary');
  assert.ok(field, 'field should still exist');
  assert.equal(field.value, '#533afd', 'promoted value must not be overwritten');
  assert.equal(field.confidence, 0.9, 'confidence must not be zeroed');
  assert.equal(field.locked, 0, 'field must not be locked');

  // The candidate should be marked rejected
  const history = listCladeHistory(db, node.id);
  assert.ok(history.some(h => h.action === 'reject'), 'reject history entry should exist');
});

// --- Regression: clearCladeNodeFields must also purge clade_candidates ---

test('clearCladeNodeFields removes clade_candidates for the node', () => {
  const db = createDb();
  const pid = seedProject(db);
  const node = createCladeNode(db, pid, 'Brand');
  const now = Date.now();

  // Insert a pending candidate
  upsertCladeCandidate(db, {
    id: randomUUID(),
    nodeId: node.id,
    section: 'colors',
    key: 'accent',
    value: '#e74c3c',
    occurrences: 5,
    status: 'pending',
    artifactId: null,
    createdAt: now,
    updatedAt: now,
  });

  // Verify it exists before clear
  const before = listCladeCandidates(db, node.id, 'pending', { minOccurrences: 1 });
  assert.equal(before.length, 1, 'candidate should exist before clear');

  clearCladeNodeFields(db, node.id);

  // After clear, no candidates should remain
  const after = listCladeCandidates(db, node.id, 'pending', { minOccurrences: 1 });
  assert.equal(after.length, 0, 'candidates should be purged by clearCladeNodeFields');

  // Health should be 0
  const health = getCladeHealthScore(db, node.id);
  assert.equal(health, 0);
});
