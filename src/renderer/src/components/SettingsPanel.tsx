import { useState, useEffect } from 'react'
import { IDE, AIPrivacyScope, SuggestionVolume, SuggestionLens } from '../types'

interface SettingsPanelProps {
  projectRoot: string
  onSelectProject: (projectRoot: string) => void
  onOpacityChange?: (opacity: number) => Promise<void>
  onIDEChange?: (ide: IDE) => Promise<void>
  onWatcherToggle?: (enabled: boolean) => Promise<void>
  initialOpacity?: number
  initialIDE?: IDE
  initialWatcherEnabled?: boolean
  // AI
  aiHasKey?: boolean
  onSaveKey?: (apiKey: string) => Promise<void>
  initialAIModel?: string
  onAIModelChange?: (model: string) => Promise<void>
  initialAIScope?: AIPrivacyScope
  onAIScopeChange?: (scope: AIPrivacyScope) => Promise<void>
  initialAIVolume?: SuggestionVolume
  onAIVolumeChange?: (volume: SuggestionVolume) => Promise<void>
  initialAILenses?: SuggestionLens[]
  onAILensesChange?: (lenses: SuggestionLens[]) => Promise<void>
}

const ALL_LENSES: { value: SuggestionLens; label: string }[] = [
  { value: 'next-step', label: 'Next-step planning' },
  { value: 'code-quality', label: 'Code quality / refactors' },
  { value: 'missing-tests', label: 'Missing tests' },
  { value: 'architecture', label: 'Architecture' }
]

export default function SettingsPanel({
  projectRoot,
  onSelectProject,
  onOpacityChange,
  onIDEChange,
  onWatcherToggle,
  initialOpacity = 0.95,
  initialIDE = 'vscode',
  initialWatcherEnabled = false,
  aiHasKey = false,
  onSaveKey,
  initialAIModel = 'claude-sonnet-4-6',
  onAIModelChange,
  initialAIScope = 'metadata+snippets',
  onAIScopeChange,
  initialAIVolume = 'balanced',
  onAIVolumeChange,
  initialAILenses = ['next-step'],
  onAILensesChange
}: SettingsPanelProps): React.JSX.Element {
  const [opacity, setOpacity] = useState(initialOpacity)
  const [preferredIDE, setPreferredIDE] = useState<IDE>(initialIDE)
  const [watcherEnabled, setWatcherEnabled] = useState(initialWatcherEnabled)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [aiModel, setAiModel] = useState(initialAIModel)
  const [aiScope, setAiScope] = useState<AIPrivacyScope>(initialAIScope)
  const [aiVolume, setAiVolume] = useState<SuggestionVolume>(initialAIVolume)
  const [aiLenses, setAiLenses] = useState<SuggestionLens[]>(initialAILenses)

  const toggleLens = async (lens: SuggestionLens): Promise<void> => {
    const next = aiLenses.includes(lens)
      ? aiLenses.filter((l) => l !== lens)
      : [...aiLenses, lens]
    setAiLenses(next)
    if (onAILensesChange) await onAILensesChange(next)
  }

  useEffect(() => {
    // Load initial opacity from props
    setOpacity(initialOpacity)
  }, [initialOpacity])

  const handleOpacityChange = async (value: number) => {
    setOpacity(value)
    try {
      if (!window.pressB) {
        console.error('API not available')
        return
      }
      await window.pressB.window.setOpacity(value)
      // Call the callback if provided (to save opacity to settings)
      if (onOpacityChange) {
        await onOpacityChange(value)
      }
    } catch (error) {
      console.error('Error setting window opacity:', error)
    }
  }

  const handleSelectFolder = async () => {
    try {
      if (!window.pressB) {
        console.error('API not available')
        return
      }
      const folder = await window.pressB.dialog.selectFolder()
      if (folder) {
        onSelectProject(folder)
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
    }
  }

  const handleWatcherToggle = async (enabled: boolean) => {
    setWatcherEnabled(enabled)
    if (onWatcherToggle) {
      try {
        await onWatcherToggle(enabled)
      } catch (error) {
        console.error('Error toggling watcher:', error)
        setWatcherEnabled(!enabled)
      }
    }
  }

  const handleSaveKey = async () => {
    if (!onSaveKey) return
    try {
      await onSaveKey(apiKeyInput.trim())
      setApiKeyInput('')
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 2500)
    } catch (error) {
      console.error('Error saving API key:', error)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      {/* Project Root Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">Project Root</h3>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-400 break-all bg-neutral-800 p-2 rounded">{projectRoot}</p>
          <button
            onClick={handleSelectFolder}
            className="draggable-no-drag px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
          >
            Change Project
          </button>
        </div>
      </div>

      {/* Opacity Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">Window Opacity</h3>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => {
              const value = parseFloat(e.target.value)
              handleOpacityChange(value)
            }}
            className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-neutral-400 w-8 text-right">{Math.round(opacity * 100)}%</span>
        </div>
      </div>

      {/* IDE Selection Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">Preferred IDE</h3>
        <select
          value={preferredIDE}
          onChange={async (e) => {
            const ide = e.target.value as IDE
            setPreferredIDE(ide)
            if (onIDEChange) {
              await onIDEChange(ide)
            }
          }}
          className="w-full px-2 py-2 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="vscode">VS Code</option>
          <option value="cursor">Cursor</option>
          <option value="intellij">IntelliJ IDEA</option>
          <option value="pycharm">PyCharm</option>
          <option value="sublime">Sublime Text</option>
          <option value="neovim">Neovim</option>
          <option value="custom">Custom Command</option>
        </select>
        <p className="text-xs text-neutral-400 mt-2">Used for opening linked files in your IDE.</p>
      </div>

      {/* File Watcher Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">File Watcher</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={watcherEnabled}
            onChange={(e) => handleWatcherToggle(e.target.checked)}
            disabled={!projectRoot}
            className="w-4 h-4 rounded cursor-pointer"
          />
          <span className="text-sm text-neutral-300">
            Watch project files for TODO/REFACTOR comments {watcherEnabled ? '(watching)' : '(stopped)'}
          </span>
        </label>
        <p className="text-xs text-neutral-400 mt-2">
          Automatically create tasks from code comments. Disabled until a project is selected.
        </p>
      </div>

      {/* AI Assistant Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">
          AI Assistant {aiHasKey && <span className="text-xs text-green-400 font-normal">key saved ✓</span>}
        </h3>

        {/* API Key */}
        <div className="flex gap-2 mb-2">
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={aiHasKey ? 'Replace stored key…' : 'Paste Anthropic API key (sk-ant-…)'}
            className="flex-1 px-2 py-1 bg-neutral-700 text-neutral-100 text-xs rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSaveKey}
            disabled={!apiKeyInput.trim()}
            className="draggable-no-drag px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition cursor-pointer disabled:opacity-40"
          >
            {keySaved ? 'Saved' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          Stored encrypted on this machine — never written to your project files. Used for the
          Re-entry Brief.
        </p>

        {/* Model */}
        <label className="text-xs text-neutral-400 block mb-1">Model</label>
        <select
          value={aiModel}
          onChange={async (e) => {
            setAiModel(e.target.value)
            if (onAIModelChange) await onAIModelChange(e.target.value)
          }}
          className="w-full px-2 py-2 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none mb-3"
        >
          <option value="claude-haiku-4-5">Claude Haiku 4.5 (fast, cheap)</option>
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (balanced)</option>
          <option value="claude-opus-4-8">Claude Opus 4.8 (most capable)</option>
        </select>

        {/* Privacy scope */}
        <label className="text-xs text-neutral-400 block mb-1">Data shared with the API</label>
        <select
          value={aiScope}
          onChange={async (e) => {
            const scope = e.target.value as AIPrivacyScope
            setAiScope(scope)
            if (onAIScopeChange) await onAIScopeChange(scope)
          }}
          className="w-full px-2 py-2 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="metadata">Metadata only (no code)</option>
          <option value="metadata+snippets">Metadata + linked code snippets</option>
          <option value="broad">Broad (metadata + snippets)</option>
        </select>
        <p className="text-xs text-neutral-500 mt-2">
          Controls what leaves your machine. Default sends task/note metadata plus a few lines
          around each linked code location.
        </p>

        {/* Suggestion volume */}
        <label className="text-xs text-neutral-400 block mb-1 mt-4">
          Suggestion volume <span className="text-amber-500/80">(AI Companion)</span>
        </label>
        <select
          value={aiVolume}
          onChange={async (e) => {
            const v = e.target.value as SuggestionVolume
            setAiVolume(v)
            if (onAIVolumeChange) await onAIVolumeChange(v)
          }}
          className="w-full px-2 py-2 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-amber-500 focus:outline-none mb-3"
        >
          <option value="minimal">Minimal — at most 1, only if it really matters</option>
          <option value="balanced">Balanced — up to 2</option>
          <option value="proactive">Proactive — up to 3</option>
        </select>

        {/* Suggestion lenses */}
        <label className="text-xs text-neutral-400 block mb-1">Suggestion focus (lenses)</label>
        <div className="flex flex-col gap-1.5">
          {ALL_LENSES.map((lens) => (
            <label key={lens.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={aiLenses.includes(lens.value)}
                onChange={() => toggleLens(lens.value)}
                className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
              />
              <span className="text-xs text-neutral-300">{lens.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          Volume controls how many; lenses control what kind. Suggestions only run when you click
          in the AI Companion tab.
        </p>
      </div>

      {/* Keyboard Shortcut Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">Keyboard Shortcut</h3>
        <p className="text-xs text-neutral-400 bg-neutral-800 p-2 rounded">
          Press <span className="font-mono text-neutral-300">Ctrl+Shift+F</span> (Windows/Linux) or{' '}
          <span className="font-mono text-neutral-300">Cmd+Shift+F</span> (Mac) to toggle the window visibility.
        </p>
      </div>

      {/* About Section */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-200 mb-2">About</h3>
        <div className="text-xs text-neutral-400 space-y-1">
          <p>
            <span className="font-semibold">Press B</span> v1.4.0
          </p>
          <p>A floating task and context layer for developers.</p>
        </div>
      </div>
    </div>
  )
}
