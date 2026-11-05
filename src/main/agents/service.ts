import * as fs from 'fs'
import { watch, FSWatcher } from 'chokidar'
import { claudeProjectsDir } from './claudeLogs'
import { codexSessionsDir } from './codexLogs'
import { ProjectLogs } from './collect'
import { AgentSummary } from './types'

const DEBOUNCE_MS = 400

// Keeps one project's agent-session metrics live: an initial scan, then a
// re-read (only new bytes) whenever any session log changes. Errors are
// logged and swallowed — observing agents must never disturb Press B.
export class AgentService {
  private logs: ProjectLogs | null = null
  private watchers: FSWatcher[] = []
  private timer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private dirty = false

  constructor(private readonly onUpdate: (summary: AgentSummary) => void) {}

  get projectRoot(): string | null {
    return this.logs?.projectRoot ?? null
  }

  async start(projectRoot: string): Promise<AgentSummary> {
    if (this.logs?.projectRoot === projectRoot) return this.logs.summary()
    await this.stop()
    const logs = new ProjectLogs(projectRoot)
    this.logs = logs
    await this.safeRefresh(logs)
    if (this.logs !== logs) return logs.summary() // switched again meanwhile
    for (const dir of [claudeProjectsDir(), codexSessionsDir()]) {
      if (!fs.existsSync(dir)) continue
      const w = watch(dir, {
        ignoreInitial: true,
        depth: 5, // codex: sessions/YYYY/MM/DD/file; claude: projects/dir/session/subagents/file
        // Only .jsonl logs (folders must pass so their contents are seen).
        ignored: (p: string, stats?: fs.Stats) => !!stats?.isFile() && !p.endsWith('.jsonl')
      })
      w.on('add', () => this.schedule())
      w.on('change', () => this.schedule())
      w.on('error', (e) => console.warn('Agent log watcher error (ignored):', e))
      this.watchers.push(w)
    }
    return logs.summary()
  }

  summary(): AgentSummary | null {
    return this.logs?.summary() ?? null
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const ws = this.watchers
    this.watchers = []
    this.logs = null
    await Promise.all(ws.map((w) => w.close().catch(() => undefined)))
  }

  // Coalesce bursts of log writes into one refresh; never run two at once.
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.kick()
    }, DEBOUNCE_MS)
  }

  private async kick(): Promise<void> {
    if (this.running) {
      this.dirty = true
      return
    }
    const logs = this.logs
    if (!logs) return
    this.running = (async () => {
      const changed = await this.safeRefresh(logs)
      if (changed && this.logs === logs) this.onUpdate(logs.summary())
    })().then(() => undefined)
    await this.running
    this.running = null
    if (this.dirty) {
      this.dirty = false
      void this.kick()
    }
  }

  private async safeRefresh(logs: ProjectLogs): Promise<boolean> {
    try {
      return await logs.refresh()
    } catch (e) {
      console.warn('Agent log refresh failed (ignored):', e)
      return false
    }
  }
}
