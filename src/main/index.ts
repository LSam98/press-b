import { app, shell, BrowserWindow, ipcMain, dialog, globalShortcut, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { execFile } from 'child_process'
import { watch } from 'chokidar'
import * as keyStore from './ai/keyStore'
import * as briefStore from './ai/briefStore'
import { buildProjectDigest } from './ai/context'
import { AnthropicProvider, describeAIError } from './ai/anthropic'
import { PrivacyScope } from './ai/types'

let mainWindow: BrowserWindow | null = null
let fileWatcher: ReturnType<typeof watch> | null = null
const detectedComments = new Map<string, boolean>() // Track file:lineNumber to avoid duplicates
let debounceTimer: NodeJS.Timeout | null = null
let currentProjectRoot: string | null = null // Tracks the active project so IPC handlers can read its settings
let positionSaveTimer: NodeJS.Timeout | null = null // Debounce timer for auto-saving window position

// Helper: Get default window position (top-left of primary display, with small offset)
function getDefaultWindowPosition(): { x: number; y: number } {
  const primaryDisplay = screen.getPrimaryDisplay()
  return {
    x: primaryDisplay.bounds.x + 20,
    y: primaryDisplay.bounds.y + 20
  }
}

// Helper: Constrain window position to screen bounds
function constrainWindowPosition(pos: { x: number; y: number }): { x: number; y: number } {
  const displays = screen.getAllDisplays()
  let isOnScreen = false

  // Check if position is within any display's bounds
  for (const display of displays) {
    if (
      pos.x >= display.bounds.x &&
      pos.x < display.bounds.x + display.bounds.width &&
      pos.y >= display.bounds.y &&
      pos.y < display.bounds.y + display.bounds.height
    ) {
      isOnScreen = true
      break
    }
  }

  // If not on screen, return default position
  if (!isOnScreen) {
    return getDefaultWindowPosition()
  }

  return pos
}

function createWindow(): BrowserWindow {
  // Create the floating task manager window
  const mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: false,
    show: false,
    icon: process.platform === 'linux' ? icon : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow as BrowserWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.devfloat')

  // Optimize window handling
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create main window
  mainWindow = createWindow()

  // Auto-save window position whenever it is dragged (debounced 500 ms)
  mainWindow.on('moved', () => {
    if (!currentProjectRoot || !mainWindow) return
    if (positionSaveTimer) clearTimeout(positionSaveTimer)
    positionSaveTimer = setTimeout(() => {
      try {
        if (!mainWindow || !currentProjectRoot) return
        const [x, y] = mainWindow.getPosition()
        const tasksFile = getTasksFilePath(currentProjectRoot)
        if (fs.existsSync(tasksFile)) {
          const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
          data.settings = { ...data.settings, windowPosition: { x, y } }
          fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2), 'utf-8')
        }
      } catch (e) {
        console.error('Error auto-saving window position:', e)
      }
    }, 500)
  })

  // Global keyboard shortcut to toggle window visibility
  const shortcutKey = process.platform === 'darwin' ? 'Cmd+Shift+F' : 'Ctrl+Shift+F'
  globalShortcut.register(shortcutKey, () => {
    if (!mainWindow) return

    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ============================================================================
// IPC HANDLERS FOR STORAGE AND DIALOG
// ============================================================================

// Helper: Get project config directory
function getConfigDir(): string {
  return path.join(app.getPath('userData'), 'devfloat-config')
}

// Helper: Get .devfloat.json path for a project
function getTasksFilePath(projectRoot: string): string {
  return path.join(projectRoot, '.devfloat.json')
}

// Helper: Detect TODO/REFACTOR comments in a file
function detectCommentsInFile(
  filePath: string
): Array<{ type: 'TODO' | 'REFACTOR'; title: string; line: number }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const matches: Array<{ type: 'TODO' | 'REFACTOR'; title: string; line: number }> = []
    // Matches: // TODO:  /* TODO:  # TODO:  -- TODO:  * TODO:  (covers JS/TS, Python, SQL, Lua, etc.)
    const regex = /\s*(\/\/|\/\*|\*|#|--)\s*(TODO|REFACTOR):\s*(.+)/i

    lines.forEach((line, index) => {
      const match = line.match(regex)
      if (match) {
        const type = match[2].toUpperCase() as 'TODO' | 'REFACTOR'
        const title = match[3].trim()
        matches.push({
          type,
          title,
          line: index + 1 // 1-indexed line number
        })
      }
    })

    return matches
  } catch (error) {
    console.error(`Error detecting comments in ${filePath}:`, error)
    return []
  }
}

// Helper: Create a task object from detected comment
function createTaskFromComment(
  filePath: string,
  projectRoot: string,
  lineNumber: number,
  commentText: string,
  type: 'TODO' | 'REFACTOR'
): any {
  const now = new Date().toISOString()
  const relativeFilePath = path.relative(projectRoot, filePath)

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title: commentText,
    status: 'open',
    priority: 'medium',
    createdAt: now,
    updatedAt: now,
    linkedFile: relativeFilePath,
    linkedLine: lineNumber
  }
}

// Load tasks from .devfloat.json
ipcMain.handle('storage:load', async (_event, projectRoot: string) => {
  try {
    const tasksFile = getTasksFilePath(projectRoot)
    if (!fs.existsSync(tasksFile)) {
      return {
        project: path.basename(projectRoot),
        version: '1.0',
        tasks: [],
        pinnedNotes: [],
        settings: {
          projectRoot,
          opacity: 0.95,
          theme: 'dark',
          windowPosition: getDefaultWindowPosition()
        }
      }
    }

    const data = fs.readFileSync(tasksFile, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.error('Error loading tasks:', error)
    throw new Error(`Failed to load tasks: ${error}`)
  }
}); // End of storage:load handler

// Save tasks to .devfloat.json
ipcMain.handle('storage:save', async (_event, projectRoot: string, data: unknown) => {
  try {
    const tasksFile = getTasksFilePath(projectRoot)
    fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('Error saving tasks:', error)
    throw new Error(`Failed to save tasks: ${error}`)
  }
})

// Open folder selection dialog
ipcMain.handle('dialog:selectFolder', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  } catch (error) {
    console.error('Error selecting folder:', error)
    throw new Error(`Failed to select folder: ${error}`)
  }
})

// Open file selection dialog
ipcMain.handle('dialog:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    return result.filePaths[0] || null
  } catch (error) {
    console.error('Error selecting file:', error)
    throw new Error(`Failed to select file: ${error}`)
  }
})

// Helper: Build IDE-specific command to open file at line number
// Bounded recursive search for an executable under a base dir (JetBrains installs
// nest the binary a few levels deep under a version folder).
function findExeUnder(baseDir: string, exeName: string, depth = 5): string | null {
  if (depth < 0 || !fs.existsSync(baseDir)) return null
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === exeName.toLowerCase()) {
      return path.join(baseDir, e.name)
    }
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findExeUnder(path.join(baseDir, e.name), exeName, depth - 1)
      if (found) return found
    }
  }
  return null
}

// Cache the resolved launcher path so we don't rescan the filesystem on every click.
const jetbrainsLauncherCache: Record<string, string | null> = {}

// Locate the JetBrains launcher exe (Toolbox or standalone) without relying on PATH.
// Returns null on non-Windows (there we rely on the `idea`/`pycharm` shell scripts in PATH).
function findJetBrainsLauncher(ide: 'intellij' | 'pycharm'): string | null {
  if (ide in jetbrainsLauncherCache) return jetbrainsLauncherCache[ide]
  if (process.platform !== 'win32') {
    jetbrainsLauncherCache[ide] = null
    return null
  }

  const exe = ide === 'pycharm' ? 'pycharm64.exe' : 'idea64.exe'
  const localAppData = process.env.LOCALAPPDATA || ''
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'

  // JetBrains-only directories — safe to deep-scan (small, no unrelated apps).
  const baseDirs = [
    path.join(localAppData, 'JetBrains', 'Toolbox', 'apps'), // Toolbox installs
    path.join(programFiles, 'JetBrains'), // standalone
    path.join(programFilesX86, 'JetBrains')
  ]

  let found: string | null = null
  for (const base of baseDirs) {
    found = findExeUnder(base, exe)
    if (found) break
  }
  if (found) console.log(`Resolved JetBrains launcher: ${found}`)
  jetbrainsLauncherCache[ide] = found
  return found
}

// Hit the JetBrains built-in server. Resolves true only on a 2xx (file navigated).
function tryJetBrainsRest(relPath: string, line: number): Promise<boolean> {
  return new Promise((resolve) => {
    const encodedPath = encodeURIComponent(relPath.replace(/\\/g, '/'))
    const apiUrl = `http://localhost:63342/api/file?file=${encodedPath}&line=${line}&column=0`
    console.log(`Opening via JetBrains REST API: ${apiUrl}`)
    const req = http.get(apiUrl, (res) => {
      const status = res.statusCode || 0
      console.log(`JetBrains REST API responded: ${status}`)
      res.resume()
      resolve(status >= 200 && status < 300)
    })
    req.on('error', (err) => {
      console.warn(`JetBrains REST error: ${err.message}`)
      resolve(false)
    })
    req.setTimeout(2000, () => req.destroy(new Error('timeout')))
  })
}

function buildIDECommand(ideType: string, filePath: string, lineNumber?: number): { command: string; args: string[] } {
  const isWindows = process.platform === 'win32'

  // Line number is 1-indexed (user enters what they see in IDE)
  const line = lineNumber || 1

  switch (ideType) {
    case 'vscode':
      return {
        command: isWindows ? 'code' : 'code', // Use 'code' directly on all platforms (better than code.cmd)
        args: ['--goto', `${filePath}:${line}`] // Use --goto flag for proper line navigation
      }
    case 'cursor':
      return {
        command: 'cursor', // Use plain command name (works in PATH)
        args: [`${filePath}:${line}`]
      }
    case 'intellij':
      return {
        command: 'idea', // JetBrains launcher (must be in PATH)
        args: ['--line', String(line), filePath] // JetBrains uses --line N <file>, not file:line
      }
    case 'pycharm':
      return {
        command: 'pycharm', // JetBrains launcher (must be in PATH)
        args: ['--line', String(line), filePath]
      }
    case 'sublime':
      return {
        command: 'subl', // Use plain command name (works in PATH)
        args: [`${filePath}:${line}`]
      }
    case 'neovim':
      return {
        command: 'nvim',
        args: [`+${line}`, filePath]
      }
    default:
      // Fallback: just open with default handler
      return {
        command: isWindows ? 'start' : 'open',
        args: [filePath]
      }
  }
}

// Open file in preferred IDE at specific line
ipcMain.handle('shell:openFile', async (_event, filePath: string, lineNumber?: number) => {
  try {
    // Resolve relative paths against the active project root (not process.cwd())
    const base = currentProjectRoot || process.cwd()
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(base, filePath)
    const line = lineNumber || 1

    // Read preferredIDE from the active project's .devfloat.json
    let preferredIDE = 'vscode' // Default fallback
    try {
      if (currentProjectRoot) {
        const tasksFile = getTasksFilePath(currentProjectRoot)
        if (fs.existsSync(tasksFile)) {
          const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
          preferredIDE = data.settings?.preferredIDE || 'vscode'
        }
      }
    } catch (e) {
      console.log('Could not read preferredIDE from project settings, falling back to VS Code')
    }

    // VS Code and Cursor expose a URI protocol that routes to the *already-open* window.
    // This avoids the Windows "select an app" OS picker and avoids opening a second instance.
    if (preferredIDE === 'vscode' || preferredIDE === 'cursor') {
      // URI format: vscode://file/C:/path/to/file:line   (forward slashes required)
      const uriPath = absolutePath.replace(/\\/g, '/')
      const protocol = preferredIDE === 'cursor' ? 'cursor' : 'vscode'
      const uri = `${protocol}://file/${uriPath}:${line}`
      console.log(`Opening via URI protocol: ${uri}`)
      await shell.openExternal(uri)
      return { success: true, path: absolutePath, line }
    }

    // JetBrains IDEs (PyCharm, IntelliJ IDEA, etc.).
    if (preferredIDE === 'intellij' || preferredIDE === 'pycharm') {
      // 1) Try the built-in REST server (port 63342) — instant, no process spawn,
      //    navigates the already-open window. Path must be RELATIVE to the project
      //    root (absolute paths 404 — JetBrains PY-57115).
      const relPath =
        currentProjectRoot && absolutePath.startsWith(currentProjectRoot)
          ? path.relative(currentProjectRoot, absolutePath)
          : absolutePath
      const navigated = await tryJetBrainsRest(relPath, line)
      if (navigated) {
        return { success: true, path: absolutePath, line }
      }

      // 2) REST didn't navigate. Use the launcher EXE by full path (Toolbox installs
      //    aren't on PATH, so a bare `pycharm`/`idea` spawn ENOENTs). The launcher
      //    routes to the running instance and jumps to the line — no "Open project"
      //    prompt, because the file already lives in the open project.
      const launcher = findJetBrainsLauncher(preferredIDE)
      if (launcher) {
        execFile(
          launcher,
          ['--line', String(line), absolutePath],
          { detached: true, stdio: 'ignore' } as any,
          (err) => {
            if (err) console.error(`JetBrains launcher failed: ${err.message}`)
          }
        )
        return { success: true, path: absolutePath, line }
      }

      // 3) Neither worked. Surface a clear, actionable error — deliberately NOT
      //    shell.openPath(), which opens the file via OS association and triggers
      //    the unwanted "Open project" dialog without jumping to the line.
      console.error('JetBrains: REST returned non-2xx and no launcher exe was found.')
      return {
        success: false,
        path: absolutePath,
        line,
        error:
          'Could not reach PyCharm. Make sure the project is open in PyCharm, or set a custom launcher path in Settings.'
      }
    }

    // For remaining IDEs (Sublime, Neovim, custom) fall back to execFile
    const { command, args } = buildIDECommand(preferredIDE, absolutePath, lineNumber)
    execFile(
      command,
      args,
      { detached: true, stdio: 'ignore' } as any,
      (error) => {
        if (error) {
          console.error(`Error opening file in ${preferredIDE}:`, error)
          shell.openPath(absolutePath).catch((err) => {
            console.error('Fallback shell.openPath failed:', err)
          })
        }
      }
    )

    return { success: true, path: absolutePath, line }
  } catch (error) {
    console.error('Error opening file:', error)
    throw new Error(`Failed to open file: ${error}`)
  }
})

// Get last used project root from config
ipcMain.handle('config:getProjectRoot', async () => {
  try {
    const configDir = getConfigDir()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const configFile = path.join(configDir, 'config.json')
    if (!fs.existsSync(configFile)) {
      return null
    }

    const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
    const root = config.lastProjectRoot || null
    currentProjectRoot = root // Sync module-level tracker on startup
    return root
  } catch (error) {
    console.error('Error loading config:', error)
    return null
  }
})

// Save last used project root to config
ipcMain.handle('config:setProjectRoot', async (_event, projectRoot: string) => {
  try {
    const configDir = getConfigDir()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }

    const configFile = path.join(configDir, 'config.json')
    const config = { lastProjectRoot: projectRoot }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
    currentProjectRoot = projectRoot // Keep module-level tracker in sync
    return { success: true }
  } catch (error) {
    console.error('Error saving config:', error)
    throw new Error(`Failed to save config: ${error}`)
  }
})

// Set window opacity
ipcMain.handle('window:setOpacity', async (_event, opacity: number) => {
  try {
    if (!mainWindow) {
      throw new Error('Main window not available')
    }
    // Validate opacity is within bounds
    const validOpacity = Math.max(0.3, Math.min(1.0, opacity))
    mainWindow.setOpacity(validOpacity)
    return { success: true, opacity: validOpacity }
  } catch (error) {
    console.error('Error setting window opacity:', error)
    throw new Error(`Failed to set opacity: ${error}`)
  }
})

// Restore window position
ipcMain.handle('window:restorePosition', async (_event, position: { x: number; y: number }) => {
  try {
    if (!mainWindow) {
      throw new Error('Main window not available')
    }
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
      // Constrain position to screen bounds
      const constrainedPos = constrainWindowPosition(position)
      mainWindow.setPosition(constrainedPos.x, constrainedPos.y)
    }
    return { success: true }
  } catch (error) {
    console.error('Error restoring window position:', error)
    throw new Error(`Failed to restore position: ${error}`)
  }
})

// Close window
ipcMain.handle('window:close', async () => {
  try {
    if (!mainWindow) {
      throw new Error('Main window not available')
    }
    mainWindow.close()
    return { success: true }
  } catch (error) {
    console.error('Error closing window:', error)
    throw new Error(`Failed to close window: ${error}`)
  }
})

// Helper: Process a single file — detect comments, add/update tasks, save, notify renderer
async function processFileForTasks(filePath: string, projectRoot: string): Promise<boolean> {
  const comments = detectCommentsInFile(filePath)
  if (comments.length === 0) return false

  const tasksFile = getTasksFilePath(projectRoot)
  let data: any = {
    project: path.basename(projectRoot),
    version: '1.0',
    tasks: [],
    pinnedNotes: [],
    settings: { projectRoot, opacity: 0.95, theme: 'dark' }
  }

  if (fs.existsSync(tasksFile)) {
    data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
  }

  const relativeFilePath = path.relative(projectRoot, filePath)
  let modified = false

  for (const comment of comments) {
    const newKey = `${filePath}:${comment.line}`
    if (detectedComments.has(newKey)) continue

    // Primary match: same file + same title + same type (handles line shifts)
    // This prevents a TODO that just moved lines from spawning a second task.
    const existingByTitle = (data.tasks || []).find(
      (t: any) =>
        t.linkedFile === relativeFilePath &&
        t.title === comment.title &&
        t.type === comment.type
    )

    if (existingByTitle) {
      if (existingByTitle.linkedLine !== comment.line) {
        // Comment shifted to a new line — update in place, don't duplicate
        existingByTitle.linkedLine = comment.line
        existingByTitle.updatedAt = new Date().toISOString()
        modified = true
      }
      detectedComments.set(newKey, true)
    } else {
      // Truly new comment — create a task only if nothing already lives at this exact line
      const exactLineMatch = (data.tasks || []).some(
        (t: any) => t.linkedFile === relativeFilePath && t.linkedLine === comment.line
      )
      if (!exactLineMatch) {
        const newTask = createTaskFromComment(filePath, projectRoot, comment.line, comment.title, comment.type)
        data.tasks.push(newTask)
        modified = true
      }
      detectedComments.set(newKey, true)
    }
  }

  if (modified) {
    fs.writeFileSync(tasksFile, JSON.stringify(data, null, 2), 'utf-8')
  }
  return modified
}

// Start file watcher
ipcMain.handle('watcher:start', async (_event, projectRoot: string) => {
  try {
    if (!projectRoot) {
      throw new Error('projectRoot is required')
    }

    // Close existing watcher if any
    if (fileWatcher) {
      await fileWatcher.close()
    }

    detectedComments.clear()

    // Collect files found during initial crawl, then batch-scan after ready
    const initialFiles: string[] = []

    fileWatcher = watch(projectRoot, {
      ignored: /(^|[\/\\])\.|node_modules|\.git/,
      persistent: true,
      depth: 10
    })

    // Chokidar emits 'add' for every existing file during startup crawl
    fileWatcher.on('add', (filePath) => {
      initialFiles.push(filePath)
    })

    // After the initial crawl is complete, scan all discovered files at once
    fileWatcher.on('ready', async () => {
      console.log(`Initial scan: checking ${initialFiles.length} files for TODO/REFACTOR comments...`)
      let totalAdded = false
      for (const filePath of initialFiles) {
        try {
          const added = await processFileForTasks(filePath, projectRoot)
          if (added) totalAdded = true
        } catch (err) {
          console.error(`Error scanning ${filePath}:`, err)
        }
      }
      if (totalAdded) {
        console.log('Initial scan complete — notifying renderer')
        mainWindow?.webContents.send('tasks:updated')
      } else {
        console.log('Initial scan complete — no new tasks found')
      }
    })

    // Handle ongoing file changes after startup
    fileWatcher.on('change', (filePath) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        try {
          const added = await processFileForTasks(filePath, projectRoot)
          if (added) {
            console.log(`Auto-created tasks from: ${filePath}`)
            mainWindow?.webContents.send('tasks:updated')
          }
        } catch (error) {
          console.error('Error processing file change:', error)
        }
      }, 300)
    })

    console.log(`File watcher started for: ${projectRoot}`)
    return { success: true, message: 'Watcher started' }
  } catch (error) {
    console.error('Error starting watcher:', error)
    throw new Error(`Failed to start watcher: ${error}`)
  }
})

// Stop file watcher
ipcMain.handle('watcher:stop', async () => {
  try {
    if (fileWatcher) {
      await fileWatcher.close()
      fileWatcher = null
      console.log('File watcher stopped')
    }
    return { success: true, message: 'Watcher stopped' }
  } catch (error) {
    console.error('Error stopping watcher:', error)
    throw new Error(`Failed to stop watcher: ${error}`)
  }
})

// ============================================================================
// IPC HANDLERS FOR AI (Re-entry Brief)
// ============================================================================

// Whether an API key is stored (drives the Settings "key saved ✓" indicator)
ipcMain.handle('ai:hasKey', async () => {
  return keyStore.hasKey()
})

// Save (or clear, if empty) the encrypted API key
ipcMain.handle('ai:setKey', async (_event, apiKey: string) => {
  try {
    keyStore.setKey(apiKey)
    return { success: true }
  } catch (error) {
    console.error('Error saving API key:', error)
    throw new Error((error as Error).message)
  }
})

// Generate a re-entry brief for the active project
ipcMain.handle('ai:generateBrief', async (_event, projectRoot: string) => {
  const apiKey = keyStore.getKey()
  if (!apiKey) {
    return { success: false, error: 'No API key set. Add your Anthropic key in Settings.' }
  }
  if (!projectRoot) {
    return { success: false, error: 'No project selected.' }
  }

  try {
    // Read model + privacy scope from the project's settings (with safe defaults)
    let model = 'claude-sonnet-4-6'
    let scope: PrivacyScope = 'metadata+snippets'
    try {
      const tasksFile = getTasksFilePath(projectRoot)
      if (fs.existsSync(tasksFile)) {
        const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
        model = data.settings?.aiModel || model
        scope = data.settings?.aiPrivacyScope || scope
      }
    } catch (e) {
      console.warn('Could not read AI settings, using defaults:', e)
    }

    const digest = buildProjectDigest(projectRoot, scope)
    console.log(
      `[ai] Generating brief — model=${model}, scope=${scope}, tasks=${digest.taskCount}, notes=${digest.noteCount}, snippets=${digest.snippetCount}`
    )

    const provider = new AnthropicProvider(apiKey)
    const brief = await provider.generateBrief(digest, {
      model,
      now: new Date().toLocaleString()
    })

    // Persist so it survives restarts (machine-local, not in the repo)
    const generatedAt = new Date().toISOString()
    briefStore.setBrief(projectRoot, { text: brief, generatedAt })

    return { success: true, brief, generatedAt }
  } catch (error) {
    console.error('Error generating brief:', error)
    return { success: false, error: describeAIError(error) }
  }
})

// Load the last persisted brief for a project (shown on launch without an API call)
ipcMain.handle('ai:getBrief', async (_event, projectRoot: string) => {
  if (!projectRoot) return null
  return briefStore.getBrief(projectRoot)
})
