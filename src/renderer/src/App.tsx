import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import TaskList from './components/TaskList'
import PinnedNotes from './components/PinnedNotes'
import SettingsPanel from './components/SettingsPanel'
import { useTasks } from './hooks/useTasks'
import { usePinnedNotes } from './hooks/usePinnedNotes'
import { IDE, DevFloatData } from './types'

type Tab = 'tasks' | 'notes' | 'settings'

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('tasks')
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(0.95)
  const [preferredIDE, setPreferredIDE] = useState<IDE>('vscode')
  const [watcherEnabled, setWatcherEnabled] = useState(false)

  const { tasks, addTask, updateTask, deleteTask, toggleStatus, saveOpacity, saveIDE, toggleWatcher } = useTasks(projectRoot)
  const { notes, addNote, updateNote, deleteNote } = usePinnedNotes(projectRoot)

  // Load last project root on app startup
  useEffect(() => {
    const loadProjectRoot = async () => {
      try {
        console.log('[App] Checking for window.devfloat...')
        if (!window.devfloat) {
          throw new Error('window.devfloat is undefined - preload script may not have loaded')
        }
        console.log('[App] window.devfloat is available:', window.devfloat)

        const lastRoot = await window.devfloat.config.getProjectRoot()
        console.log('[App] Last project root:', lastRoot)
        if (lastRoot) {
          setProjectRoot(lastRoot)
        }
      } catch (error) {
        console.error('[App] Error loading project root:', error)
        setApiError((error as Error).message)
      } finally {
        setIsLoading(false)
      }
    }

    loadProjectRoot()
  }, [])

  // Load opacity and restore window position when project root loads
  useEffect(() => {
    const loadSettingsAndRestore = async () => {
      if (!projectRoot) return

      try {
        // Load full data to get opacity, IDE preference, and window position
        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const loadedOpacity = data.settings?.opacity || 0.95
        const loadedIDE = data.settings?.preferredIDE || 'vscode'
        const windowPosition = data.settings?.windowPosition || { x: 1540, y: 100 }
        const loadedWatcherEnabled = data.settings?.watcherEnabled || false

        setOpacity(loadedOpacity)
        setPreferredIDE(loadedIDE)
        setWatcherEnabled(loadedWatcherEnabled)

        // Restore opacity and window position
        await window.devfloat.window.setOpacity(loadedOpacity)
        await window.devfloat.window.restorePosition(windowPosition)

        // Initialize watcher if enabled
        if (loadedWatcherEnabled) {
          try {
            await window.devfloat.watcher.start(projectRoot)
          } catch (error) {
            console.error('[App] Error starting watcher:', error)
          }
        }
      } catch (error) {
        console.error('[App] Error loading settings:', error)
      }
    }

    loadSettingsAndRestore()
  }, [projectRoot])

  const handleSelectProject = async (newRoot: string) => {
    try {
      if (!window.devfloat) {
        throw new Error('API not available')
      }
      // Stop watcher before changing project
      if (watcherEnabled) {
        try {
          await window.devfloat.watcher.stop()
        } catch (error) {
          console.error('[App] Error stopping watcher:', error)
        }
      }
      setProjectRoot(newRoot)
      await window.devfloat.config.setProjectRoot(newRoot)
    } catch (error) {
      console.error('[App] Error selecting project:', error)
    }
  }

  // Cleanup: stop watcher when app unmounts
  useEffect(() => {
    return () => {
      if (watcherEnabled) {
        window.devfloat?.watcher
          .stop()
          .catch((error) => console.error('[App] Error stopping watcher on cleanup:', error))
      }
    }
  }, [watcherEnabled])

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar projectName="DevFloat" onSelectProject={handleSelectProject} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar projectName="DevFloat" onSelectProject={handleSelectProject} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-400 mb-2 font-semibold">API Error</p>
            <p className="text-neutral-400 text-sm mb-4">{apiError}</p>
            <p className="text-neutral-500 text-xs">Check DevTools console (F12) for more details</p>
          </div>
        </div>
      </div>
    )
  }

  if (!projectRoot) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar projectName="DevFloat" onSelectProject={handleSelectProject} />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center draggable-no-drag">
            <p className="text-neutral-300 mb-4">Select a project folder to get started</p>
            <button
              onClick={() => {
                console.log('Select Folder button clicked')
                if (!window.devfloat) {
                  console.error('API not available')
                  return
                }
                window.devfloat.dialog
                  .selectFolder()
                  .then((folder) => {
                    console.log('Folder selected:', folder)
                    if (folder) {
                      handleSelectProject(folder)
                    }
                  })
                  .catch((err) => {
                    console.error('Error selecting folder:', err)
                  })
              }}
              className="draggable-no-drag px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition cursor-pointer"
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-300">
      <TitleBar projectName={projectRoot.split(/[\\/]/).pop() || 'DevFloat'} onSelectProject={handleSelectProject} />

      {/* Tab Navigation */}
      <div className="flex border-b border-neutral-700 px-4 py-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-3 py-1 text-sm font-medium transition ${
            activeTab === 'tasks'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-3 py-1 text-sm font-medium transition ${
            activeTab === 'notes'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Notes
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3 py-1 text-sm font-medium transition ${
            activeTab === 'settings'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' && (
          <TaskList
            tasks={tasks}
            onAddTask={addTask}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
            onToggleStatus={toggleStatus}
          />
        )}
        {activeTab === 'notes' && (
          <PinnedNotes notes={notes} onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote} />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel
            projectRoot={projectRoot}
            onSelectProject={handleSelectProject}
            initialOpacity={opacity}
            onOpacityChange={saveOpacity}
            initialIDE={preferredIDE}
            onIDEChange={saveIDE}
            initialWatcherEnabled={watcherEnabled}
            onWatcherToggle={async (enabled: boolean) => {
              await toggleWatcher(enabled)
              setWatcherEnabled(enabled) // Keep App state in sync so toggle persists across tab switches
            }}
          />
        )}
      </div>
    </div>
  )
}

export default App

