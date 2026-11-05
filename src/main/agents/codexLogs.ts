/* eslint-disable @typescript-eslint/no-explicit-any -- these parse untyped JSON
   written by other tools; every field is checked before it is used. */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { isInside, JsonlTail, mergeHelper, SessionAcc } from './session'
import { AgentSession } from './types'

// Codex keeps one "rollout" JSONL per session under
// ~/.codex/sessions/YYYY/MM/DD/. Its first line (session_meta) names the cwd.
// Codex token counts follow the OpenAI convention: input_tokens INCLUDES the
// cached part, so fresh input = input - cached.

export function codexSessionsDir(): string {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return path.join(base, 'sessions')
}

const LEADING_TAG = /^<[A-Za-z][\w:-]*[\s>/]/
const FIRST_LINE_CAP = 4 * 1024 * 1024 // session_meta carries the base instructions

// Read just the first line of a file (in chunks, capped).
async function readFirstLine(file: string): Promise<string | null> {
  let handle: fs.promises.FileHandle | null = null
  try {
    handle = await fs.promises.open(file, 'r')
    const chunks: Buffer[] = []
    let total = 0
    while (total < FIRST_LINE_CAP) {
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await handle.read(buf, 0, buf.length, total)
      if (!bytesRead) break
      const nl = buf.subarray(0, bytesRead).indexOf(0x0a)
      if (nl >= 0) {
        chunks.push(buf.subarray(0, nl))
        return Buffer.concat(chunks).toString('utf8')
      }
      chunks.push(buf.subarray(0, bytesRead))
      total += bytesRead
    }
    return null // no complete first line yet
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export class CodexLogReader {
  // file -> cwd from session_meta ('' = checked, not ours; missing = not checked yet)
  private readonly cwdOf = new Map<string, string>()
  private readonly tails = new Map<string, JsonlTail>()
  private readonly accs = new Map<string, SessionAcc>()
  // Rollouts Codex runs on its own behalf (session_meta.source.subagent, e.g.
  // the "guardian" approval reviewer). Folded into the main session they served.
  private readonly helpers = new Set<string>()

  constructor(readonly projectRoot: string) {}

  watchDir(): string {
    return codexSessionsDir()
  }

  // Find rollouts whose cwd is inside the project. Returns true if any were added.
  async discover(): Promise<boolean> {
    let files: string[] = []
    try {
      const names = await fs.promises.readdir(codexSessionsDir(), { recursive: true })
      files = names
        .map((x) => String(x))
        .filter((x) => x.endsWith('.jsonl'))
        .map((x) => path.join(codexSessionsDir(), x))
    } catch {
      return false // no Codex on this machine
    }
    let added = false
    for (const f of files) added = (await this.consider(f)) || added
    return added
  }

  async consider(file: string): Promise<boolean> {
    if (this.cwdOf.has(file)) return false
    const first = await readFirstLine(file)
    if (first === null) return false // retry on the next change
    let cwd = ''
    try {
      const o = JSON.parse(first)
      if (o?.type === 'session_meta') cwd = String(o.payload?.cwd || '')
    } catch {
      // not a rollout we understand
    }
    const ours = isInside(cwd, this.projectRoot)
    this.cwdOf.set(file, ours ? cwd : '')
    if (ours) this.tails.set(file, new JsonlTail(file))
    return ours
  }

  isTracked(file: string): boolean {
    return this.tails.has(file)
  }

  async readAll(): Promise<boolean> {
    let changed = false
    for (const file of this.tails.keys()) changed = (await this.readFile(file)) || changed
    return changed
  }

  async readFile(file: string): Promise<boolean> {
    const tail = this.tails.get(file)
    if (!tail) return false
    const lines = (await tail.readNew()) as Record<string, any>[]
    if (!lines.length) return false
    let acc = this.accs.get(file)
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue
      const t = typeof line.timestamp === 'string' ? Date.parse(line.timestamp) : NaN
      const p = line.payload ?? {}
      if (line.type === 'session_meta') {
        acc = new SessionAcc('codex', String(p.id || p.session_id || path.basename(file, '.jsonl')))
        acc.cwd = String(p.cwd || '')
        if (p.originator) acc.entrypoint = String(p.originator)
        if (p.git?.branch) acc.branch = String(p.git.branch)
        if (p.source && typeof p.source === 'object' && p.source.subagent) this.helpers.add(file)
        this.accs.set(file, acc)
      }
      if (!acc) continue
      acc.touch(t)
      if (line.type === 'turn_context' && p.model) acc.model = String(p.model)
      if (line.type !== 'event_msg') continue
      if (p.type === 'thread_settings_applied' && p.thread_settings?.model) {
        acc.model = String(p.thread_settings.model)
      } else if (p.type === 'item_completed' && p.item?.type === 'UserMessage') {
        const text = (Array.isArray(p.item.content) ? p.item.content : [])
          .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
          .join('\n')
          .trim()
        if (text && !LEADING_TAG.test(text) && !this.helpers.has(file)) acc.addPrompt(text)
      } else if (p.type === 'token_count' && p.info?.last_token_usage) {
        const last = p.info.last_token_usage
        const cached = n(last.cached_input_tokens)
        // The running total changes only when a new reply was counted, so it
        // identifies the reply (token_count also fires for rate-limit updates).
        const key = `tc:${n(p.info.total_token_usage?.total_tokens)}`
        acc.addCall(
          key,
          t,
          acc.model,
          {
            input: Math.max(0, n(last.input_tokens) - cached),
            cacheRead: cached,
            cacheWrite: n(last.cache_write_input_tokens),
            output: n(last.output_tokens)
          },
          null // no OpenAI price table yet: tokens shown, cost unknown
        )
      }
    }
    return true
  }

  sessions(): AgentSession[] {
    const mains: AgentSession[] = []
    const helpers: AgentSession[] = []
    for (const [file, acc] of this.accs) {
      if (!acc.startedAt) continue
      ;(this.helpers.has(file) ? helpers : mains).push(acc.toSession())
    }
    // A helper belongs to the latest main session that started before it.
    // With no such session it stays visible on its own, clearly labelled.
    for (const h of helpers) {
      const owner = mains
        .filter((m) => m.startedAt <= h.startedAt)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      if (owner) mergeHelper(owner, h)
      else mains.push({ ...h, prompts: 0, title: 'Codex helper (approval review)' })
    }
    return mains
  }
}
