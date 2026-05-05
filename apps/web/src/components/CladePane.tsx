import { useCallback, useEffect, useState } from 'react';
import {
  fetchCladeHealth,
  fetchCladeCandidates,
  fetchCladeHistory,
  promoteCladeCandidate,
  rejectCladeCandidate,
  type CladeCandidate,
  type CladeHistoryEntry,
} from '../providers/clade-brain';

// ------------------------------------------------------------------ types
type Tab = 'hierarchy' | 'candidates' | 'history';

interface Props {
  projectId: string;
  projectName: string;
  // Bumped by the parent when external state may have changed
  // (e.g., after BootstrapScreen completes a seed). The pane re-fetches
  // its data whenever this value changes.
  refreshKey?: number;
}

// ------------------------------------------------------------------ helpers
function healthClass(score: number): 'red' | 'amber' | 'green' {
  if (score >= 75) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function actionPillClass(action: string): string {
  if (action === 'promote') return 'promote';
  if (action === 'reject') return 'reject';
  if (action === 'extract') return 'extract';
  if (action === 'direction_pick') return 'direction_pick';
  return 'default';
}

// ------------------------------------------------------------------ sub-tabs

type Pipeline = 'local' | 'cloud' | 'ask';

function HierarchyTab({
  health,
  projectName,
  projectId,
}: {
  health: number;
  projectName: string;
  projectId: string;
}) {
  const cls = healthClass(health);
  const [pipeline, setPipeline] = useState<Pipeline>('ask');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/clade/${encodeURIComponent(projectId)}/animation-pipeline`)
      .then((r) => r.json())
      .then((d: { pipeline: Pipeline }) => setPipeline(d.pipeline))
      .catch(() => {});
  }, [projectId]);

  const handlePipelineChange = async (value: Pipeline) => {
    setSaving(true);
    try {
      await fetch(`/api/clade/${encodeURIComponent(projectId)}/animation-pipeline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline: value }),
      });
      setPipeline(value);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="brand-pane-body">
      <div className="brand-node-card">
        <div className="brand-node-name">{projectName}</div>
        <span className={`health-badge ${cls}`}>
          <span className="health-dot" />
          {health}
        </span>
      </div>

      <div style={{ padding: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-soft)' }}>
          Animation pipeline
        </span>
        <select
          value={pipeline}
          disabled={saving}
          onChange={(e) => void handlePipelineChange(e.target.value as Pipeline)}
          style={{ fontSize: 12.5 }}
        >
          <option value="ask">Ask each time</option>
          <option value="local">Local (Huashu · free)</option>
          <option value="cloud">Cloud (Seedance / HyperFrames)</option>
        </select>
      </div>

      {health === 0 && (
        <div className="brand-pane-empty">
          Generate artifacts to start building your brand.
        </div>
      )}
    </div>
  );
}

function CandidatesTab({
  projectId,
  candidates,
  onRefresh,
}: {
  projectId: string;
  candidates: CladeCandidate[];
  onRefresh: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);

  const handlePromote = useCallback(
    async (id: string) => {
      setActing(id);
      await promoteCladeCandidate(projectId, id);
      setActing(null);
      onRefresh();
    },
    [projectId, onRefresh],
  );

  const handleReject = useCallback(
    async (id: string) => {
      setActing(id);
      await rejectCladeCandidate(projectId, id);
      setActing(null);
      onRefresh();
    },
    [projectId, onRefresh],
  );

  if (candidates.length === 0) {
    return (
      <div className="brand-pane-body">
        <div className="brand-pane-empty">
          No candidates yet. Patterns appear here after 3+ occurrences.
        </div>
      </div>
    );
  }

  return (
    <div className="brand-pane-body">
      {candidates.map((c) => (
        <div key={c.id} className="candidate-row">
          <div className="candidate-row-header">
            <span className="candidate-section">{c.section}</span>
            <span className="candidate-key">{c.key}</span>
            <span className="candidate-occurrences">×{c.occurrences}</span>
          </div>
          <div className="candidate-value">{c.value}</div>
          <div className="candidate-actions">
            <button
              className="primary"
              disabled={acting === c.id}
              onClick={() => void handlePromote(c.id)}
            >
              Promote
            </button>
            <button
              className="ghost"
              disabled={acting === c.id}
              onClick={() => void handleReject(c.id)}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ history }: { history: CladeHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="brand-pane-body">
        <div className="brand-pane-empty">No history yet.</div>
      </div>
    );
  }

  return (
    <div className="brand-pane-body">
      {history.map((h) => (
        <div key={h.id} className="history-row">
          <div className="history-row-meta">
            <span className={`history-action-pill ${actionPillClass(h.action)}`}>
              {h.action.replace('_', ' ')}
            </span>
            <span className="history-row-key">
              {h.section} · {h.key}
            </span>
            <span className="history-row-ts">{timeAgo(h.createdAt)}</span>
          </div>
          <div className="history-row-value">{h.newValue}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ main
export function CladePane({ projectId, projectName, refreshKey = 0 }: Props) {
  const [tab, setTab] = useState<Tab>('hierarchy');
  const [health, setHealth] = useState(0);
  const [candidates, setCandidates] = useState<CladeCandidate[]>([]);
  const [history, setHistory] = useState<CladeHistoryEntry[]>([]);

  const refresh = useCallback(async () => {
    const [h, c, hist] = await Promise.all([
      fetchCladeHealth(projectId),
      fetchCladeCandidates(projectId),
      fetchCladeHistory(projectId),
    ]);
    setHealth(h.health);
    setCandidates(c);
    setHistory(hist);
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const pendingCount = candidates.filter((c) => c.status === 'pending').length;

  return (
    <aside className="brand-pane">
      <div className="brand-pane-tabs">
        <button
          className={`brand-pane-tab${tab === 'hierarchy' ? ' active' : ''}`}
          onClick={() => setTab('hierarchy')}
        >
          Clade Brain
        </button>
        <button
          className={`brand-pane-tab${tab === 'candidates' ? ' active' : ''}`}
          onClick={() => setTab('candidates')}
        >
          Queue
          {pendingCount > 0 && <span className="tab-badge">{pendingCount}</span>}
        </button>
        <button
          className={`brand-pane-tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {tab === 'hierarchy' && (
        <HierarchyTab health={health} projectName={projectName} projectId={projectId} />
      )}
      {tab === 'candidates' && (
        <CandidatesTab
          projectId={projectId}
          candidates={candidates}
          onRefresh={() => void refresh()}
        />
      )}
      {tab === 'history' && <HistoryTab history={history} />}
    </aside>
  );
}
