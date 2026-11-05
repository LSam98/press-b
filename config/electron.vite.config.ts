import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Paths resolve from the project root (the cwd), not this folder.
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    // Vite only looks for a PostCSS config from the renderer root upward, so point it here.
    css: {
      postcss: resolve('config')
    },
    plugins: [react()]
  }
})
