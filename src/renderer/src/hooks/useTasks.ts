import { useState, useEffect, useCallback } from 'react'
import { Task, PressBData, IDE, AIPrivacyScope, SuggestionVolume, SuggestionLens } from '../types'

export function useTasks(projectRoot: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load tasks from storage
  const loadTasks = useCallback(async () => {
    if (!projectRoot) return

    setIsLoading(true)
    try {
      const data = (await window.pressB.storage.load(projectRoot)) as PressBData
      setTasks(data.tasks || [])
    } catch (error) {
      console.error('Error loading tasks:', error)
      setTasks([])
    } finally {
      setIsLoading(false)
    }
  }, [projectRoot])

  // Save tasks to storage
  const saveTasks = useCallback(
    async (newTasks: Task[]) => {
      if (!projectRoot) return

      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        const updatedData: PressBData = {
          ...data,
          tasks: newTasks
        }
        await window.pressB.storage.save(projectRoot, updatedData)
        setTasks(newTasks)
      } catch (error) {
        console.error('Error saving tasks:', error)
      }
    },
    [projectRoot]
  )

  // Load tasks on mount or when projectRoot changes
  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Listen for real-time push from the file watcher (main process)
  useEffect(() => {
    if (!projectRoot) return
    const unsubscribe = window.pressB.onTasksUpdated(loadTasks)
    return unsubscribe
  }, [projectRoot, loadTasks])

  // Add task
  const addTask = useCallback(
    (task: Task) => {
      const newTasks = [...tasks, task]
      saveTasks(newTasks)
    },
    [tasks, saveTasks]
  )

  // Update task
  const updateTask = useCallback(
    (updatedTask: Task) => {
      const newTasks = tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      saveTasks(newTasks)
    },
    [tasks, saveTasks]
  )

  // Delete task
  const deleteTask = useCallback(
    (id: string) => {
      const newTasks = tasks.filter((t) => t.id !== id)
      saveTasks(newTasks)
    },
    [tasks, saveTasks]
  )

  // Toggle task status
  const toggleStatus = useCallback(
    (id: string) => {
      const newTasks = tasks.map((t) => {
        if (t.id === id) {
          const newStatus: 'done' | 'open' = t.status === 'open' ? 'done' : 'open'
          return {
            ...t,
            status: newStatus,
            updatedAt: new Date().toISOString()
          }
        }
        return t
      })
      saveTasks(newTasks)
    },
    [tasks, saveTasks]
  )

  // Save opacity to settings
  const saveOpacity = useCallback(
    async (opacity: number) => {
      if (!projectRoot) return

      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        const updatedData: PressBData = {
          ...data,
          settings: {
            ...data.settings,
            opacity
          }
        }
        await window.pressB.storage.save(projectRoot, updatedData)
      } catch (error) {
        console.error('Error saving opacity:', error)
      }
    },
    [projectRoot]
  )

  // Save preferred IDE to settings
  const saveIDE = useCallback(
    async (ide: IDE) => {
      if (!projectRoot) return

      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        const updatedData: PressBData = {
          ...data,
          settings: {
            ...data.settings,
            preferredIDE: ide
          }
        }
        await window.pressB.storage.save(projectRoot, updatedData)
      } catch (error) {
        console.error('Error saving IDE preference:', error)
      }
    },
    [projectRoot]
  )

  // Save AI model preference to settings
  const saveAIModel = useCallback(
    async (model: string) => {
      if (!projectRoot) return
      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        await window.pressB.storage.save(projectRoot, {
          ...data,
          settings: { ...data.settings, aiModel: model }
        })
      } catch (error) {
        console.error('Error saving AI model:', error)
      }
    },
    [projectRoot]
  )

  // Save AI privacy scope to settings
  const saveAIScope = useCallback(
    async (scope: AIPrivacyScope) => {
      if (!projectRoot) return
      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        await window.pressB.storage.save(projectRoot, {
          ...data,
          settings: { ...data.settings, aiPrivacyScope: scope }
        })
      } catch (error) {
        console.error('Error saving AI privacy scope:', error)
      }
    },
    [projectRoot]
  )

  // Save AI suggestion volume to settings
  const saveAISuggestionVolume = useCallback(
    async (volume: SuggestionVolume) => {
      if (!projectRoot) return
      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        await window.pressB.storage.save(projectRoot, {
          ...data,
          settings: { ...data.settings, aiSuggestionVolume: volume }
        })
      } catch (error) {
        console.error('Error saving AI suggestion volume:', error)
      }
    },
    [projectRoot]
  )

  // Save AI suggestion lenses to settings
  const saveAISuggestionLenses = useCallback(
    async (lenses: SuggestionLens[]) => {
      if (!projectRoot) return
      try {
        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        await window.pressB.storage.save(projectRoot, {
          ...data,
          settings: { ...data.settings, aiSuggestionLenses: lenses }
        })
      } catch (error) {
        console.error('Error saving AI suggestion lenses:', error)
      }
    },
    [projectRoot]
  )

  // Toggle file watcher
  const toggleWatcher = useCallback(
    async (enabled: boolean) => {
      if (!projectRoot) return

      try {
        if (enabled) {
          await window.pressB.watcher.start(projectRoot)
        } else {
          await window.pressB.watcher.stop()
        }

        const data = (await window.pressB.storage.load(projectRoot)) as PressBData
        const updatedData: PressBData = {
          ...data,
          settings: {
            ...data.settings,
            watcherEnabled: enabled
          }
        }
        await window.pressB.storage.save(projectRoot, updatedData)
      } catch (error) {
        console.error('Error toggling watcher:', error)
      }
    },
    [projectRoot]
  )

  return {
    tasks,
    isLoading,
    addTask,
    updateTask,
    deleteTask,
    toggleStatus,
    saveOpacity,
    saveIDE,
    toggleWatcher,
    saveAIModel,
    saveAIScope,
    saveAISuggestionVolume,
    saveAISuggestionLenses
  }
}
