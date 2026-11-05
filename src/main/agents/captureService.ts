import { Worker } from 'worker_threads'
import { ExchangeSummary, projectDataDir, readSummaries } from './capture'
import { DIRECT_API, Hookup, keepOutOfGit, proxyUrl, settingsFile } from './hookup'
import { CaptureProxy, Exchange } from './proxy'
import { CaptureStatus } from './types'

export const DEFAULT_PORT = 8041
const IDLE_CLOSE_MS = 2 * 60 * 1000 // keep forwarding a while after unhook, for sessions still switching back

// Runs deep capture for the project Press B has open: the proxy, the switch
// (Hookup) and the capture worker. One project at a time; switching projects
// unhooks the old one. Failures are reported in the status, never thrown at
// the agent: the proxy keeps forwarding no matter what capture does.
export class CaptureService {
  private proxy: CaptureProxy | null = null
  private worker: Worker | null = null
  private root: string | null = null // project being recorded
  private viewRoot: string | null = null // project Press B shows
  private exchanges: ExchangeSummary[] = []
  private since: number | null = null
  private error: string | null = null
  private notes: string[] = []
  private closeTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly baseDir: string, // userData/press-b-config/agents
    private readonly hookup: Hookup,
    private readonly createWorker: () => Worker,
    private readonly onChange: () => void
  ) {}

  // Press B opened a project: load its kept metrics and re-arm it if its switch is on.
  async setProject(root: string): Promise<void> {
    if (this.viewRoot === root) return
    this.disarm()
    this.viewRoot = root
    this.error = null
    this.notes = []
    this.exchanges = await readSummaries(projectDataDir(this.baseDir, root))
    if (this.viewRoot !== root) return
    if (this.hookup.isEnabled(root)) await this.arm(root)
    this.onChange()
  }

  async setEnabled(root: string, on: boolean): Promise<CaptureStatus> {
    this.error = null
    if (on) {
      await this.arm(root)
    } else {
      this.disarm()
      this.hookup.setEnabled(root, false)
      this.notes = []
    }
    this.onChange()
    return this.status(root)
  }

  status(root: string): CaptureStatus {
    const active = this.root === root && this.proxy?.port != null
    return {
      enabled: this.hookup.isEnabled(root) || active,
      active,
      port: active ? this.proxy!.port : null,
      upstream: active ? this.proxy!.upstreamUrl : null,
      settingsFile: settingsFile(root),
      since: active ? this.since : null,
      error: this.viewRoot === root ? this.error : null,
      notes: this.viewRoot === root ? this.notes : []
    }
  }

  summaries(root: string): ExchangeSummary[] {
    return this.viewRoot === root ? this.exchanges : []
  }

  // Quit path: synchronous, so it finishes before the process exits.
  shutdownSync(): void {
    if (this.root) this.hookup.unhook(this.root)
    this.root = null
    if (this.proxy) this.proxy.recording = false
  }

  async stop(): Promise<void> {
    this.shutdownSync()
    await this.proxy?.stop()
    this.proxy = null
    await this.worker?.terminate()
    this.worker = null
  }

  private async arm(root: string): Promise<void> {
    if (this.root && this.root !== root) this.disarm()
    try {
      if (this.closeTimer) clearTimeout(this.closeTimer)
      this.closeTimer = null
      if (!this.proxy) this.proxy = new CaptureProxy(DIRECT_API, (x) => this.record(x))
      const port = await this.proxy.start(this.hookup.lastPort(root) ?? DEFAULT_PORT)
      this.proxy.setUpstream(this.hookup.resolveUpstream(root, proxyUrl(port)))
      this.proxy.recording = true
      this.root = root
      this.since = Date.now()
      // The file is written last: nothing is sent our way before we're ready.
      this.proxy.setUpstream(this.hookup.hook(root, port))
      const note = keepOutOfGit(root)
      this.notes = note ? [note] : []
    } catch (e) {
      this.error = (e as Error).message || String(e)
      this.root = null
      if (this.proxy) this.proxy.recording = false
      this.scheduleClose()
    }
  }

  private disarm(): void {
    if (!this.root) return
    this.hookup.unhook(this.root)
    this.root = null
    this.since = null
    if (this.proxy) this.proxy.recording = false
    this.scheduleClose()
  }

  // Sessions re-read the settings file within moments, but keep forwarding for
  // a while so none of them hits a closed port meanwhile.
  private scheduleClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer)
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null
      if (this.root || !this.proxy) return
      void this.proxy.stop()
      this.proxy = null
    }, IDLE_CLOSE_MS)
  }

  // Proxy -> worker. Runs a tick after the reply was sent.
  private record(x: Exchange): void {
    const root = this.root
    if (!root) return
    this.ensureWorker().postMessage({
      type: 'exchange',
      dir: projectDataDir(this.baseDir, root),
      root,
      x
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = this.createWorker()
    w.on(
      'message',
      (m: { type: string; root?: string; summary?: ExchangeSummary; message?: string }) => {
        if (m.type === 'summary' && m.summary && m.root === this.viewRoot) {
          this.exchanges.push(m.summary)
          this.onChange()
        } else if (m.type === 'error') {
          console.warn('Capture worker could not save an exchange (traffic unaffected):', m.message)
        }
      }
    )
    w.on('error', (e) => console.warn('Capture worker failed (traffic unaffected):', e))
    w.on('exit', () => {
      if (this.worker === w) this.worker = null // recreated on the next exchange
    })
    this.worker = w
    return w
  }
}
