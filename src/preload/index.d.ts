import { ElectronAPI } from '@electron-toolkit/preload'

// Mirrors DeepLinkPayload in src/main/deeplink.ts (preload types stay self-contained).
export interface DeepLinkPayload {
  target: 'task' | 'note'
  file?: string
  absFile?: string
  line?: number
  text?: string
}

// Mirrors src/main/agents/types.ts (preload types stay self-contained).
export interface AgentTokenTotals {
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

export interface AgentSession {
  agent: 'claude' | 'codex'
  id: string
  title: string
  cwd: string
  branch?: string
  entrypoint?: string
  startedAt: number
  lastActiveAt: number
  activeMs: number
  models: string[]
  prompts: number
  calls: number
  tokens: AgentTokenTotals
  costUsd: number | null
  unpricedCalls: number
  byDay: Record<string, AgentTokenTotals & { costUsd: number }>
}

export interface AgentSummary {
  projectRoot: string
  sessions: AgentSession[]
  updatedAt: number
}

export interface PressBAPI {
  storage: {
    load: (projectRoot: string) => Promise<unknown>
    save: (projectRoot: string, data: unknown) => Promise<{ success: boolean }>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
    selectFile: () => Promise<string | null>
  }
  config: {
    getProjectRoot: () => Promise<string | null>
    setProjectRoot: (projectRoot: string) => Promise<{ success: boolean }>
    getRecentProjects: () => Promise<string[]>
    removeRecentProject: (projectRoot: string) => Promise<string[]>
  }
  window: {
    setOpacity: (opacity: number) => Promise<void>
    restorePosition: (position: { x: number; y: number }) => Promise<void>
    close: () => Promise<{ success: boolean }>
  }
  shell: {
    openFile: (filePath: string, lineNumber?: number) => Promise<void>
  }
  watcher: {
    start: (projectRoot: string) => Promise<{ success: boolean; message: string }>
    stop: () => Promise<{ success: boolean; message: string }>
  }
  ai: {
    hasKey: () => Promise<boolean>
    setKey: (apiKey: string) => Promise<{ success: boolean }>
    generateBrief: (
      projectRoot: string
    ) => Promise<{ success: boolean; brief?: string; generatedAt?: string; error?: string }>
    getBrief: (projectRoot: string) => Promise<{ text: string; generatedAt: string } | null>
    generateSuggestions: (projectRoot: string) => Promise<{
      success: boolean
      suggestions?: Array<{
        lens: string
        taskType: 'TODO' | 'PENDING' | 'REFACTOR' | 'BUG'
        title: string
        body: string
        priority: 'high' | 'medium' | 'low'
        reasoning: string
        confidence: 'high' | 'medium' | 'low'
        linkedFile?: string
        linkedLine?: number
      }>
      error?: string
    }>
    dismissSuggestion: (projectRoot: string, title: string) => Promise<{ success: boolean }>
    ask: (
      projectRoot: string,
      question: string
    ) => Promise<{ success: boolean; answer?: string; error?: string }>
    getChat: (
      projectRoot: string
    ) => Promise<Array<{ role: 'user' | 'assistant'; content: string }>>
    clearChat: (projectRoot: string) => Promise<{ success: boolean }>
    onAskChunk: (
      callback: (chunk: { projectRoot: string; text: string }) => void
    ) => () => void
  }
  deeplink: {
    getPending: () => Promise<DeepLinkPayload | null>
    onCreate: (callback: (payload: DeepLinkPayload) => void) => () => void
  }
  agents: {
    watch: (projectRoot: string) => Promise<AgentSummary | null>
    onUpdated: (callback: (summary: AgentSummary) => void) => () => void
  }
  onTasksUpdated: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    pressB: PressBAPI
  }
}
