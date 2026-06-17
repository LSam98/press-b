import { Suggestion, SuggestionLens } from '../types'

interface SuggestionsPanelProps {
  hasKey: boolean
  suggestions: Suggestion[] | null
  isSuggesting: boolean
  error: string | null
  onGenerate: () => void
  onAccept: (s: Suggestion) => void
  onDismiss: (s: Suggestion) => void
  onGoToSettings: () => void
}

const LENS_LABEL: Record<SuggestionLens, string> = {
  'next-step': 'Next step',
  'code-quality': 'Code quality',
  'missing-tests': 'Missing tests',
  architecture: 'Architecture'
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-400',
  medium: 'text-amber-400',
  low: 'text-neutral-500'
}

function SuggestionCard({
  suggestion,
  onAccept,
  onDismiss
}: {
  suggestion: Suggestion
  onAccept: (s: Suggestion) => void
  onDismiss: (s: Suggestion) => void
}): React.JSX.Element {
  return (
    <div className="border border-amber-500/30 bg-neutral-800/60 rounded p-2.5 mb-2">
      {/* Badges */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
          {LENS_LABEL[suggestion.lens] || suggestion.lens}
        </span>
        <span className="text-[10px] text-neutral-500">
          {suggestion.taskType} · {suggestion.priority}
        </span>
        <span className={`text-[10px] ml-auto ${CONFIDENCE_COLOR[suggestion.confidence]}`}>
          {suggestion.confidence} confidence
        </span>
      </div>

      {/* Proposed task */}
      <p className="text-xs font-medium text-neutral-100 select-text">{suggestion.title}</p>
      {suggestion.body && (
        <p className="text-xs text-neutral-400 mt-0.5 select-text">{suggestion.body}</p>
      )}

      {/* Why */}
      <p className="text-[11px] text-neutral-500 italic mt-1.5 select-text">
        {suggestion.reasoning}
      </p>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onAccept(suggestion)}
          className="text-xs px-2 py-0.5 bg-amber-500 text-neutral-900 font-medium rounded hover:bg-amber-400 transition cursor-pointer"
        >
          Accept → task
        </button>
        <button
          onClick={() => onDismiss(suggestion)}
          className="text-xs px-2 py-0.5 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function SuggestionsPanel({
  hasKey,
  suggestions,
  isSuggesting,
  error,
  onGenerate,
  onAccept,
  onDismiss,
  onGoToSettings
}: SuggestionsPanelProps): React.JSX.Element {
  return (
    <div className="m-3 mt-0 bg-neutral-800 border border-neutral-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-amber-400">✦ Suggestions</span>
        {hasKey && (
          <button
            onClick={onGenerate}
            disabled={isSuggesting}
            className="text-xs px-2 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-500 transition cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {isSuggesting ? 'Thinking…' : suggestions ? 'Refresh' : 'Get suggestions'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pb-3">
        {!hasKey && (
          <p className="text-xs text-neutral-400">
            Add your Anthropic key in{' '}
            <button onClick={onGoToSettings} className="text-amber-400 hover:underline cursor-pointer">
              Settings
            </button>{' '}
            to get task suggestions.
          </p>
        )}

        {hasKey && error && <p className="text-xs text-red-400">{error}</p>}

        {hasKey && !error && isSuggesting && (
          <p className="text-xs text-neutral-500 animate-pulse">Looking for high-signal ideas…</p>
        )}

        {/* Not generated yet this session */}
        {hasKey && !error && !isSuggesting && suggestions === null && (
          <p className="text-xs text-neutral-500">
            Pull suggestions when you want a second pair of eyes. Nothing runs until you ask.
          </p>
        )}

        {/* Generated, but the model had nothing sharp to add — a good outcome */}
        {hasKey && !error && !isSuggesting && suggestions?.length === 0 && (
          <p className="text-xs text-neutral-400">
            Nothing worth flagging right now — you&apos;re on track. ✓
          </p>
        )}

        {/* Suggestion cards */}
        {hasKey &&
          !error &&
          !isSuggesting &&
          suggestions?.map((s, i) => (
            <SuggestionCard key={`${s.title}-${i}`} suggestion={s} onAccept={onAccept} onDismiss={onDismiss} />
          ))}
      </div>
    </div>
  )
}
