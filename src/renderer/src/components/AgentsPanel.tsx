import { useState } from 'react'
import { AgentSession, AgentSummary, AgentTokenTotals } from '../types'

interface AgentsPanelProps {
  summary: AgentSummary | null
  loading: boolean
  now: number
}

const LIVE_MS = 2 * 60 * 1000 // a log written in the last 2 minutes = working now
const RECENT_LIMIT = 8

const ZERO: AgentTokenTotals = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }

function addTokens(a: AgentTokenTotals, b: AgentTokenTotals): AgentTokenTotals {
  return {
    input: a.input + b.input,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output
  }
}

const totalTokens = (t: AgentTokenTotals): number => t.input + t.cacheRead + t.cacheWrite + t.output

// Share of what the model read that came from cache (null when nothing was read).
function cacheShare(t: AgentTokenTotals): number | null {
  const read = t.input + t.cacheRead + t.cacheWrite
  return read ? t.cacheRead / read : null
}

function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

function fmtPct(x: number | null): string {
  return x === null ? '–' : `${Math.round(x * 100)}%`
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}m`
}

function fmtAgo(ms: number, now: number): string {
  const mins = Math.floor((now - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const SURFACES: Record<string, string> = {
  cli: 'Terminal',
  'claude-desktop': 'Desktop app',
  'claude-vscode': 'VS Code',
  vscode_agent_host: 'VS Code',
  codex_cli_rs: 'Terminal'
}

// Sum tokens over the given calendar days across all sessions.
function periodTotals(sessions: AgentSession[], days: Set<string>): AgentTokenTotals {
  let t = ZERO
  for (const s of sessions) {
    for (const [day, d] of Object.entries(s.byDay)) if (days.has(day)) t = addTokens(t, d)
  }
  return t
}

function AgentBadge({ agent }: { agent: AgentSession['agent'] }): React.JSX.Element {
  return agent === 'claude' ? (
    <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-semibold bg-orange-900/50 text-orange-300 border border-orange-800/60">
      Claude
    </span>
  ) : (
    <span className="shrink-0 px-1.5 py-px rounded text-[10px] font-semibold bg-neutral-700 text-neutral-200 border border-neutral-600">
      Codex
    </span>
  )
}

function StatCard({
  label,
  tokens,
  hint
}: {
  label: string
  tokens: AgentTokenTotals
  hint: string
}): React.JSX.Element {
  const share = cacheShare(tokens)
  return (
    <div className="flex-1 p-2.5 bg-neutral-800 border border-neutral-700 rounded" title={hint}>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-base font-semibold text-neutral-100">
        {fmtTokens(totalTokens(tokens))}
      </div>
      <div className="text-[11px] text-neutral-400">tokens</div>
      <div className="mt-1.5 h-1 bg-neutral-700 rounded overflow-hidden">
        <div className="h-full bg-sky-500" style={{ width: `${(share ?? 0) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-sky-300">{fmtPct(share)} from cache</div>
    </div>
  )
}

function SessionRow({ s, now }: { s: AgentSession; now: number }): React.JSX.Element {
  const live = now - s.lastActiveAt < LIVE_MS
  const surface = s.entrypoint ? SURFACES[s.entrypoint] || s.entrypoint : null
  return (
    <li className="px-3 py-2 border-b border-neutral-800 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <AgentBadge agent={s.agent} />
        <span className="truncate text-xs text-neutral-200" title={s.title}>
          {s.title}
        </span>
        <span
          className={`ml-auto shrink-0 text-[11px] ${live ? 'text-emerald-400' : 'text-neutral-500'}`}
          title={new Date(s.lastActiveAt).toLocaleString()}
        >
          {live ? '● working now' : fmtAgo(s.lastActiveAt, now)}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-500">
        <span title="Prompts you typed (text the tool adds on its own is not counted)">
          {s.prompts} {s.prompts === 1 ? 'prompt' : 'prompts'}
        </span>
        {' · '}
        <span title="Time between events, with breaks longer than 5 minutes left out">
          {fmtDuration(s.activeMs)} active
        </span>
        {' · '}
        <span title="Everything the model read and wrote in this session">
          {fmtTokens(totalTokens(s.tokens))} tokens
        </span>
        {' · '}
        <span title="Share of what the model read that came from cache">
          {fmtPct(cacheShare(s.tokens))} cache
        </span>
        {surface && <span className="text-neutral-600"> · {surface}</span>}
      </div>
    </li>
  )
}

// The Agents tab: a compact pulse of the agent sessions (Claude Code, Codex)
// working on this project, read from their own logs. Read-only, no AI calls.
export default function AgentsPanel({
  summary,
  loading,
  now
}: AgentsPanelProps): React.JSX.Element {
  const [showHelp, setShowHelp] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (!summary) {
    return (
      <div className="p-4 text-xs text-neutral-500">
        {loading ? 'Reading agent session logs…' : 'Open a project to see its agent sessions.'}
      </div>
    )
  }

  const sessions = summary.sessions
  const today = new Set([dayKey(now)])
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86_400_000)))
  const live = sessions.filter((s) => now - s.lastActiveAt < LIVE_MS)
  const shown = showAll ? sessions : sessions.slice(0, RECENT_LIMIT)

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-xs font-semibold text-sky-400">◉ Agent sessions</span>
        <button
          onClick={() => setShowHelp((h) => !h)}
          title="What these numbers mean"
          className="text-[11px] px-1.5 py-px rounded border border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 transition cursor-pointer"
        >
          ? Guide
        </button>
      </div>

      {showHelp && (
        <div className="mx-3 mt-2 p-2.5 bg-neutral-800/70 border border-dashed border-neutral-600 rounded text-[11px] leading-relaxed text-neutral-400 space-y-1">
          <p>
            Press B reads the session logs that Claude Code and Codex already keep on this computer,
            for every session working inside this project. Nothing to set up, nothing is sent
            anywhere, and it makes no AI calls.
          </p>
          <p>
            <span className="text-neutral-200">Tokens</span>: everything the model read and wrote.{' '}
            <span className="text-sky-300">From cache</span>: the share of what it read that was
            reused from earlier requests, which is much cheaper and faster.
          </p>
          <p>
            <span className="text-neutral-200">Prompts</span> count only what you typed.{' '}
            <span className="text-neutral-200">Active</span> time leaves out breaks over 5 minutes.
          </p>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="m-3 p-3 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-400 leading-relaxed">
          No agent sessions for this project yet. Start Claude Code or Codex inside this folder and
          they show up here on their own.
        </div>
      ) : (
        <>
          {/* Today / this week */}
          <div className="flex gap-2 px-3 pt-3">
            <StatCard
              label="Today"
              tokens={periodTotals(sessions, today)}
              hint="All agent sessions on this project, today"
            />
            <StatCard
              label="Last 7 days"
              tokens={periodTotals(sessions, week)}
              hint="All agent sessions on this project, the last 7 days"
            />
          </div>

          {/* Activity */}
          <div className="px-3 pt-3 text-[11px] text-neutral-400">
            {live.length > 0 ? (
              <span className="text-emerald-400">
                ● {live.length} {live.length === 1 ? 'session' : 'sessions'} working now
              </span>
            ) : (
              <span>No session working right now.</span>
            )}
          </div>

          <div className="mx-3 mt-2 mb-3 bg-neutral-900 border border-neutral-700 rounded">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-neutral-500 border-b border-neutral-800">
              Recent sessions ({sessions.length})
            </div>
            <ul>
              {shown.map((s) => (
                <SessionRow key={`${s.agent}:${s.id}`} s={s} now={now} />
              ))}
            </ul>
            {sessions.length > RECENT_LIMIT && (
              <button
                onClick={() => setShowAll((v) => !v)}
                title={showAll ? 'Show only the most recent sessions' : 'Show every session'}
                className="w-full px-3 py-1.5 text-[11px] text-sky-400 hover:text-sky-300 border-t border-neutral-800 cursor-pointer"
              >
                {showAll ? 'Show fewer' : `Show all ${sessions.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
