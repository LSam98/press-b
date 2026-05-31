import { useState, useEffect, useCallback } from 'react'
import { Task, DevFloatData, IDE } from '../types'

export function useTasks(projectRoot: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load tasks from storage
  const loadTasks = useCallback(async () => {
    if (!projectRoot) return

    setIsLoading(true)
    try {
      const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
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
        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const updatedData: DevFloatData = {
          ...data,
          tasks: newTasks
        }
        await window.devfloat.storage.save(projectRoot, updatedData)
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
    const unsubscribe = window.devfloat.onTasksUpdated(loadTasks)
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
        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const updatedData: DevFloatData = {
          ...data,
          settings: {
            ...data.settings,
            opacity
          }
        }
        await window.devfloat.storage.save(projectRoot, updatedData)
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
        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const updatedData: DevFloatData = {
          ...data,
          settings: {
            ...data.settings,
            preferredIDE: ide
          }
        }
        await window.devfloat.storage.save(projectRoot, updatedData)
      } catch (error) {
        console.error('Error saving IDE preference:', error)
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
          await window.devfloat.watcher.start(projectRoot)
        } else {
          await window.devfloat.watcher.stop()
        }

        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const updatedData: DevFloatData = {
          ...data,
          settings: {
            ...data.settings,
            watcherEnabled: enabled
          }
        }
        await window.devfloat.storage.save(projectRoot, updatedData)
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
    toggleWatcher
  }
}
