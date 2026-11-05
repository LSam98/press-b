import { useState, useRef, useEffect } from 'react'
import { Task, TaskType, Priority } from '../types'
import { v4 as uuidv4 } from 'uuid'

interface TaskFormProps {
  onSubmit: (task: Task) => void
  onCancel: () => void
  initialTask?: Task
  submitLabel?: string
}

const TASK_TYPES: TaskType[] = ['TODO', 'BUG', 'REFACTOR', 'PENDING']
const PRIORITIES: Priority[] = ['low', 'medium', 'high']
const DRAFT_CACHE_KEY = 'taskform-draft'

interface DraftData {
  title: string
  body: string
  type: TaskType
  priority: Priority
  linkedFile: string
  linkedLine: number
  tags: string[]
}

export default function TaskForm({
  onSubmit,
  onCancel,
  initialTask,
  submitLabel
}: TaskFormProps): React.JSX.Element {
  const [title, setTitle] = useState(initialTask?.title || '')
  const [body, setBody] = useState(initialTask?.body || '')
  const [type, setType] = useState<TaskType>(initialTask?.type || 'TODO')
  const [priority, setPriority] = useState<Priority>(initialTask?.priority || 'medium')
  const [linkedFile, setLinkedFile] = useState(initialTask?.linkedFile || '')
  const [linkedLine, setLinkedLine] = useState(initialTask?.linkedLine || 0)
  const [showLinking, setShowLinking] = useState(!!initialTask?.linkedFile)
  const [tags, setTags] = useState<string[]>(initialTask?.tags || [])
  const [tagInput, setTagInput] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-focus title field on mount
    if (titleRef.current) {
      titleRef.current.focus()
    }

    // Restore draft if editing new task (not initialTask)
    if (!initialTask) {
      try {
        const cached = localStorage.getItem(DRAFT_CACHE_KEY)
        if (cached) {
          const draft: DraftData = JSON.parse(cached)
          setTitle(draft.title)
          setBody(draft.body)
          setType(draft.type)
          setPriority(draft.priority)
          setLinkedFile(draft.linkedFile)
          setLinkedLine(draft.linkedLine)
          setTags(draft.tags || [])
        }
      } catch (error) {
        console.error('Error restoring draft:', error)
      }
    }
  }, [])

  // Auto-save draft to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initialTask) {
        try {
          const draft: DraftData = {
            title,
            body,
            type,
            priority,
            linkedFile,
            linkedLine,
            tags
          }
          localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(draft))
        } catch (error) {
          console.error('Error saving draft:', error)
        }
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [title, body, type, priority, linkedFile, linkedLine, tags, initialTask])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter to submit (Ctrl+Enter for textarea)
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      handleSubmit(e as any)
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const handleSelectFile = async () => {
    try {
      if (!window.pressB) {
        console.error('API not available')
        return
      }
      const file = await window.pressB.dialog.selectFile()
      if (file) {
        setLinkedFile(file)
      }
    } catch (error) {
      console.error('Error selecting file:', error)
    }
  }

  const handleClearLink = () => {
    setLinkedFile('')
    setLinkedLine(0)
    setShowLinking(false)
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const trimmed = tagInput.trim().replace(/^,|,$/g, '')
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed])
      }
      setTagInput('')
    }
    if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const task: Task = {
      id: initialTask?.id || uuidv4(),
      type,
      title: title.trim(),
      body: body.trim() || undefined,
      status: initialTask?.status || 'open',
      priority,
      createdAt: initialTask?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: tags.length > 0 ? tags : undefined,
      linkedFile: linkedFile.trim() || undefined,
      linkedLine: linkedLine > 0 ? linkedLine : undefined
    }

    // Clear draft cache after successful submission
    if (!initialTask) {
      try {
        localStorage.removeItem(DRAFT_CACHE_KEY)
      } catch (error) {
        console.error('Error clearing draft:', error)
      }
    }

    onSubmit(task)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3 bg-neutral-800 border-b border-neutral-700" onKeyDown={handleKeyDown}>
      <div>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title..."
          className="w-full px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Description (optional)..."
        className="w-full px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none resize-none h-16"
      />

      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TaskType)}
          className="flex-1 px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        >
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="flex-1 px-2 py-1 bg-neutral-700 text-neutral-100 text-sm rounded border border-neutral-600 focus:border-blue-500 focus:outline-none"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Tags Section */}
      <div className="flex flex-wrap items-center gap-1 min-h-[28px] px-2 py-1 bg-neutral-700 rounded border border-neutral-600 focus-within:border-blue-500">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-800 text-violet-200 text-xs rounded"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-white transition leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder={tags.length === 0 ? 'Add tags (Enter to confirm)…' : ''}
          className="flex-1 min-w-[100px] bg-transparent text-neutral-100 text-xs outline-none placeholder-neutral-500"
        />
      </div>

      {/* File Linking Section */}
      {!showLinking && (
        <button
          type="button"
          onClick={() => setShowLinking(true)}
          className="draggable-no-drag text-xs text-neutral-400 hover:text-blue-400 transition px-2 py-1 text-left"
        >
          🔗 Link to code
        </button>
      )}

      {showLinking && (
        <div className="p-2 bg-neutral-700 rounded border border-neutral-600 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={linkedFile}
              onChange={(e) => setLinkedFile(e.target.value)}
              placeholder="File path (relative to project)..."
              className="flex-1 px-2 py-1 bg-neutral-600 text-neutral-100 text-xs rounded border border-neutral-500 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSelectFile}
              className="draggable-no-drag px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition cursor-pointer"
              title="Browse for file"
            >
              Browse
            </button>
          </div>

          <input
            type="number"
            value={linkedLine}
            onChange={(e) => setLinkedLine(Math.max(0, parseInt(e.target.value) || 0))}
            placeholder="Line number..."
            min="0"
            className="w-full px-2 py-1 bg-neutral-600 text-neutral-100 text-xs rounded border border-neutral-500 focus:border-blue-500 focus:outline-none"
          />

          <button
            type="button"
            onClick={handleClearLink}
            className="draggable-no-drag text-xs text-neutral-400 hover:text-red-400 transition px-2 py-1"
          >
            Clear link
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="draggable-no-drag flex-1 px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
        >
          {submitLabel || (initialTask ? 'Confirm Changes' : 'Add Task')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="draggable-no-drag flex-1 px-3 py-1 bg-neutral-700 text-neutral-300 text-sm font-medium rounded hover:bg-neutral-600 transition cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
