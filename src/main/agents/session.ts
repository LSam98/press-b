import * as fs from 'fs'
import * as path from 'path'
import { AgentKind, AgentSession, DayTotals, TokenTotals, emptyTokens } from './types'

// Gaps longer than this count as idle, not as working time.
const IDLE_CAP_MS = 5 * 60 * 1000

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const p = (x: number): string => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Case-insensitive "is `p` the project root or inside it" (Windows paths).
export function isInside(p: string | undefined, root: string): boolean {
  if (!p) return false
  const a = path.resolve(p).toLowerCase()
  const r = path.resolve(root).toLowerCase()
  return a === r || a.startsWith(r.endsWith(path.sep) ? r : r + path.sep)
}

interface Call {
  day: string
  tokens: TokenTotals
  cost: number | null
}

// Builds one AgentSession from a stream of events. Calls are keyed so a reply
// logged several times (Claude Code logs one line per content block, each with
// the same usage) is counted once: a repeat replaces the earlier entry.
export class SessionAcc {
  private readonly callsById = new Map<string, Call>()
  private readonly modelSet = new Set<string>()
  private lastTs = 0
  title = ''
  titleIsCustom = false
  firstPrompt = ''
  cwd = ''
  model = '' // current model, for agents that log it apart from each reply (Codex)
  branch?: string
  entrypoint?: string
  startedAt = 0
  lastActiveAt = 0
  activeMs = 0
  prompts = 0

  constructor(
    readonly agent: AgentKind,
    readonly id: string
  ) {}

  // Timestamps from the main log, in order. Builds start/last/active time.
  touch(ts: number): void {
    if (!Number.isFinite(ts) || ts <= 0) return
    if (!this.startedAt || ts < this.startedAt) this.startedAt = ts
    if (ts > this.lastActiveAt) this.lastActiveAt = ts
    if (this.lastTs && ts > this.lastTs) this.activeMs += Math.min(ts - this.lastTs, IDLE_CAP_MS)
    if (ts > this.lastTs) this.lastTs = ts
  }

  // Timestamps from side logs (subagents): extend the range, no active time.
  extend(ts: number): void {
    if (!Number.isFinite(ts) || ts <= 0) return
    if (!this.startedAt || ts < this.startedAt) this.startedAt = ts
    if (ts > this.lastActiveAt) this.lastActiveAt = ts
  }

  private lastPrompt = ''

  // A retried prompt is logged again with identical text: count it once.
  addPrompt(text: string): void {
    if (text === this.lastPrompt) return
    this.lastPrompt = text
    this.prompts++
    if (!this.firstPrompt) this.firstPrompt = text
  }

  addCall(key: string, ts: number, model: string, tokens: TokenTotals, cost: number | null): void {
    if (model) this.modelSet.add(model)
    this.callsById.set(key, { day: dayKey(ts || Date.now()), tokens, cost })
  }

  toSession(): AgentSession {
    const tokens = emptyTokens()
    const byDay: Record<string, DayTotals> = {}
    let cost = 0
    let priced = 0
    let unpriced = 0
    for (const c of this.callsById.values()) {
      const d = (byDay[c.day] ??= { ...emptyTokens(), costUsd: 0 })
      for (const k of ['input', 'cacheRead', 'cacheWrite', 'output'] as const) {
        tokens[k] += c.tokens[k]
        d[k] += c.tokens[k]
      }
      if (c.cost === null) unpriced++
      else {
        priced++
        cost += c.cost
        d.costUsd += c.cost
      }
    }
    const fallback = this.firstPrompt.split('\n')[0].trim()
    return {
      agent: this.agent,
      id: this.id,
      title:
        this.title ||
        (fallback.length > 60 ? fallback.slice(0, 59) + '…' : fallback) ||
        'Untitled session',
      cwd: this.cwd,
      branch: this.branch,
      entrypoint: this.entrypoint,
      startedAt: this.startedAt,
      lastActiveAt: this.lastActiveAt,
      activeMs: this.activeMs,
      models: [...this.modelSet],
      prompts: this.prompts,
      calls: this.callsById.size,
      tokens,
      costUsd: priced ? cost : null,
      unpricedCalls: unpriced,
      byDay
    }
  }
}

// Fold a helper session (e.g. a Codex approval reviewer) into the session it
// served: its tokens and cost count, its text is never "your prompts".
export function mergeHelper(target: AgentSession, helper: AgentSession): void {
  for (const k of ['input', 'cacheRead', 'cacheWrite', 'output'] as const) {
    target.tokens[k] += helper.tokens[k]
  }
  for (const [day, d] of Object.entries(helper.byDay)) {
    const t = (target.byDay[day] ??= { ...emptyTokens(), costUsd: 0 })
    for (const k of ['input', 'cacheRead', 'cacheWrite', 'output', 'costUsd'] as const) t[k] += d[k]
  }
  target.calls += helper.calls
  target.unpricedCalls += helper.unpricedCalls
  if (helper.costUsd !== null) target.costUsd = (target.costUsd ?? 0) + helper.costUsd
  for (const m of helper.models) if (!target.models.includes(m)) target.models.push(m)
  target.lastActiveAt = Math.max(target.lastActiveAt, helper.lastActiveAt)
}

// Reads a growing JSONL file incrementally: each call returns only the complete
// lines appended since the last call. The offset only advances past the last
// newline, so a half-written line (or a split UTF-8 character) is simply read
// again next time. If the file shrank (rewritten), reading restarts from 0.
export class JsonlTail {
  private offset = 0

  constructor(readonly file: string) {}

  async readNew(): Promise<unknown[]> {
    let handle: fs.promises.FileHandle | null = null
    try {
      const { size } = await fs.promises.stat(this.file)
      if (size < this.offset) this.offset = 0
      if (size === this.offset) return []
      handle = await fs.promises.open(this.file, 'r')
      const buf = Buffer.alloc(size - this.offset)
      const { bytesRead } = await handle.read(buf, 0, buf.length, this.offset)
      const end = buf.subarray(0, bytesRead).lastIndexOf(0x0a)
      if (end < 0) return []
      this.offset += end + 1
      const lines = buf.subarray(0, end).toString('utf8').split('\n')
      const out: unknown[] = []
      for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        try {
          out.push(JSON.parse(t))
        } catch {
          // a corrupt line is skipped, never fatal
        }
      }
      return out
    } catch {
      return [] // file vanished or unreadable: treat as nothing new
    } finally {
      await handle?.close()
    }
  }
}
