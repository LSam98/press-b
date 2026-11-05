/* eslint-disable @typescript-eslint/no-explicit-any -- this parses untyped API
   JSON captured off the wire; every field is checked before it is used. */
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { LEADING_TAG, NOTES, TAGS } from './claudeLogs'
import { anthropicCost, AnthropicUsage } from './pricing'
import { Chunk, Exchange } from './proxy'
import { dayKey } from './session'
import { TokenTotals } from './types'

// Turns one captured exchange into stored records. Runs in the capture worker,
// never on the proxy's path. Ported from Lab 4 dashboard.py (parse_reply,
// classify, mask) with one change: requests are stored as deltas. Each request
// resends the whole conversation, so storing them whole would reach ~1 GB for a
// long session; instead each record keeps only the messages that are new
// compared with an earlier request of the same session, and the system prompt
// and tool list are stored once per day by hash.
//
// Storage, per project, machine-local (never in the repo or .pressb.json):
//   traffic-YYYY-MM-DD.jsonl  one record per exchange (masked headers, delta)
//   blobs-YYYY-MM-DD.jsonl    system prompts and tool lists, by hash
//   summary-YYYY-MM-DD.jsonl  one small line per exchange, for the metrics
// Files older than RETENTION_DAYS are deleted.

export const RETENTION_DAYS = 30
const SECRET = /authorization|api-key|cookie|token|secret|password/i
const BASES_PER_SESSION = 8 // earlier requests a new one is compared against
const SESSIONS_KEPT = 64

export type ExchangeKind = 'main' | 'recap' | 'search' | 'fetch' | 'background'

// The small per-exchange line the metrics are built from.
export interface ExchangeSummary {
  id: string
  sessionId: string | null
  t0: number
  t1: number
  kind: ExchangeKind
  label: string // what a non-main request did ("Wrote a title", …)
  model: string
  replyId: string | null // the reply's message id: matches the session log's
  status: number
  tokens: TokenTotals
  costUsd: number | null
  error: string | null
}

const sha = (s: string): string => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

export function mask(headers: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of headers) {
    const val = SECRET.test(k) ? '[hidden]' : v
    out[k] = k in out ? `${out[k]}, ${val}` : val
  }
  return out
}

function header(headers: [string, string][], name: string): string {
  return headers.find(([k]) => k.toLowerCase() === name)?.[1] ?? ''
}

// Rebuild the reply message from the raw bytes: plain JSON, or an SSE stream.
// `times[i]` = [first, last] arrival time of content block i.
export function parseReply(
  chunks: Chunk[],
  headers: [string, string][]
): { reply: any; times: [number, number][]; error: string | null } {
  if (!header(headers, 'content-type').includes('event-stream')) {
    const text = Buffer.concat(chunks.map((c) => c.data)).toString('utf8')
    let body: any = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      return { reply: text.slice(0, 20000), times: [], error: null }
    }
    const error = body?.type === 'error' ? body.error?.message || 'API error' : null
    return { reply: body, times: [], error }
  }
  const msg: any = {}
  const blocks = new Map<number, any>()
  const times = new Map<number, [number, number]>()
  const partial = new Map<number, string>()
  let error: string | null = null
  let buf = ''
  const dec = new TextDecoder('utf-8')
  for (const { t, data } of chunks) {
    buf += dec.decode(data, { stream: true }).replace(/\r\n/g, '\n')
    const events = buf.split('\n\n')
    buf = events.pop() ?? ''
    for (const ev of events) {
      const payload = ev
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n')
      let e: any
      try {
        e = payload ? JSON.parse(payload) : null
      } catch {
        continue
      }
      if (!e || typeof e !== 'object') continue
      const i = e.index
      switch (e.type) {
        case 'message_start':
          Object.assign(msg, e.message || {})
          break
        case 'content_block_start':
          blocks.set(i, { ...(e.content_block || {}) })
          times.set(i, [t, t])
          partial.set(i, '')
          break
        case 'content_block_delta': {
          const b = blocks.get(i)
          if (!b) break
          const d = e.delta || {}
          if (d.type === 'text_delta') b.text = (b.text || '') + (d.text || '')
          else if (d.type === 'thinking_delta') b.thinking = (b.thinking || '') + (d.thinking || '')
          else if (d.type === 'input_json_delta')
            partial.set(i, partial.get(i)! + (d.partial_json || ''))
          else if (d.type === 'signature_delta') b.signature = d.signature
          times.get(i)![1] = t
          break
        }
        case 'content_block_stop': {
          const b = blocks.get(i)
          if (!b) break
          times.get(i)![1] = t
          const p = partial.get(i)
          if (p) {
            try {
              b.input = JSON.parse(p)
            } catch {
              b.input = { _unparsed: p }
            }
          }
          break
        }
        case 'message_delta': {
          Object.assign(msg, e.delta || {})
          const u = Object.fromEntries(
            Object.entries(e.usage || {}).filter(([, v]) => v !== null && v !== undefined)
          )
          msg.usage = { ...(msg.usage || {}), ...u }
          break
        }
        case 'error':
          error = e.error?.message || 'API error'
          break
      }
    }
  }
  const order = [...blocks.keys()].sort((a, b) => a - b)
  msg.content = order.map((i) => blocks.get(i))
  return { reply: msg, times: order.map((i) => times.get(i)!), error }
}

function blocksOf(content: any): any[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? content.filter((b) => b && typeof b === 'object') : []
}

export function flatten(content: any): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .filter((b) => b && typeof b === 'object')
      .map((b) => (b.type === 'text' ? b.text || '' : `[${b.type}]`))
      .join('\n')
  return content == null ? '' : JSON.stringify(content)
}

// What the person typed in a user message, and whether it carries tool results.
function userText(content: any): { you: string; hasResult: boolean } {
  const parts: string[] = []
  let hasResult = false
  for (const b of blocksOf(content)) {
    if (b.type === 'tool_result') hasResult = true
    else if (b.type === 'text') {
      const rest = String(b.text || '')
        .replace(TAGS, '')
        .trim()
      if (rest && !NOTES.some((n) => rest.startsWith(n)) && !LEADING_TAG.test(rest))
        parts.push(rest)
    }
  }
  return { you: parts.join('\n'), hasResult }
}

// Lab 4 classify(): the agent's own turns are "main"; everything else is a
// helper request the session logs never show.
export function classify(
  method: string,
  urlPath: string,
  req: any
): { kind: ExchangeKind; label: string } {
  if (urlPath.includes('count_tokens')) return { kind: 'background', label: 'Counted tokens' }
  const msgs: any[] = Array.isArray(req?.messages) ? req.messages : []
  if (method !== 'POST' || !urlPath.startsWith('/v1/messages') || !msgs.length)
    return { kind: 'background', label: `${method} ${urlPath.split('?')[0]}` }
  const tools: any[] = Array.isArray(req.tools) ? req.tools : []
  const last = msgs[msgs.length - 1]
  const { you, hasResult } =
    last?.role === 'user' ? userText(last.content) : { you: '', hasResult: false }
  if (!hasResult && msgs.length > 1 && /stepped away|while you were away/i.test(you))
    return { kind: 'recap', label: 'Away recap' }
  if (msgs.length === 1 && you.trimStart().startsWith('Perform a web search'))
    return { kind: 'search', label: 'Web search helper' }
  if (tools.length <= 2 && you.slice(0, 400).includes('Web page content'))
    return { kind: 'fetch', label: 'Web page reader' }
  if (tools.length >= 3) return { kind: 'main', label: '' }
  if (req.max_tokens === 1) return { kind: 'background', label: 'Checked quota' }
  if (/title|topic/i.test(flatten(req.system).slice(0, 3000)))
    return { kind: 'background', label: 'Wrote a title' }
  return { kind: 'background', label: 'Side request' }
}

// Claude Code puts the session id in metadata.user_id: a JSON string today,
// "user_…_account_…_session_<uuid>" in older versions.
export function sessionIdOf(req: any): string | null {
  const raw = req?.metadata?.user_id
  if (typeof raw !== 'string') return null
  try {
    const j = JSON.parse(raw)
    if (typeof j?.session_id === 'string') return j.session_id
  } catch {
    // older format, below
  }
  return /session_([0-9a-f-]{36})/i.exec(raw)?.[1] ?? null
}

function tokensOf(u: AnthropicUsage | undefined): TokenTotals {
  return {
    input: u?.input_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    cacheWrite: u?.cache_creation_input_tokens ?? 0,
    output: u?.output_tokens ?? 0
  }
}

// Message fingerprint for delta matching. cache_control markers move between
// requests without changing the content, so they don't count.
const msgHash = (m: unknown): string =>
  sha(JSON.stringify(m, (k, v) => (k === 'cache_control' ? undefined : v)))

interface Base {
  id: string
  hashes: string[]
}

export function projectDataDir(base: string, root: string): string {
  const norm = path.resolve(root).toLowerCase()
  const name = path.basename(norm).replace(/[^a-z0-9._-]/g, '_') || 'project'
  return path.join(base, `${name}-${sha(norm).slice(0, 8)}`)
}

export class CaptureWriter {
  private readonly bases = new Map<string, Base[]>()
  private readonly blobs = new Set<string>()
  // Each day's files stand on their own: deltas and blobs never point at an
  // earlier day, so deleting old days never breaks a newer record.
  private day = ''
  private n = 0

  constructor(
    readonly dir: string,
    readonly root: string
  ) {
    fs.mkdirSync(dir, { recursive: true })
    const meta = path.join(dir, 'meta.json')
    if (!fs.existsSync(meta)) fs.writeFileSync(meta, JSON.stringify({ root }, null, 2))
  }

  write(x: Exchange): ExchangeSummary {
    const day = dayKey(x.t0)
    if (day !== this.day) {
      this.day = day
      this.bases.clear()
      this.blobs.clear()
      pruneOld(this.dir, Date.now())
    }
    const id = `${x.t0.toString(36)}-${(++this.n).toString(36)}-${crypto.randomBytes(2).toString('hex')}`

    let req: any = null
    const text = x.body.toString('utf8')
    try {
      req = text ? JSON.parse(text) : null
    } catch {
      req = null
    }
    const sessionId = sessionIdOf(req)
    const { kind, label } = classify(x.method, x.path, req)
    const { reply, times, error: replyError } = parseReply(x.chunks, x.respHeaders)
    const model = String(reply?.model || req?.model || '')
    const usage = reply && typeof reply === 'object' ? reply.usage : undefined
    const error = x.error || replyError || (x.status >= 400 ? `HTTP ${x.status}` : null) || null

    const record = {
      v: 1,
      id,
      sessionId,
      t0: x.t0,
      t1: x.t1,
      method: x.method,
      path: x.path,
      status: x.status,
      kind,
      label,
      error,
      interrupted: x.interrupted,
      reqHeaders: mask(x.reqHeaders),
      respHeaders: mask(x.respHeaders),
      req:
        req && typeof req === 'object'
          ? this.compact(req, id, sessionId, day)
          : { raw: text.slice(0, 20000) },
      reply,
      times
    }
    fs.appendFileSync(path.join(this.dir, `traffic-${day}.jsonl`), JSON.stringify(record) + '\n')

    const summary: ExchangeSummary = {
      id,
      sessionId,
      t0: x.t0,
      t1: x.t1,
      kind,
      label,
      model,
      replyId: typeof reply?.id === 'string' ? reply.id : null,
      status: x.status,
      tokens: tokensOf(usage),
      costUsd: anthropicCost(model, usage),
      error
    }
    fs.appendFileSync(path.join(this.dir, `summary-${day}.jsonl`), JSON.stringify(summary) + '\n')
    return summary
  }

  // The request without what earlier records already hold.
  private compact(req: any, id: string, sessionId: string | null, day: string): any {
    const out: any = { ...req }
    if (req.system !== undefined) out.system = { ref: this.blob(req.system, day) }
    if (req.tools !== undefined) out.tools = { ref: this.blob(req.tools, day) }
    // Keep only the session id: the rest of user_id identifies the account.
    if (req.metadata !== undefined) out.metadata = { session_id: sessionId }
    if (Array.isArray(req.messages)) {
      const hashes = req.messages.map(msgHash)
      const key = sessionId || '-'
      const list = this.bases.get(key) ?? []
      let best: Base | null = null
      let from = 0
      for (const b of list) {
        let k = 0
        while (k < b.hashes.length && k < hashes.length && b.hashes[k] === hashes[k]) k++
        if (k > from) {
          from = k
          best = b
        }
      }
      out.messages = {
        base: best?.id ?? null,
        from: best ? from : 0,
        total: hashes.length,
        items: req.messages.slice(best ? from : 0)
      }
      list.push({ id, hashes })
      if (list.length > BASES_PER_SESSION) list.shift()
      this.bases.delete(key)
      this.bases.set(key, list) // most recently used last
      if (this.bases.size > SESSIONS_KEPT) this.bases.delete(this.bases.keys().next().value!)
    }
    return out
  }

  private blob(value: unknown, day: string): string {
    const json = JSON.stringify(value)
    const hash = sha(json)
    if (!this.blobs.has(hash)) {
      this.blobs.add(hash)
      fs.appendFileSync(
        path.join(this.dir, `blobs-${day}.jsonl`),
        `{"hash":"${hash}","value":${json}}\n`
      )
    }
    return hash
  }
}

const DAY_FILE = /^(traffic|blobs|summary)-(\d{4}-\d{2}-\d{2})\.jsonl$/

export function pruneOld(dir: string, now: number): void {
  const cutoff = dayKey(now - RETENTION_DAYS * 86_400_000)
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const n of names) {
    const m = DAY_FILE.exec(n)
    if (m && m[2] < cutoff) {
      try {
        fs.unlinkSync(path.join(dir, n))
      } catch {
        // in use or gone: try again another day
      }
    }
  }
}

// All kept summary lines for a project (startup: the metrics survive restarts).
export async function readSummaries(dir: string): Promise<ExchangeSummary[]> {
  let names: string[] = []
  try {
    names = await fs.promises.readdir(dir)
  } catch {
    return []
  }
  const out: ExchangeSummary[] = []
  for (const n of names.filter((x) => x.startsWith('summary-') && x.endsWith('.jsonl')).sort()) {
    let text = ''
    try {
      text = await fs.promises.readFile(path.join(dir, n), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line))
      } catch {
        // a half-written last line is skipped
      }
    }
  }
  return out
}

// Rebuild the full message list of a stored request from its delta chain.
// For Phase B (and the tests): `records` maps id -> stored record.
export function rebuildMessages(records: Map<string, any>, id: string): any[] | null {
  const chain: any[] = []
  let cur = records.get(id)
  while (cur) {
    const m = cur.req?.messages
    if (!m) return null
    chain.push(m)
    if (!m.base) break
    cur = records.get(m.base)
    if (!cur) return null // a link is missing
  }
  if (!chain.length) return null
  let msgs: any[] = []
  for (let i = chain.length - 1; i >= 0; i--)
    msgs = msgs.slice(0, chain[i].from).concat(chain[i].items)
  return msgs
}
