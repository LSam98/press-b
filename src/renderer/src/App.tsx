import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import TaskList from './components/TaskList'
import PinnedNotes from './components/PinnedNotes'
import SettingsPanel from './components/SettingsPanel'
import AICompanionPanel from './components/AICompanionPanel'
import { useTasks } from './hooks/useTasks'
import { usePinnedNotes } from './hooks/usePinnedNotes'
import { useAI } from './hooks/useAI'
import {
  IDE,
  PressBData,
  AIPrivacyScope,
  SuggestionVolume,
  SuggestionLens,
  Suggestion,
  Task
} from './types'

type Tab = 'tasks' | 'notes' | 'companion' | 'settings'

function App(): React.JSX.Element {
  // AI Companion is the default landing tab — re-entering the app greets you with your brief
  const [activeTab, setActiveTab] = useState<Tab>('companion')
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [opacity, setOpacity] = useState(0.95)
  const [preferredIDE, setPreferredIDE] = useState<IDE>('vscode')
  const [watcherEnabled, setWatcherEnabled] = useState(false)
  const [aiModel, setAiModel] = useState('claude-sonnet-4-6')
  const [aiScope, setAiScope] = useState<AIPrivacyScope>('metadata+snippets')
  const [aiVolume, setAiVolume] = useState<SuggestionVolume>('balanced')
  const [aiLenses, setAiLenses] = useState<SuggestionLens[]>(['next-step'])

  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    deleteTasks,
    toggleStatus,
    saveOpacity,
    saveIDE,
    toggleWatcher,
    saveAIModel,
    saveAIScope,
    saveAISuggestionVolume,
    saveAISuggestionLenses
  } = useTasks(projectRoot)
  const { notes, addNote, updateNote, deleteNote } = usePinnedNotes(projectRoot)
  const {
    hasKey,
    brief,
    generatedAt: briefGeneratedAt,
    isGenerating,
    error: aiError,
    saveKey,
    generateBrief,
    suggestions,
    isSuggesting,
    suggestError,
    generateSuggestions,
    dismissSuggestion,
    removeSuggestion
  } = useAI(projectRoot)

  // Accept a suggestion → create a real task, then drop the card
  const handleAcceptSuggestion = (s: Suggestion): void => {
    const now = new Date().toISOString()
    const task: Task = {
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: s.taskType,
      title: s.title,
      body: s.body || undefined,
      status: 'open',
      priority: s.priority,
      createdAt: now,
      updatedAt: now,
      tags: ['ai-suggested'],
      // Already sanitized in main; carry through so the task is click-to-open.
      // Cheap guard: only attach a line if there's a file to anchor it to.
      linkedFile: s.linkedFile || undefined,
      linkedLine: s.linkedFile ? s.linkedLine : undefined
    }
    addTask(task)
    removeSuggestion(s)
  }

  // Load last project root on app startup
  useEffect(() => {
    const loadProjectRoot = async () => {
      try {
        console.log('[App] Checking for window.pressB...')
        if (!window.pressB) {
          throw new Error('window.pressB is undefined - preload script may not have loaded')
        }
        console.log('[App] window.pressB is available:', window.pressB)

        const lastRoot = await window.pressB.config.getProjectRoot()
        console.log('[App] Last project root:', lastRoot)
        if (lastRoot) {
          setProjectRoot(lastRoot)
        }
        setRecentProjects(await window.pressB.config.getRecentProjects())
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
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        const loadedOpacity = data.settings?.opacity || 0.95
        const loadedIDE = data.settings?.preferredIDE || 'vscode'
        const windowPosition = data.settings?.windowPosition || { x: 1540, y: 100 }
        const loadedWatcherEnabled = data.settings?.watcherEnabled || false
        const loadedAIModel = data.settings?.aiModel || 'claude-sonnet-4-6'
        const loadedAIScope = data.settings?.aiPrivacyScope || 'metadata+snippets'
        const loadedAIVolume = data.settings?.aiSuggestionVolume || 'balanced'
        const loadedAILenses = data.settings?.aiSuggestionLenses?.length
          ? data.settings.aiSuggestionLenses
          : (['next-step'] as SuggestionLens[])

        setOpacity(loadedOpacity)
        setPreferredIDE(loadedIDE)
        setWatcherEnabled(loadedWatcherEnabled)
        setAiModel(loadedAIModel)
        setAiScope(loadedAIScope)
        setAiVolume(loadedAIVolume)
        setAiLenses(loadedAILenses)

        // Restore opacity and window position
        await window.pressB.window.setOpacity(loadedOpacity)
        await window.pressB.window.restorePosition(windowPosition)

        // Initialize watcher if enabled
        if (loadedWatcherEnabled) {
          try {
            await window.pressB.watcher.start(projectRoot)
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
      if (!window.pressB) {
        throw new Error('API not available')
      }
      // Stop watcher before changing project
      if (watcherEnabled) {
        try {
          await window.pressB.watcher.stop()
        } catch (error) {
          console.error('[App] Error stopping watcher:', error)
        }
      }
      setProjectRoot(newRoot)
      await window.pressB.config.setProjectRoot(newRoot)
      // Main already pushed newRoot onto recents — pull the updated list back
      setRecentProjects(await window.pressB.config.getRecentProjects())
    } catch (error) {
      console.error('[App] Error selecting project:', error)
    }
  }

  // Forget a project from the recents list (does not change the active project)
  const handleRemoveRecent = async (root: string): Promise<void> => {
    try {
      setRecentProjects(await window.pressB.config.removeRecentProject(root))
    } catch (error) {
      console.error('[App] Error removing recent project:', error)
    }
  }

  // Cleanup: stop watcher when app unmounts
  useEffect(() => {
    return () => {
      if (watcherEnabled) {
        window.pressB?.watcher
          .stop()
          .catch((error) => console.error('[App] Error stopping watcher on cleanup:', error))
      }
    }
  }, [watcherEnabled])

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar projectName="Press B" onSelectProject={handleSelectProject} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (apiError) {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        <TitleBar projectName="Press B" onSelectProject={handleSelectProject} />
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
    const openFolder = (): void => {
      if (!window.pressB) return
      window.pressB.dialog
        .selectFolder()
        .then((folder) => {
          if (folder) handleSelectProject(folder)
        })
        .catch((err) => console.error('Error selecting folder:', err))
    }

    return (
      <div className="flex flex-col h-screen bg-neutral-900 text-neutral-300">
        <TitleBar projectName="Press B" onSelectProject={handleSelectProject} />
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-5">
          <div className="w-full max-w-xs draggable-no-drag">
            <div className="text-center mb-5">
              <p className="text-lg font-semibold text-teal-400">✦ Press B</p>
              <p className="text-xs text-neutral-500 mt-1">
                Your floating task & context layer. Open a project to begin.
              </p>
            </div>

            <button
              onClick={openFolder}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
            >
              Open a project folder
            </button>

            {recentProjects.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1.5">
                  Recent projects
                </p>
                <div className="flex flex-col gap-1">
                  {recentProjects.map((root) => (
                    <div
                      key={root}
                      className="group flex items-center px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700/70 cursor-pointer"
                      onClick={() => handleSelectProject(root)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-neutral-200 truncate">
                          {root.split(/[\\/]/).filter(Boolean).pop()}
                        </div>
                        <div className="text-[10px] text-neutral-500 truncate">{root}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveRecent(root)
                        }}
                        className="ml-1 px-1 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        title="Forget this project"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-neutral-600 text-center mt-5">
              Press <span className="font-mono text-neutral-500">Ctrl+Shift+F</span> anywhere to
              toggle Press B.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-300">
      <TitleBar
        projectName={projectRoot.split(/[\\/]/).pop() || 'Press B'}
        onSelectProject={handleSelectProject}
        currentRoot={projectRoot}
        recentProjects={recentProjects}
        onRemoveRecent={handleRemoveRecent}
      />

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
          onClick={() => setActiveTab('companion')}
          className={`px-3 py-1 text-sm font-medium transition ${
            activeTab === 'companion'
              ? 'text-amber-400 border-b-2 border-amber-400'
              : 'text-amber-600/70 hover:text-amber-400'
          }`}
        >
          ✦ AI Companion
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
            onDeleteTasks={deleteTasks}
            onToggleStatus={toggleStatus}
          />
        )}
        {activeTab === 'notes' && (
          <PinnedNotes notes={notes} onAddNote={addNote} onUpdateNote={updateNote} onDeleteNote={deleteNote} />
        )}
        {activeTab === 'companion' && (
          <AICompanionPanel
            hasKey={hasKey}
            brief={brief}
            briefGeneratedAt={briefGeneratedAt}
            isGeneratingBrief={isGenerating}
            briefError={aiError}
            onGenerateBrief={generateBrief}
            suggestions={suggestions}
            isSuggesting={isSuggesting}
            suggestError={suggestError}
            onGenerateSuggestions={generateSuggestions}
            onAcceptSuggestion={handleAcceptSuggestion}
            onDismissSuggestion={dismissSuggestion}
            onGoToSettings={() => setActiveTab('settings')}
          />
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
            aiHasKey={hasKey}
            onSaveKey={saveKey}
            initialAIModel={aiModel}
            onAIModelChange={async (model: string) => {
              setAiModel(model)
              await saveAIModel(model)
            }}
            initialAIScope={aiScope}
            onAIScopeChange={async (scope: AIPrivacyScope) => {
              setAiScope(scope)
              await saveAIScope(scope)
            }}
            initialAIVolume={aiVolume}
            onAIVolumeChange={async (volume: SuggestionVolume) => {
              setAiVolume(volume)
              await saveAISuggestionVolume(volume)
            }}
            initialAILenses={aiLenses}
            onAILensesChange={async (lenses: SuggestionLens[]) => {
              setAiLenses(lenses)
              await saveAISuggestionLenses(lenses)
            }}
          />
        )}
      </div>
    </div>
  )
}

export default App

