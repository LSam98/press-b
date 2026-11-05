import { ClaudeLogReader } from './claudeLogs'
import { CodexLogReader } from './codexLogs'
import { AgentSession, AgentSummary } from './types'

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

  summary(): AgentSummary {
    const sessions: AgentSession[] = [...this.claude.sessions(), ...this.codex.sessions()]
    sessions.sort((x, y) => y.lastActiveAt - x.lastActiveAt)
    return { projectRoot: this.projectRoot, sessions, updatedAt: Date.now() }
  }
}
