import { useState, useEffect } from 'react'
import { IDE } from '../types'

interface SettingsPanelProps {
  projectRoot: string
  onSelectProject: (projectRoot: string) => void
  onOpacityChange?: (opacity: number) => Promise<void>
  onIDEChange?: (ide: IDE) => Promise<void>
  onWatcherToggle?: (enabled: boolean) => Promise<void>
  initialOpacity?: number
  initialIDE?: IDE
  initialWatcherEnabled?: boolean
}

export default function SettingsPanel({
  projectRoot,
  onSelectProject,
  onOpacityChange,
  onIDEChange,
  onWatcherToggle,
  initialOpacity = 0.95,
  initialIDE = 'vscode',
  initialWatcherEnabled = false
}: SettingsPanelProps): React.JSX.Element {
  const [opacity, setOpacity] = useState(initialOpacity)
  const [preferredIDE, setPreferredIDE] = useState<IDE>(initialIDE)
  const [watcherEnabled, setWatcherEnabled] = useState(initialWatcherEnabled)

  useEffect(() => {
    // Load initial opacity from props
    setOpacity(initialOpacity)
  }, [initialOpacity])

  const handleOpacityChange = async (value: number) => {
    setOpacity(value)
    try {
      if (!window.devfloat) {
        console.error('API not available')
        return
      }
      await window.devfloat.window.setOpacity(value)
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
      if (!window.devfloat) {
        console.error('API not available')
        return
      }
      const folder = await window.devfloat.dialog.selectFolder()
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
            <span className="font-semibold">DevFloat</span> v1.0.0
          </p>
          <p>A floating task and context layer for developers.</p>
        </div>
      </div>
    </div>
  )
}
