import { useState } from 'react'

interface ReentryBriefProps {
  hasKey: boolean
  brief: string | null
  generatedAt: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onGoToSettings: () => void
}

// "just now" / "5m ago" / "3h ago" / "2d ago"
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ReentryBrief({
  hasKey,
  brief,
  generatedAt,
  isGenerating,
  error,
  onGenerate,
  onGoToSettings
}: ReentryBriefProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  // No key configured — gentle nudge to Settings.
  if (!hasKey) {
    return (
      <div className="m-3 p-3 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-400">
        <span className="text-teal-400">✦ Re-Entry Brief</span> — add your Anthropic key in{' '}
        <button onClick={onGoToSettings} className="text-blue-400 hover:underline cursor-pointer">
          Settings
        </button>{' '}
        to get a session re-entry summary.
      </div>
    )
  }

  return (
    <div className="m-3 bg-neutral-800 border border-neutral-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-800">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 transition cursor-pointer"
        >
          <span>✦ Re-Entry Brief</span>
          <span className="text-sm font-medium text-teal-500">{collapsed ? '+' : '−'}</span>
        </button>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="text-xs px-2 py-0.5 bg-teal-700 text-white rounded hover:bg-teal-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
        >
          {isGenerating ? 'Generating…' : brief ? 'Regenerate' : 'Generate brief'}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-3 pb-3">
          {error && <p className="text-xs text-red-400">{error}</p>}

          {!error && isGenerating && (
            <p className="text-xs text-neutral-500 animate-pulse">Reading your project…</p>
          )}

          {!error && !isGenerating && brief && (
            <>
              <p className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed select-text">
                {brief}
              </p>
              {generatedAt && (
                <p className="text-[10px] text-neutral-600 mt-2">
                  Generated {relativeTime(generatedAt)} · regenerate to refresh
                </p>
              )}
            </>
          )}

          {!error && !isGenerating && !brief && (
            <p className="text-xs text-neutral-500">
              Click <span className="text-neutral-400">Generate brief</span> to summarize where you
              left off.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
