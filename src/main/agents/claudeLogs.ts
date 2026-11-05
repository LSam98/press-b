/* eslint-disable @typescript-eslint/no-explicit-any -- these parse untyped JSON
   written by other tools; every field is checked before it is used. */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { anthropicCost, AnthropicUsage, hasTokens } from './pricing'
import { isInside, JsonlTail, SessionAcc } from './session'
import { AgentSession } from './types'

// Claude Code keeps one JSONL log per session under
// ~/.claude/projects/<project path with every non-alphanumeric char as '-'>/,
// plus subagent logs in <sessionId>/subagents/. Reading them needs no hookup.

export function claudeProjectsDir(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(base, 'projects')
}

export function encodeProjectPath(p: string): string {
  return path.resolve(p).replace(/[^a-zA-Z0-9]/g, '-')
}

// Text Claude Code adds on its own (Lab 4 "Who wrote it" rules, dashboard.py TAGS/NOTES).
const TAGS =
  /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat|bash-input|bash-stdout|bash-stderr)\b[^>]*>[\s\S]*?<\/\1>/g
const NOTES = [
  'Tool loaded.',
  '[Request interrupted',
  'Caveat: ',
  'This session is being continued'
]
const LEADING_TAG = /^<[A-Za-z][\w:-]*[\s>/]/

// The text a person typed, or null if this line isn't a typed prompt.
// When unsure, it is NOT a prompt: a wrong "You" is worse than a missed one.
export function typedPrompt(line: Record<string, any>): string | null {
  if (line.type !== 'user' || line.isMeta || line.isSidechain) return null
  if (line.origin?.kind && line.origin.kind !== 'human') return null
  const c = line.message?.content
  let text = ''
  if (typeof c === 'string') text = c
  else if (Array.isArray(c)) {
    if (c.some((b) => b?.type === 'tool_result')) return null
    text = c
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
  }
  text = text.replace(TAGS, '').trim()
  if (!text || NOTES.some((n) => text.startsWith(n)) || LEADING_TAG.test(text)) return null
  return text
}

const ts = (v: unknown): number => (typeof v === 'string' ? Date.parse(v) : NaN)

interface FileInfo {
  sessionId: string
  main: boolean // false = a subagent log of that session
  tail: JsonlTail
}

export class ClaudeLogReader {
  private readonly files = new Map<string, FileInfo>()
  private readonly accs = new Map<string, SessionAcc>()
  // Per session: true once any of its cwd lines sits inside the project.
  private readonly verified = new Map<string, boolean | null>()

  constructor(readonly projectRoot: string) {}

  // Folders worth reading. A log folder is named after the folder the session
  // STARTED in, so besides the project's own folder (and its subfolders') we
  // also read the folders of its parent directories: a session started one
  // level up that then works inside the project belongs here too. Membership
  // is decided by the cwd lines, not by the folder name.
  async candidateDirs(): Promise<string[]> {
    const base = claudeProjectsDir()
    const enc = encodeProjectPath(this.projectRoot).toLowerCase()
    const ancestors = new Set<string>()
    for (let p = path.dirname(path.resolve(this.projectRoot)); ; p = path.dirname(p)) {
      ancestors.add(encodeProjectPath(p).toLowerCase())
      if (path.dirname(p) === p) break
    }
    try {
      const names = await fs.promises.readdir(base, { withFileTypes: true })
      return names
        .filter((d) => d.isDirectory())
        .filter((d) => {
          const n = d.name.toLowerCase()
          return n === enc || n.startsWith(enc + '-') || ancestors.has(n)
        })
        .map((d) => path.join(base, d.name))
    } catch {
      return [] // no ~/.claude/projects yet
    }
  }

  // Find new session and subagent logs. Returns true if any were added.
  async discover(): Promise<boolean> {
    let added = false
    for (const dir of await this.candidateDirs()) {
      let entries: fs.Dirent[] = []
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) {
          added = this.track(path.join(dir, e.name), e.name.slice(0, -6), true) || added
        } else if (e.isDirectory()) {
          const sub = path.join(dir, e.name, 'subagents')
          let subs: string[] = []
          try {
            subs = await fs.promises.readdir(sub)
          } catch {
            continue
          }
          for (const s of subs) {
            if (s.endsWith('.jsonl')) added = this.track(path.join(sub, s), e.name, false) || added
          }
        }
      }
    }
    return added
  }

  private track(file: string, sessionId: string, main: boolean): boolean {
    if (this.files.has(file)) return false
    this.files.set(file, { sessionId, main, tail: new JsonlTail(file) })
    if (!this.verified.has(sessionId)) this.verified.set(sessionId, null)
    return true
  }

  isTracked(file: string): boolean {
    return this.files.has(file)
  }

  // Read everything new in every tracked file. Returns true if anything changed.
  async readAll(): Promise<boolean> {
    let changed = false
    // Main logs first, so a session's cwd is known before its subagents count.
    const order = [...this.files.entries()].sort((a, b) => Number(b[1].main) - Number(a[1].main))
    for (const [file] of order) changed = (await this.readFile(file)) || changed
    return changed
  }

  async readFile(file: string): Promise<boolean> {
    const info = this.files.get(file)
    if (!info) return false
    const lines = (await info.tail.readNew()) as Record<string, any>[]
    if (!lines.length) return false
    const acc = this.acc(info.sessionId)
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue
      const t = ts(line.timestamp)
      if (info.main) {
        if (typeof line.cwd === 'string') {
          acc.cwd = line.cwd
          // Any activity inside the project makes the whole session ours.
          if (isInside(line.cwd, this.projectRoot)) this.verified.set(info.sessionId, true)
        }
        if (typeof line.gitBranch === 'string' && line.gitBranch) acc.branch = line.gitBranch
        if (typeof line.entrypoint === 'string') acc.entrypoint = line.entrypoint
        if (line.type === 'custom-title' && line.customTitle) {
          acc.title = String(line.customTitle)
          acc.titleIsCustom = true
        } else if (line.type === 'ai-title' && line.aiTitle && !acc.titleIsCustom) {
          acc.title = String(line.aiTitle)
        }
        acc.touch(t)
        const prompt = typedPrompt(line)
        if (prompt) acc.addPrompt(prompt)
      } else {
        acc.extend(t)
      }
      if (line.type === 'assistant' && line.message) {
        const m = line.message
        const u = m.usage as AnthropicUsage | undefined
        if (!hasTokens(u)) continue
        const model = String(m.model || '')
        acc.addCall(
          (info.main ? '' : 'sub:') + (m.id || line.uuid),
          t,
          model,
          {
            input: u!.input_tokens ?? 0,
            cacheRead: u!.cache_read_input_tokens ?? 0,
            cacheWrite: u!.cache_creation_input_tokens ?? 0,
            output: u!.output_tokens ?? 0
          },
          anthropicCost(model, u)
        )
      }
    }
    return true
  }

  private acc(id: string): SessionAcc {
    let a = this.accs.get(id)
    if (!a) {
      a = new SessionAcc('claude', id)
      this.accs.set(id, a)
    }
    return a
  }

  // Sessions confirmed to belong to this project.
  sessions(): AgentSession[] {
    const out: AgentSession[] = []
    for (const [id, acc] of this.accs) {
      if (this.verified.get(id) === true && acc.startedAt) out.push(acc.toSession())
    }
    return out
  }
}
