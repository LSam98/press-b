import { useState, useRef, useEffect } from 'react'
import { PinnedNote } from '../types'

interface NoteFormProps {
  onSubmit: (note: PinnedNote) => void
  onCancel: () => void
  initialNote?: PinnedNote
  submitLabel?: string
}

const DRAFT_CACHE_KEY = 'noteform-draft'

interface DraftData {
  title: string
  content: string
}

export default function NoteForm({
  onSubmit,
  onCancel,
  initialNote,
  submitLabel
}: NoteFormProps): React.JSX.Element {
  const [title, setTitle] = useState(initialNote?.title || '')
  const [content, setContent] = useState(initialNote?.content || '')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-focus title field on mount
    if (titleRef.current) {
      titleRef.current.focus()
    }

    // Restore draft if editing new note (not initialNote)
    if (!initialNote) {
      try {
        const cached = localStorage.getItem(DRAFT_CACHE_KEY)
        if (cached) {
          const draft: DraftData = JSON.parse(cached)
          setTitle(draft.title)
          setContent(draft.content)
        }
      } catch (error) {
        console.error('Error restoring draft:', error)
      }
    }
  }, [])

  // Auto-save draft to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initialNote) {
        try {
          const draft: DraftData = {
            title,
            content
          }
          localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(draft))
        } catch (error) {
          console.error('Error saving draft:', error)
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [title, content, initialNote])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    const note: PinnedNote = {
      id: initialNote?.id || crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      createdAt: initialNote?.createdAt || new Date().toISOString()
    }

    // Clear cache on successful submission
    if (!initialNote) {
      localStorage.removeItem(DRAFT_CACHE_KEY)
    }

    onSubmit(note)
  }

  const handleCancelClick = () => {
    // Clear cache on cancel
    if (!initialNote) {
      localStorage.removeItem(DRAFT_CACHE_KEY)
    }
    onCancel()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 bg-neutral-800 border-b border-neutral-700" onKeyDown={handleKeyDown}>
      <div>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="w-full px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Note content..."
        className="w-full px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none resize-none h-20"
      />

      <div className="flex gap-2">
        <button
          type="submit"
          className="draggable-no-drag flex-1 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
        >
          {submitLabel || (initialNote ? 'Confirm Changes' : 'Add Note')}
        </button>
        <button
          type="button"
          onClick={handleCancelClick}
          className="draggable-no-drag flex-1 px-3 py-1 bg-neutral-700 text-neutral-300 text-sm font-medium rounded hover:bg-neutral-600 transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
