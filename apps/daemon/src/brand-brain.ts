// @ts-nocheck
import { randomUUID } from 'node:crypto';
import {
  getBrandNodeByProject,
  getBrandNode,
  insertBrandNode,
  updateBrandNodeHealth,
  listBrandFields,
  getBrandField,
  upsertBrandField,
  insertBrandHistory,
  listBrandHistory,
  listBrandCandidates,
  updateBrandCandidateStatus,
  getBrandCandidate,
  upsertBrandCandidate,
  findBrandCandidateByPattern,
  incrementBrandCandidateOccurrences,
  getLatestDirectionPick,
} from './db.js';

const BRAND_SECTIONS = [
  'colors',
  'typography',
  'spacing',
  'layout',
  'components',
  'motion',
  'voice',
  'anti-patterns',
  'atmosphere',
];

export function createBrandNode(db, projectId, label) {
  const now = Date.now();
  return insertBrandNode(db, {
    id: randomUUID(),
    projectId,
    parentId: null,
    label,
    health: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function getBrandSnapshot(db, projectId) {
  const node = getBrandNodeByProject(db, projectId);
  const snapshot = Object.fromEntries(BRAND_SECTIONS.map((s) => [s, {}]));
  if (!node) return snapshot;
  const fields = listBrandFields(db, node.id);
  for (const f of fields) {
    if (f.confidence >= 0.5 && !f.locked) {
      if (!snapshot[f.section]) snapshot[f.section] = {};
      snapshot[f.section][f.key] = f.value;
    }
  }
  return snapshot;
}

export function updateFieldConfidence(db, nodeId, section, key, value, source) {
  const now = Date.now();
  const existing = getBrandField(db, nodeId, section, key);
  if (existing) {
    if (existing.locked) {
      // Under rejection lock — only increment lock_count
      const newLockCount = existing.lockCount + 1;
      upsertBrandField(db, {
        ...existing,
        lockCount: newLockCount,
        locked: newLockCount >= 10 ? 0 : 1,
        updatedAt: now,
      });
      return getBrandField(db, nodeId, section, key);
    }
    const newConfidence = Math.min(1.0, existing.confidence + 0.1);
    const updated = upsertBrandField(db, {
      ...existing,
      value,
      confidence: newConfidence,
      source,
      updatedAt: now,
    });
    insertBrandHistory(db, {
      id: randomUUID(),
      nodeId,
      section,
      key,
      oldValue: existing.value,
      newValue: value,
      confidence: newConfidence,
      action: 'extract',
      createdAt: now,
    });
    return updated;
  }
  const newField = upsertBrandField(db, {
    id: randomUUID(),
    nodeId,
    section,
    key,
    value,
    confidence: 0.1,
    source,
    locked: 0,
    lockCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section,
    key,
    oldValue: null,
    newValue: value,
    confidence: 0.1,
    action: 'extract',
    createdAt: now,
  });
  return newField;
}

export function getHealthScore(db, nodeId) {
  const fields = listBrandFields(db, nodeId);
  if (fields.length === 0) return 0;

  const sectionSet = new Set(fields.filter((f) => f.confidence > 0).map((f) => f.section));
  const completeness = sectionSet.size / BRAND_SECTIONS.length;

  const candidates = listBrandCandidates(db, nodeId, 'pending');
  const conflictKeys = new Set(candidates.map((c) => `${c.section}:${c.key}`));
  const totalFields = fields.length;
  const unconflicted = fields.filter((f) => !conflictKeys.has(`${f.section}:${f.key}`)).length;
  const consistency = totalFields > 0 ? unconflicted / totalFields : 1;

  const avgConfidence = fields.reduce((sum, f) => sum + f.confidence, 0) / totalFields;

  const raw = completeness * 0.4 + consistency * 0.4 + avgConfidence * 0.2;
  const health = Math.round(raw * 100);
  updateBrandNodeHealth(db, nodeId, health);
  return health;
}

export function exportDesignMd(db, nodeId) {
  const node = getBrandNode(db, nodeId);
  const label = node ? node.label : 'Brand';
  const fields = listBrandFields(db, nodeId);
  const sections = Object.fromEntries(BRAND_SECTIONS.map((s) => [s, []]));
  for (const f of fields) {
    if (f.confidence >= 0.5 && !f.locked && sections[f.section]) {
      sections[f.section].push(`  ${f.key}: ${f.value}`);
    }
  }
  const lines = [`# ${label} Design System\n`];
  for (const section of BRAND_SECTIONS) {
    lines.push(`## ${section}`);
    if (sections[section].length > 0) {
      lines.push(...sections[section]);
    } else {
      lines.push('  # (no data yet)');
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function exportCladeJson(db, nodeId) {
  const node = getBrandNode(db, nodeId);
  const fields = listBrandFields(db, nodeId);
  const history = listBrandHistory(db, nodeId);
  const candidates = listBrandCandidates(db, nodeId);
  return { node, fields, history, candidates };
}

export function promoteBrandCandidate(db, nodeId, candidateId) {
  const candidate = getBrandCandidate(db, candidateId);
  if (!candidate || candidate.nodeId !== nodeId) return null;
  const now = Date.now();
  const existing = getBrandField(db, nodeId, candidate.section, candidate.key);
  upsertBrandField(db, {
    id: existing?.id ?? randomUUID(),
    nodeId,
    section: candidate.section,
    key: candidate.key,
    value: candidate.value,
    confidence: 0.9,
    source: 'promoted',
    locked: 0,
    lockCount: 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section: candidate.section,
    key: candidate.key,
    oldValue: existing?.value ?? null,
    newValue: candidate.value,
    confidence: 0.9,
    action: 'promote',
    createdAt: now,
  });
  updateBrandCandidateStatus(db, candidateId, 'promoted');
  const health = getHealthScore(db, nodeId);
  return { health };
}

export function rejectBrandCandidate(db, nodeId, candidateId) {
  const candidate = getBrandCandidate(db, candidateId);
  if (!candidate || candidate.nodeId !== nodeId) return null;
  const now = Date.now();
  const existing = getBrandField(db, nodeId, candidate.section, candidate.key);
  if (existing) {
    upsertBrandField(db, {
      ...existing,
      confidence: 0.0,
      locked: 1,
      lockCount: 0,
      updatedAt: now,
    });
  }
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section: candidate.section,
    key: candidate.key,
    oldValue: existing?.value ?? null,
    newValue: candidate.value,
    confidence: 0.0,
    action: 'reject',
    createdAt: now,
  });
  updateBrandCandidateStatus(db, candidateId, 'rejected');
  return { health: getHealthScore(db, nodeId) };
}

/**
 * Called after artifact generation. Writes patterns to brand_candidates
 * (creating or incrementing occurrences), and increments brand_fields
 * confidence for patterns that already exist as confirmed fields.
 */
export function applyExtractedPatterns(db, nodeId, patterns, artifactId = null) {
  const now = Date.now();
  for (const { section, key, value } of patterns) {
    // Find or create candidate
    const existing = findBrandCandidateByPattern(db, nodeId, section, key, value);
    if (existing) {
      incrementBrandCandidateOccurrences(db, existing.id);
    } else {
      upsertBrandCandidate(db, {
        id: randomUUID(),
        nodeId,
        section,
        key,
        value,
        occurrences: 1,
        status: 'pending',
        artifactId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // If a confirmed field exists with the same value, increment its confidence
    const existingField = getBrandField(db, nodeId, section, key);
    if (existingField && existingField.value === value) {
      updateFieldConfidence(db, nodeId, section, key, value, 'extracted');
    }
  }
}

/**
 * Records a user direction pick in brand_history.
 * section='direction', key=philosophy id, new_value encodes school+name,
 * confidence=0.85 per spec (explicit user choice — highest-weight signal).
 */
export function recordDirectionPick(db, nodeId, philosophy) {
  insertBrandHistory(db, {
    id: randomUUID(),
    nodeId,
    section: 'direction',
    key: philosophy.id,
    oldValue: null,
    newValue: `${philosophy.school}:${philosophy.name}`,
    confidence: 0.85,
    action: 'direction_pick',
    createdAt: Date.now(),
  });
}

/**
 * Returns the DNA block of the most recently picked direction for this node,
 * or null if no direction has been picked yet.
 * Matches the pick's philosophy id against the provided philosophy list so
 * callers don't need to parse design-styles.md twice.
 */
export function getActiveDirectionPhilosophy(db, nodeId, philosophies) {
  const pick = getLatestDirectionPick(db, nodeId);
  if (!pick) return null;
  return philosophies.find((p) => p.id === pick.key) ?? null;
}
