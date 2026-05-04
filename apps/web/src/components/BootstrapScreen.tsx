import { useEffect, useState } from 'react';
import {
  bootstrapSeed,
  fetchDesignSystemList,
  type DesignSystemCard,
} from '../providers/clade-brain';

interface Props {
  projectId: string;
  onComplete: () => void;
}

// Exactly 4 swatch slots; fall back to gray for missing entries.
const SWATCH_FALLBACK = '#e5e7eb';
const SWATCH_COUNT = 4;

function SwatchRow({ swatches }: { swatches: string[] }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: SWATCH_COUNT }).map((_, i) => (
        <span
          key={i}
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: swatches[i] ?? SWATCH_FALLBACK }}
        />
      ))}
    </div>
  );
}

export function BootstrapScreen({ projectId, onComplete }: Props) {
  const [tab, setTab] = useState<'library' | 'extract'>('library');
  const [search, setSearch] = useState('');
  const [systems, setSystems] = useState<DesignSystemCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [brandUrl, setBrandUrl] = useState('');

  useEffect(() => {
    fetchDesignSystemList()
      .then(setSystems)
      .catch(() => setSystems([]));
  }, []);

  const filtered = systems.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleSeedClick(card: DesignSystemCard) {
    setLoading(true);
    setSelectedId(card.id);
    const result = await bootstrapSeed(projectId, card.id);
    if (result === null) {
      // Seeding failed — let the user retry
      setLoading(false);
      setSelectedId(null);
    } else {
      onComplete();
    }
  }

  function handleExtractStart() {
    const url = brandUrl.trim();
    if (!url) return;
    localStorage.setItem(
      `clade_bootstrap_prompt_${projectId}`,
      `Extract brand identity from ${url} using the brand asset protocol`,
    );
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Set up your Clade Brain
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Choose how to seed your brand identity, or skip to start blank.
          </p>
        </div>

        {/* Tab pills */}
        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => setTab('library')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'library'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Start from a library brand
          </button>
          <button
            onClick={() => setTab('extract')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === 'extract'
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Upload your brand assets
          </button>
        </div>

        {/* Tab content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'library' && (
            <>
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand library…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none mb-4"
              />

              {/* Grid with loading overlay */}
              <div className="relative">
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80">
                    <span className="text-sm text-gray-500">Seeding Clade Brain…</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {filtered.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => { void handleSeedClick(card); }}
                      disabled={loading}
                      className={`group flex flex-col gap-2 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-900 transition text-left ${
                        selectedId === card.id ? 'border-gray-900' : ''
                      } disabled:cursor-not-allowed`}
                    >
                      <SwatchRow swatches={card.swatches} />
                      <span className="text-[13px] font-semibold text-gray-900 leading-snug">
                        {card.title}
                      </span>
                      <span className="text-[11px] text-gray-400 leading-snug">
                        {card.category}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'extract' && (
            <div className="flex flex-col gap-4 py-2">
              <p className="text-sm text-gray-600 leading-relaxed">
                Upload a logo, screenshot, or brand PDF — the agent will extract
                your brand identity automatically.
              </p>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Brand URL
                </label>
                <input
                  type="url"
                  value={brandUrl}
                  onChange={(e) => setBrandUrl(e.target.value)}
                  placeholder="https://stripe.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>

              <button
                onClick={handleExtractStart}
                disabled={brandUrl.trim() === ''}
                className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start brand extraction
              </button>

              <p className="text-xs text-gray-400 leading-relaxed">
                This will use your active agent to run the brand extraction. The
                conversation will open automatically.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-3">
          <button
            onClick={onComplete}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Skip — start with empty Clade Brain
          </button>
        </div>
      </div>
    </div>
  );
}
