import type { DirectionOption } from '../providers/daemon';

interface Props {
  directions: DirectionOption[];
  onPick: (id: string) => void;
  onSkip: () => void;
}

export function DirectionPicker({ directions, onPick, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Choose a design direction
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Your brief is open-ended. Pick a direction and the Clade Brain will remember it.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 p-6">
          {directions.map((d) => (
            <button
              key={d.id}
              onClick={() => onPick(d.id)}
              className="group flex flex-col rounded-lg border border-gray-200 p-4 text-left transition hover:border-gray-900 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              <span className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                {d.school}
              </span>
              <span className="text-sm font-semibold text-gray-900 leading-snug">
                {d.name.replace(/[^\x00-\x7F].*$/, '').trim()}
              </span>
              {d.tagline && (
                <span className="mt-1.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {d.tagline}
                </span>
              )}
              <span className="mt-3 line-clamp-3 text-[11px] text-gray-400 leading-relaxed font-mono">
                {d.dnaBlock.split('\n').slice(0, 4).join(' · ')}
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-end border-t border-gray-100 px-6 py-3">
          <button
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Skip — proceed without a direction
          </button>
        </div>
      </div>
    </div>
  );
}
