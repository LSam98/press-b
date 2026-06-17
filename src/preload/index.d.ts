import { ElectronAPI } from '@electron-toolkit/preload'

export interface DevFloatAPI {
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
  }
  onTasksUpdated: (callback: () => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    devfloat: DevFloatAPI
  }
}
