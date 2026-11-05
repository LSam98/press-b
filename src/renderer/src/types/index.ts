export type TaskType = 'TODO' | 'PENDING' | 'REFACTOR' | 'BUG'
export type TaskStatus = 'open' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type IDE = 'vscode' | 'intellij' | 'pycharm' | 'cursor' | 'sublime' | 'neovim' | 'custom'
export type AIPrivacyScope = 'metadata' | 'metadata+snippets' | 'broad'

// AI Suggestion Engine
export type SuggestionVolume = 'minimal' | 'balanced' | 'proactive'
export type SuggestionLens = 'next-step' | 'code-quality' | 'missing-tests' | 'architecture'

// A single AI-proposed task. Accepting it creates a real Task; the reasoning
// and confidence make it a sharp, evaluable proposal rather than noise.
export interface Suggestion {
  lens: SuggestionLens
  taskType: TaskType
  title: string
  body: string
  priority: Priority
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  linkedFile?: string
  linkedLine?: number
}

// pressb:// deep-link payload pushed from main ("Create in Press B" from the
// IDE). Mirrors DeepLinkPayload in src/main/deeplink.ts and src/preload/index.d.ts.
export interface DeepLinkPayload {
  target: 'task' | 'note'
  file?: string
  absFile?: string
  line?: number
  text?: string
}

// Project-aware Ask (Pillar 3)
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Task {
  id: string
  type: TaskType
  title: string
  body?: string
  status: TaskStatus
  priority: Priority
  createdAt: string
  updatedAt: string
  tags?: string[]
  linkedFile?: string
  linkedLine?: number
}

export interface PinnedNote {
  id: string
  title: string
  content: string
  createdAt: string
}

export interface PressBData {
  project: string
  version: string
  tasks: Task[]
  pinnedNotes: PinnedNote[]
  settings: {
    projectRoot: string
    opacity: number
    theme: 'dark' | 'light'
    preferredIDE: IDE
    customIDECommand?: string
    watcherEnabled?: boolean
    windowPosition?: { x: number; y: number }
    aiModel?: string
    aiPrivacyScope?: AIPrivacyScope
    aiSuggestionVolume?: SuggestionVolume
    aiSuggestionLenses?: SuggestionLens[]
  }
}

// Agent sessions (Claude Code, Codex) read from their logs. Mirrors
// src/main/agents/types.ts and src/preload/index.d.ts.
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
