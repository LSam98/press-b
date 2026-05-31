import { useState, useEffect, useCallback } from 'react'
import { PinnedNote, DevFloatData } from '../types'

export function usePinnedNotes(projectRoot: string | null) {
  const [notes, setNotes] = useState<PinnedNote[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load notes from storage
  const loadNotes = useCallback(async () => {
    if (!projectRoot) return

    setIsLoading(true)
    try {
      const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
      setNotes(data.pinnedNotes || [])
    } catch (error) {
      console.error('Error loading notes:', error)
      setNotes([])
    } finally {
      setIsLoading(false)
    }
  }, [projectRoot])

  // Save notes to storage
  const saveNotes = useCallback(
    async (newNotes: PinnedNote[]) => {
      if (!projectRoot) return

      try {
        const data = (await window.devfloat.storage.load(projectRoot)) as DevFloatData
        const updatedData: DevFloatData = {
          ...data,
          pinnedNotes: newNotes
        }
        await window.devfloat.storage.save(projectRoot, updatedData)
        setNotes(newNotes)
      } catch (error) {
        console.error('Error saving notes:', error)
      }
    },
    [projectRoot]
  )

  // Load notes on mount or when projectRoot changes
  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  // Add note
  const addNote = useCallback(
    (note: PinnedNote) => {
      const newNotes = [...notes, note]
      saveNotes(newNotes)
    },
    [notes, saveNotes]
  )

  // Delete note
  const deleteNote = useCallback(
    (id: string) => {
      const newNotes = notes.filter((n) => n.id !== id)
      saveNotes(newNotes)
    },
    [notes, saveNotes]
  )

  // Update note
  const updateNote = useCallback(
    (updatedNote: PinnedNote) => {
      const newNotes = notes.map((n) => (n.id === updatedNote.id ? updatedNote : n))
      saveNotes(newNotes)
    },
    [notes, saveNotes]
  )

  return { notes, isLoading, addNote, updateNote, deleteNote }
}
