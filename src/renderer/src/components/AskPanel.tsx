import { useState, useRef, useEffect } from 'react'
import { ChatMessage } from '../types'
import FileLink from './FileLink'

interface AskPanelProps {
  hasKey: boolean
  messages: ChatMessage[]
  isAsking: boolean
  error: string | null
  onAsk: (question: string) => void
  onClear: () => void
  onGoToSettings: () => void
}

// Render assistant text, converting [relative/path.ts:123] citations into
// clickable FileLinks. Same safety constraints as the main-process sanitizeLink:
// relative paths only, no traversal — anything else stays plain text.
function renderWithCitations(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Requires a dot-extension so ordinary bracketed prose ("[sic]") never matches.
  const citation = /\[([^[\]\n]+?\.[A-Za-z0-9]+)(?::(\d+))?\]/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = citation.exec(content)) !== null) {
    const file = match[1].trim()
    const line = match[2] ? parseInt(match[2], 10) : undefined
    const safe =
      !/^([A-Za-z]:)?[\\/]/.test(file) && // relative only (no drive prefix / leading slash)
      !file.split(/[\\/]/).includes('..') // no traversal
    if (!safe) continue // leave the bracketed text as part of the surrounding slice
    nodes.push(content.slice(lastIndex, match.index))
    nodes.push(<FileLink key={`cite-${key++}`} file={file} line={line} showPath />)
    lastIndex = match.index + match[0].length
  }
  nodes.push(content.slice(lastIndex))
  return nodes
}

export default function AskPanel({
  hasKey,
  messages,
  isAsking,
  error,
  onAsk,
  onClear,
  onGoToSettings
}: AskPanelProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest message in view while streaming / on new turns
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = (): void => {
    const q = input.trim()
    if (!q || isAsking) return
    onAsk(q)
    setInput('')
  }

  return (
    <div className="m-3 mt-0 bg-neutral-800 border border-neutral-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-xs font-semibold text-violet-400 hover:text-violet-300 transition cursor-pointer"
        >
          <span>✦ Ask</span>
          <span className="text-sm font-medium text-violet-500">{collapsed ? '+' : '−'}</span>
        </button>
        {hasKey && messages.length > 0 && (
          <button
            onClick={onClear}
            disabled={isAsking}
            className="text-xs px-2 py-0.5 text-neutral-400 hover:text-neutral-200 transition cursor-pointer disabled:opacity-50"
            title="Clear this conversation"
          >
            New chat
          </button>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-3 pb-3">
          {!hasKey && (
            <p className="text-xs text-neutral-400">
              Add your Anthropic key in{' '}
              <button
                onClick={onGoToSettings}
                className="text-violet-400 hover:underline cursor-pointer"
              >
                Settings
              </button>{' '}
              to chat with your project.
            </p>
          )}

          {hasKey && (
            <>
              {/* Conversation */}
              {messages.length === 0 ? (
                <p className="text-xs text-neutral-500 mb-2">
                  Ask about your project — answers are grounded in your tasks and notes.
                </p>
              ) : (
                <div
                  ref={scrollRef}
                  className="max-h-64 overflow-y-auto space-y-2 mb-2 pr-1"
                >
                  {messages.map((m, i) => (
                    <div key={i}>
                      {m.role === 'user' ? (
                        <p className="text-xs text-violet-200 bg-violet-900/40 border border-violet-800/50 rounded px-2 py-1.5 select-text whitespace-pre-wrap">
                          {m.content}
                        </p>
                      ) : m.content === '' && isAsking && i === messages.length - 1 ? (
                        <p className="text-xs text-neutral-500 animate-pulse px-1">Thinking…</p>
                      ) : (
                        <p className="text-xs text-neutral-300 leading-relaxed px-1 select-text whitespace-pre-wrap">
                          {renderWithCitations(m.content)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                  disabled={isAsking}
                  placeholder={isAsking ? 'Answering…' : 'Ask your project…'}
                  className="flex-1 px-2 py-1.5 bg-neutral-700 text-neutral-100 text-xs rounded border border-neutral-600 focus:border-violet-500 focus:outline-none disabled:opacity-60"
                />
                <button
                  onClick={send}
                  disabled={isAsking || !input.trim()}
                  className="text-xs px-2.5 py-1 bg-violet-600 text-white rounded hover:bg-violet-500 transition cursor-pointer disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
