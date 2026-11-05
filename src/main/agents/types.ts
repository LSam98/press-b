// Agent-session metrics, normalized across agents (Claude Code, Codex).
// Machine-local only: never written to .pressb.json.

export type AgentKind = 'claude' | 'codex'

// Token counts with input split the Anthropic way: `input` is fresh (uncached)
// input only, so input + cacheRead + cacheWrite = everything the model read.
export interface TokenTotals {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

export interface DayTotals extends TokenTotals {
  costUsd: number
}

export interface AgentSession {
  agent: AgentKind
  id: string
  title: string
  cwd: string
  branch?: string
  entrypoint?: string // Claude Code: 'cli', 'claude-desktop', 'claude-vscode', …
  startedAt: number // epoch ms
  lastActiveAt: number
  activeMs: number // time between events, with idle gaps capped
  models: string[]
  prompts: number // prompts the person typed (harness text excluded)
  calls: number // model replies
  tokens: TokenTotals
  costUsd: number | null // estimate from priced calls; null if none could be priced
  unpricedCalls: number // calls whose model has no price (counted in tokens, not cost)
  byDay: Record<string, DayTotals> // local-date key 'YYYY-MM-DD'
  captured?: CapturedTotals // deep capture: what the proxy saw for this session
}

// Requests the proxy saw that the session logs don't show (title writing,
// away recaps, quota checks, web helpers…), added up.
export interface ExtraTotals {
  count: number
  tokens: TokenTotals
  costUsd: number
  unpriced: number
  byLabel: Record<string, { count: number; costUsd: number }>
}

export interface CapturedTotals {
  exchanges: number // every request the proxy forwarded for this session
  extra: ExtraTotals // the part the logs don't show
}

export interface CaptureStatus {
  enabled: boolean // the switch
  active: boolean // the settings file points at the running proxy
  port: number | null
  upstream: string | null // where the proxy forwards to
  settingsFile: string
  since: number | null
  error: string | null
  notes: string[]
}

export interface AgentSummary {
  projectRoot: string
  sessions: AgentSession[] // most recently active first
  updatedAt: number
  capture: CaptureStatus | null
  // Captured requests that couldn't be tied to a session shown here.
  unmatched: CapturedTotals | null
}

export const emptyExtra = (): ExtraTotals => ({
  count: 0,
  tokens: emptyTokens(),
  costUsd: 0,
  unpriced: 0,
  byLabel: {}
})

export const emptyTokens = (): TokenTotals => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
