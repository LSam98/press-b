import { ElectronAPI } from '@electron-toolkit/preload'

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
  onTasksUpdated: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    pressB: PressBAPI
  }
}
