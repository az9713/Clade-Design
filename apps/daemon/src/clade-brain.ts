// @ts-nocheck
import { randomUUID } from 'node:crypto';
import {
  getCladeNodeByProject,
  getCladeNode,
  insertCladeNode,
  updateCladeNodeHealth,
  listCladeFields,
  getCladeField,
  upsertCladeField,
  insertCladeHistory,
  listCladeHistory,
  listCladeCandidates,
  updateCladeCandidateStatus,
  getCladeCandidate,
  upsertCladeCandidate,
  findCladeCandidateByPattern,
  incrementCladeCandidateOccurrences,
  getLatestDirectionPick,
} from './db.js';

const CLADE_SECTIONS = [
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

export function createCladeNode(db, projectId, label) {
  const now = Date.now();
  return insertCladeNode(db, {
    id: randomUUID(),
    projectId,
    parentId: null,
    label,
    health: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export function getCladeSnapshot(db, projectId) {
  const node = getCladeNodeByProject(db, projectId);
  const snapshot = Object.fromEntries(CLADE_SECTIONS.map((s) => [s, {}]));
  if (!node) return snapshot;
  const fields = listCladeFields(db, node.id);
  for (const f of fields) {
    if (f.confidence >= 0.5 && !f.locked) {
      if (!snapshot[f.section]) snapshot[f.section] = {};
      snapshot[f.section][f.key] = f.value;
    }
  }
  return snapshot;
}

export function updateCladeFieldConfidence(db, nodeId, section, key, value, source) {
  const now = Date.now();
  const existing = getCladeField(db, nodeId, section, key);
  if (existing) {
    if (existing.locked) {
      // Under rejection lock — only increment lock_count
      const newLockCount = existing.lockCount + 1;
      upsertCladeField(db, {
        ...existing,
        lockCount: newLockCount,
        locked: newLockCount >= 10 ? 0 : 1,
        updatedAt: now,
      });
      return getCladeField(db, nodeId, section, key);
    }
    const newConfidence = Math.min(1.0, existing.confidence + 0.1);
    const updated = upsertCladeField(db, {
      ...existing,
      value,
      confidence: newConfidence,
      source,
      updatedAt: now,
    });
    insertCladeHistory(db, {
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
  const newField = upsertCladeField(db, {
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
  insertCladeHistory(db, {
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

export function getCladeHealthScore(db, nodeId) {
  const fields = listCladeFields(db, nodeId);
  if (fields.length === 0) return 0;

  const sectionSet = new Set(fields.filter((f) => f.confidence > 0).map((f) => f.section));
  const completeness = sectionSet.size / CLADE_SECTIONS.length;

  const candidates = listCladeCandidates(db, nodeId, 'pending');
  const conflictKeys = new Set(candidates.map((c) => `${c.section}:${c.key}`));
  const totalFields = fields.length;
  const unconflicted = fields.filter((f) => !conflictKeys.has(`${f.section}:${f.key}`)).length;
  const consistency = totalFields > 0 ? unconflicted / totalFields : 1;

  const avgConfidence = fields.reduce((sum, f) => sum + f.confidence, 0) / totalFields;

  const raw = completeness * 0.4 + consistency * 0.4 + avgConfidence * 0.2;
  const health = Math.round(raw * 100);
  updateCladeNodeHealth(db, nodeId, health);
  return health;
}

export function exportDesignMd(db, nodeId) {
  const node = getCladeNode(db, nodeId);
  const label = node ? node.label : 'Brand';
  const fields = listCladeFields(db, nodeId);
  const sections = Object.fromEntries(CLADE_SECTIONS.map((s) => [s, []]));
  for (const f of fields) {
    if (f.confidence >= 0.5 && !f.locked && sections[f.section]) {
      sections[f.section].push(`  ${f.key}: ${f.value}`);
    }
  }
  const lines = [`# ${label} Design System\n`];
  for (const section of CLADE_SECTIONS) {
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
  const node = getCladeNode(db, nodeId);
  const fields = listCladeFields(db, nodeId);
  const history = listCladeHistory(db, nodeId);
  const candidates = listCladeCandidates(db, nodeId);
  return { node, fields, history, candidates };
}

export function promoteCladeCandidate(db, nodeId, candidateId) {
  const candidate = getCladeCandidate(db, candidateId);
  if (!candidate || candidate.nodeId !== nodeId) return null;
  const now = Date.now();
  const existing = getCladeField(db, nodeId, candidate.section, candidate.key);
  upsertCladeField(db, {
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
  insertCladeHistory(db, {
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
  updateCladeCandidateStatus(db, candidateId, 'promoted');
  const health = getCladeHealthScore(db, nodeId);
  return { health };
}

export function rejectCladeCandidate(db, nodeId, candidateId) {
  const candidate = getCladeCandidate(db, candidateId);
  if (!candidate || candidate.nodeId !== nodeId) return null;
  const now = Date.now();
  const existing = getCladeField(db, nodeId, candidate.section, candidate.key);
  // Only zero-and-lock the field when the candidate being rejected IS the current
  // field value. If the user promoted #533afd and is now rejecting a conflicting
  // candidate #ff0000, the accepted field must not be touched.
  if (existing && existing.value === candidate.value) {
    upsertCladeField(db, {
      ...existing,
      confidence: 0.0,
      locked: 1,
      lockCount: 0,
      updatedAt: now,
    });
  }
  insertCladeHistory(db, {
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
  updateCladeCandidateStatus(db, candidateId, 'rejected');
  return { health: getCladeHealthScore(db, nodeId) };
}

/**
 * Called after artifact generation. Writes patterns to clade_candidates
 * (creating or incrementing occurrences), and increments clade_fields
 * confidence for patterns that already exist as confirmed fields.
 */
export function applyExtractedPatterns(db, nodeId, patterns, artifactId = null) {
  const now = Date.now();
  for (const { section, key, value } of patterns) {
    // Find or create candidate
    const existing = findCladeCandidateByPattern(db, nodeId, section, key, value);
    if (existing) {
      incrementCladeCandidateOccurrences(db, existing.id);
    } else {
      upsertCladeCandidate(db, {
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
    const existingField = getCladeField(db, nodeId, section, key);
    if (existingField && existingField.value === value) {
      updateCladeFieldConfidence(db, nodeId, section, key, value, 'extracted');
    }
  }
}

/**
 * Records a user direction pick in clade_history.
 * section='direction', key=philosophy id, new_value encodes school+name,
 * confidence=0.85 per spec (explicit user choice — highest-weight signal).
 */
export function recordDirectionPick(db, nodeId, philosophy) {
  insertCladeHistory(db, {
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
