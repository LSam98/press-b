import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {
  storage: {
    load: (projectRoot: string) => ipcRenderer.invoke('storage:load', projectRoot),
    save: (projectRoot: string, data: unknown) =>
      ipcRenderer.invoke('storage:save', projectRoot, data)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile')
  },
  config: {
    getProjectRoot: () => ipcRenderer.invoke('config:getProjectRoot'),
    setProjectRoot: (projectRoot: string) =>
      ipcRenderer.invoke('config:setProjectRoot', projectRoot),
    getRecentProjects: () => ipcRenderer.invoke('config:getRecentProjects'),
    removeRecentProject: (projectRoot: string) =>
      ipcRenderer.invoke('config:removeRecentProject', projectRoot)
  },
  window: {
    setOpacity: (opacity: number) => ipcRenderer.invoke('window:setOpacity', opacity),
    restorePosition: (position: { x: number; y: number }) =>
      ipcRenderer.invoke('window:restorePosition', position),
    close: () => ipcRenderer.invoke('window:close')
  },
  shell: {
    openFile: (filePath: string, lineNumber?: number) =>
      ipcRenderer.invoke('shell:openFile', filePath, lineNumber)
  },
  watcher: {
    start: (projectRoot: string) => ipcRenderer.invoke('watcher:start', projectRoot),
    stop: () => ipcRenderer.invoke('watcher:stop')
  },
  ai: {
    hasKey: () => ipcRenderer.invoke('ai:hasKey'),
    setKey: (apiKey: string) => ipcRenderer.invoke('ai:setKey', apiKey),
    generateBrief: (projectRoot: string) => ipcRenderer.invoke('ai:generateBrief', projectRoot),
    getBrief: (projectRoot: string) => ipcRenderer.invoke('ai:getBrief', projectRoot),
    generateSuggestions: (projectRoot: string) =>
      ipcRenderer.invoke('ai:generateSuggestions', projectRoot),
    dismissSuggestion: (projectRoot: string, title: string) =>
      ipcRenderer.invoke('ai:dismissSuggestion', projectRoot, title)
  },
  onTasksUpdated: (callback: () => void) => {
    ipcRenderer.on('tasks:updated', callback)
    // Return an unsubscribe function so the renderer can clean up on unmount
    return () => ipcRenderer.removeListener('tasks:updated', callback)
  }
}

console.log('[Preload] Starting preload script...')
console.log('[Preload] contextIsolation enabled:', process.contextIsolated)

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    console.log('[Preload] Exposing devfloat API')
    contextBridge.exposeInMainWorld('devfloat', api)
    console.log('[Preload] APIs exposed successfully')
  } catch (error) {
    console.error('[Preload] Error exposing APIs:', error)
  }
} else {
  console.log('[Preload] Context isolation disabled, using window globals')
  // @ts-ignore (define in dts)
  window.devfloat = api
}
