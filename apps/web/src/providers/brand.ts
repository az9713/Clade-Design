export interface BrandHealth {
  health: number;
}

export interface BrandCandidate {
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

export interface BrandHistoryEntry {
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

export async function fetchBrandHealth(projectId: string): Promise<BrandHealth> {
  try {
    const r = await fetch(`/api/brand/${encodeURIComponent(projectId)}/health`);
    if (!r.ok) return { health: 0 };
    return (await r.json()) as BrandHealth;
  } catch {
    return { health: 0 };
  }
}

export async function fetchBrandCandidates(projectId: string): Promise<BrandCandidate[]> {
  try {
    const r = await fetch(`/api/brand/${encodeURIComponent(projectId)}/candidates`);
    if (!r.ok) return [];
    return (await r.json()) as BrandCandidate[];
  } catch {
    return [];
  }
}

export async function fetchBrandHistory(projectId: string): Promise<BrandHistoryEntry[]> {
  try {
    const r = await fetch(`/api/brand/${encodeURIComponent(projectId)}/history`);
    if (!r.ok) return [];
    return (await r.json()) as BrandHistoryEntry[];
  } catch {
    return [];
  }
}

export async function promoteBrandCandidate(
  projectId: string,
  candidateId: string,
): Promise<{ health: number } | null> {
  try {
    const r = await fetch(
      `/api/brand/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(candidateId)}`,
      { method: 'POST' },
    );
    if (!r.ok) return null;
    return (await r.json()) as { health: number };
  } catch {
    return null;
  }
}

export async function rejectBrandCandidate(
  projectId: string,
  candidateId: string,
): Promise<{ health: number } | null> {
  try {
    const r = await fetch(
      `/api/brand/${encodeURIComponent(projectId)}/reject/${encodeURIComponent(candidateId)}`,
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
      `/api/brand/${encodeURIComponent(projectId)}/bootstrap/seed`,
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
