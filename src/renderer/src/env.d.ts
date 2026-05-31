/// <reference types="vite/client" />

interface DevFloatAPI {
  storage: {
    load: (projectRoot: string) => Promise<unknown>
    save: (projectRoot: string, data: unknown) => Promise<{ success: boolean }>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
  }
  config: {
    getProjectRoot: () => Promise<string | null>
    setProjectRoot: (projectRoot: string) => Promise<{ success: boolean }>
  }
}

declare global {
  interface Window {
    devfloat?: DevFloatAPI
  }
}
