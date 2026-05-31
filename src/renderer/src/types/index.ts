export type TaskType = 'TODO' | 'PENDING' | 'REFACTOR' | 'BUG'
export type TaskStatus = 'open' | 'done'
export type Priority = 'high' | 'medium' | 'low'
export type IDE = 'vscode' | 'intellij' | 'cursor' | 'sublime' | 'neovim' | 'custom'

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

export interface DevFloatData {
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
  }
}
