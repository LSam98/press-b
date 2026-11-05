import { ExchangeSummary } from './capture'
import { ClaudeLogReader } from './claudeLogs'
import { CodexLogReader } from './codexLogs'
import { AgentSession, AgentSummary, CaptureStatus, CapturedTotals, emptyExtra } from './types'

// A main-turn reply normally reaches the session log within seconds. Until this
// long has passed, an unlogged main request is assumed to be on its way.
const LOG_GRACE_MS = 60_000

// One project's log readers, both agents. Stateful: refresh() reads only what
// was appended since the last call, so it is cheap to call on every change.
export class ProjectLogs {
  readonly claude: ClaudeLogReader
  readonly codex: CodexLogReader

  constructor(readonly projectRoot: string) {
    this.claude = new ClaudeLogReader(projectRoot)
    this.codex = new CodexLogReader(projectRoot)
  }

  // Full pass: find new logs, then read everything new.
  async refresh(): Promise<boolean> {
    const [a, b] = await Promise.all([this.claude.discover(), this.codex.discover()])
    const [c, d] = await Promise.all([this.claude.readAll(), this.codex.readAll()])
    return a || b || c || d
  }

  summary(
    capture: CaptureStatus | null = null,
    exchanges: ExchangeSummary[] = [],
    now = Date.now()
  ): AgentSummary {
    const sessions: AgentSession[] = [...this.claude.sessions(), ...this.codex.sessions()]
    const unmatched = attachCaptured(sessions, exchanges, this.claude.replyIds, now)
    sessions.sort((x, y) => y.lastActiveAt - x.lastActiveAt)
    return {
      projectRoot: this.projectRoot,
      sessions,
      updatedAt: now,
      capture,
      unmatched: unmatched.exchanges ? unmatched : null
    }
  }
}

const emptyCaptured = (): CapturedTotals => ({ exchanges: 0, extra: emptyExtra() })

// Join captured requests to their sessions by session id. Only what the logs
// don't already count is added up as "extra", matched exactly by reply id, so
// nothing is ever counted twice. Returns what matched no session shown here.
export function attachCaptured(
  sessions: AgentSession[],
  exchanges: ExchangeSummary[],
  loggedReplyIds: Set<string>,
  now: number
): CapturedTotals {
  const byId = new Map(sessions.filter((s) => s.agent === 'claude').map((s) => [s.id, s]))
  const unmatched = emptyCaptured()
  for (const x of exchanges) {
    const s = x.sessionId ? byId.get(x.sessionId) : undefined
    const into = s ? (s.captured ??= emptyCaptured()) : unmatched
    into.exchanges++
    const t = x.tokens
    if (t.input + t.cacheRead + t.cacheWrite + t.output === 0) continue
    if (x.replyId && loggedReplyIds.has(x.replyId)) continue // already in the log totals
    if (x.kind === 'main' && now - x.t1 < LOG_GRACE_MS) continue // its log line is on the way
    const e = into.extra
    e.count++
    for (const k of ['input', 'cacheRead', 'cacheWrite', 'output'] as const) e.tokens[k] += t[k]
    const label = x.kind === 'main' ? 'Unlogged agent turn' : x.label || 'Side request'
    const l = (e.byLabel[label] ??= { count: 0, costUsd: 0 })
    l.count++
    if (x.costUsd === null) e.unpriced++
    else {
      e.costUsd += x.costUsd
      l.costUsd += x.costUsd
    }
  }
  return unmatched
}
