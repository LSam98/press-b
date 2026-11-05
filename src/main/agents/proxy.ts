import * as http from 'http'
import * as https from 'https'
import { AddressInfo } from 'net'

// The capture proxy: a Node port of the Lab 4 proxy.py relay. It forwards every
// request unchanged (login headers included, so a subscription or key works as
// normal) and streams each reply chunk back the moment it arrives. Only after
// the reply has been passed on does it hand a copy to `onExchange`, on a later
// tick, inside try/catch, so the copy can never slow down or break the agent.

// Headers that describe one hop of the connection, not the message, are never
// forwarded. `accept-encoding` is dropped so the API answers uncompressed and
// the copy is readable; `content-length` is recomputed.
const SKIP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'te',
  'trailer',
  'trailers',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'accept-encoding',
  'content-length'
])

const CONNECT_TIMEOUT_MS = 10_000 // a lost connection attempt must not stall the agent
const IDLE_TIMEOUT_MS = 600_000 // a slow stream may pause for a long time
const PORT_TRIES = 20

export interface Chunk {
  t: number // epoch ms when it arrived
  data: Buffer
}

// One request/reply pair, as the proxy saw it. Raw: masking happens later.
export interface Exchange {
  t0: number
  t1: number
  method: string
  path: string
  reqHeaders: [string, string][]
  body: Buffer
  status: number
  respHeaders: [string, string][]
  chunks: Chunk[]
  error: string | null
  interrupted: boolean // the agent closed the connection before the reply ended
}

function pairs(raw: string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i + 1 < raw.length; i += 2) out.push([raw[i], raw[i + 1]])
  return out
}

// Node takes headers as a flat [name, value, name, value…] list (the rawHeaders
// format), which keeps repeated headers and their original spelling.
function forwardable(raw: string[]): string[] {
  return pairs(raw)
    .filter(([k]) => !SKIP.has(k.toLowerCase()))
    .flat()
}

export class CaptureProxy {
  private server: http.Server | null = null
  private upstream: URL
  private readonly agents = {
    'http:': new http.Agent({ keepAlive: true }),
    'https:': new https.Agent({ keepAlive: true })
  }
  // Whether a finished exchange is handed on. False = forward only.
  recording = true

  constructor(
    upstream: string,
    private readonly onExchange: (x: Exchange) => void
  ) {
    this.upstream = new URL(upstream)
  }

  get port(): number | null {
    const a = this.server?.address() as AddressInfo | null | undefined
    return a?.port ?? null
  }

  get upstreamUrl(): string {
    return this.upstream.toString().replace(/\/$/, '')
  }

  setUpstream(upstream: string): void {
    this.upstream = new URL(upstream)
  }

  // Listen on 127.0.0.1 only. Tries `preferred`, then the next ports up.
  async start(preferred: number): Promise<number> {
    if (this.server) return this.port!
    for (let i = 0; i < PORT_TRIES; i++) {
      const port = preferred + i
      const server = http.createServer((req, res) => this.handle(req, res))
      server.requestTimeout = 0 // big requests on a busy machine must not be cut off
      server.keepAliveTimeout = 30_000
      const ok = await new Promise<boolean>((resolve) => {
        server.once('error', () => resolve(false))
        server.listen(port, '127.0.0.1', () => resolve(true))
      })
      if (ok) {
        server.on('error', (e) => console.warn('Capture proxy error (ignored):', e))
        this.server = server
        return port
      }
      server.close()
    }
    throw new Error(`No free port between ${preferred} and ${preferred + PORT_TRIES - 1}`)
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    if (!s) return
    s.closeAllConnections()
    await new Promise<void>((resolve) => s.close(() => resolve()))
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const t0 = Date.now()
    const parts: Buffer[] = []
    req.on('data', (c: Buffer) => parts.push(c))
    req.on('error', () => res.destroy())
    req.on('end', () => this.forward(req, res, Buffer.concat(parts), t0))
  }

  private forward(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Buffer,
    t0: number
  ): void {
    const up = this.upstream
    const lib = up.protocol === 'https:' ? https : http
    // With a header list Node no longer adds Host itself: name the API's host.
    const headers = ['Host', up.host, ...forwardable(req.rawHeaders)]
    if (body.length || !['GET', 'HEAD'].includes(req.method || '')) {
      headers.push('Content-Length', String(body.length))
    }
    const x: Exchange = {
      t0,
      t1: 0,
      method: req.method || 'GET',
      path: req.url || '/',
      reqHeaders: pairs(req.rawHeaders),
      body,
      status: 0,
      respHeaders: [],
      chunks: [],
      error: null,
      interrupted: false
    }
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      x.t1 = Date.now()
      if (!this.recording) return
      // Later tick, never in the reply's path; a failure here is only logged.
      setImmediate(() => {
        try {
          this.onExchange(x)
        } catch (e) {
          console.warn('Capture failed (traffic unaffected):', e)
        }
      })
    }

    const upReq = lib.request({
      protocol: up.protocol,
      hostname: up.hostname,
      port: up.port || undefined,
      method: req.method,
      path: up.pathname.replace(/\/$/, '') + (req.url || '/'),
      headers: headers as unknown as http.OutgoingHttpHeaders,
      agent: this.agents[up.protocol as 'http:' | 'https:']
    })
    upReq.setTimeout(IDLE_TIMEOUT_MS, () => upReq.destroy(new Error('the API stopped answering')))
    upReq.on('socket', (s) => {
      if (!s.connecting) return // a reused keep-alive connection
      const timer = setTimeout(
        () => upReq.destroy(new Error('connection timed out')),
        CONNECT_TIMEOUT_MS
      )
      s.once('connect', () => clearTimeout(timer))
      s.once('close', () => clearTimeout(timer))
    })

    upReq.on('response', (upRes) => {
      x.status = upRes.statusCode || 0
      x.respHeaders = pairs(upRes.rawHeaders)
      res.writeHead(
        x.status,
        upRes.statusMessage,
        forwardable(upRes.rawHeaders) as unknown as http.OutgoingHttpHeaders
      )
      res.flushHeaders()
      upRes.on('data', (chunk: Buffer) => {
        x.chunks.push({ t: Date.now(), data: chunk })
        // Respect the agent's pace: pause the API side while the agent catches up.
        if (!res.write(chunk)) {
          upRes.pause()
          res.once('drain', () => upRes.resume())
        }
      })
      upRes.on('end', () => {
        res.end()
        finish()
      })
      upRes.on('error', (e) => {
        x.error = `The connection broke while the reply was streaming: ${e.message}`
        res.destroy()
        finish()
      })
    })

    upReq.on('error', (e) => {
      if (finished) return
      if (!res.headersSent) {
        x.status = 502
        x.error = `The proxy could not reach ${this.upstreamUrl}: ${e.message}`
        // Shaped like an API error, so the agent shows a readable message.
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: `Press B capture proxy: ${x.error}` }
          })
        )
      } else {
        x.error ??= `The connection broke while the reply was streaming: ${e.message}`
        res.destroy()
      }
      finish()
    })

    // The agent hung up (Esc, Ctrl+C): stop the API side too.
    res.on('close', () => {
      if (res.writableFinished || finished) return
      x.interrupted = true
      x.error ??= 'Interrupted: the agent closed the connection'
      upReq.destroy()
      finish()
    })

    upReq.end(body.length ? body : undefined)
  }
}
