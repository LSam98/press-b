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
