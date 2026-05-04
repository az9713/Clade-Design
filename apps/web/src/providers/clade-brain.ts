export interface CladeHealth {
  health: number;
}

export interface CladeCandidate {
  id: string;
  nodeId: string;
  section: string;
  key: string;
  value: string;
  occurrences: number;
  status: string;
  artifactId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CladeHistoryEntry {
  id: string;
  nodeId: string;
  section: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  confidence: number | null;
  action: string;
  artifactId: string | null;
  createdAt: number;
}

export async function fetchCladeHealth(projectId: string): Promise<CladeHealth> {
  try {
    const r = await fetch(`/api/clade/${encodeURIComponent(projectId)}/health`);
    if (!r.ok) return { health: 0 };
    return (await r.json()) as CladeHealth;
  } catch {
    return { health: 0 };
  }
}

export async function fetchCladeCandidates(projectId: string): Promise<CladeCandidate[]> {
  try {
    const r = await fetch(`/api/clade/${encodeURIComponent(projectId)}/candidates`);
    if (!r.ok) return [];
    return (await r.json()) as CladeCandidate[];
  } catch {
    return [];
  }
}

export async function fetchCladeHistory(projectId: string): Promise<CladeHistoryEntry[]> {
  try {
    const r = await fetch(`/api/clade/${encodeURIComponent(projectId)}/history`);
    if (!r.ok) return [];
    return (await r.json()) as CladeHistoryEntry[];
  } catch {
    return [];
  }
}

export async function promoteCladeCandidate(
  projectId: string,
  candidateId: string,
): Promise<{ health: number } | null> {
  try {
    const r = await fetch(
      `/api/clade/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(candidateId)}`,
      { method: 'POST' },
    );
    if (!r.ok) return null;
    return (await r.json()) as { health: number };
  } catch {
    return null;
  }
}

export async function rejectCladeCandidate(
  projectId: string,
  candidateId: string,
): Promise<{ health: number } | null> {
  try {
    const r = await fetch(
      `/api/clade/${encodeURIComponent(projectId)}/reject/${encodeURIComponent(candidateId)}`,
      { method: 'POST' },
    );
    if (!r.ok) return null;
    return (await r.json()) as { health: number };
  } catch {
    return null;
  }
}

export interface DesignSystemCard {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[]; // up to 4 hex strings
}

export async function fetchDesignSystemList(): Promise<DesignSystemCard[]> {
  try {
    const r = await fetch('/api/design-systems');
    if (!r.ok) return [];
    const data = (await r.json()) as { designSystems: DesignSystemCard[] };
    return data.designSystems ?? [];
  } catch {
    return [];
  }
}

export async function bootstrapSeed(
  projectId: string,
  designSystemId: string,
): Promise<{ health: number } | null> {
  try {
    const r = await fetch(
      `/api/clade/${encodeURIComponent(projectId)}/bootstrap/seed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId }),
      },
    );
    if (!r.ok) return null;
    return (await r.json()) as { health: number };
  } catch {
    return null;
  }
}
