import { useEffect, useState } from 'react'
import { AgentSummary } from '../types'

// Live agent-session metrics for the open project. Main reads the agents' own
// session logs and pushes a fresh summary whenever one changes.
export function useAgents(projectRoot: string | null): {
  summary: AgentSummary | null
  loading: boolean
  now: number
} {
  // Keyed by project, so switching projects never shows the old project's data.
  const [state, setState] = useState<{ root: string; summary: AgentSummary | null } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!projectRoot) return
    let cancelled = false
    window.pressB.agents
      .watch(projectRoot)
      .then((summary) => {
        if (!cancelled) setState({ root: projectRoot, summary })
      })
      .catch(() => {
        if (!cancelled) setState({ root: projectRoot, summary: null })
      })
    const off = window.pressB.agents.onUpdated((summary) => {
      if (!cancelled && summary.projectRoot === projectRoot)
        setState({ root: projectRoot, summary })
    })
    return () => {
      cancelled = true
      off()
    }
  }, [projectRoot])

  // Relative times ("3 min ago") and "working now" need a ticking clock even
  // when no log changes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const current = projectRoot && state?.root === projectRoot ? state : null
  return {
    summary: current?.summary ?? null,
    loading: !!projectRoot && !current,
    now
  }
}
