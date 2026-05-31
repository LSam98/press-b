import { useState } from 'react'
import { Task, TaskType } from '../types'
import TaskForm from './TaskForm'

interface TaskItemProps {
  task: Task
  onUpdate: (task: Task) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string) => void
}

const TASK_TYPE_COLORS: Record<TaskType, string> = {
  TODO: 'bg-blue-900 text-blue-200 border-blue-700',
  BUG: 'bg-red-900 text-red-200 border-red-700',
  REFACTOR: 'bg-teal-900 text-teal-200 border-teal-700',
  NOTE: 'bg-amber-900 text-amber-200 border-amber-700',
  CHEATSHEET: 'bg-purple-900 text-purple-200 border-purple-700',
  PENDING: 'bg-orange-900 text-orange-200 border-orange-700'
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-green-400'
}

// Helper: Format file path to show relative path (src/file_name)
function formatFilePath(filePath: string): string {
  // If path contains forward slashes or backslashes, extract the meaningful parts
  const separator = filePath.includes('\\') ? '\\' : '/'
  const parts = filePath.split(separator)
  
  // Show last 2 parts (folder/filename) or just filename if only one part
  if (parts.length >= 2) {
    return parts.slice(-2).join('/')
  }
  return parts[parts.length - 1] || filePath
}

export default function TaskItem({ task, onUpdate, onDelete, onToggleStatus }: TaskItemProps): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  if (isEditing) {
    return (
      <TaskForm
        initialTask={task}
        onSubmit={(updatedTask) => {
          onUpdate(updatedTask)
          setIsEditing(false)
        }}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  const handleStatusToggle = () => {
    setIsTogglingStatus(true)
    onToggleStatus(task.id)
    // Clear pulse animation after completion
    setTimeout(() => setIsTogglingStatus(false), 600)
  }

  const handleDelete = () => {
    setIsDeleting(true)
    // Allow slide-out animation to complete before calling delete
    setTimeout(() => {
      onDelete(task.id)
    }, 300)
  }

  const handleOpenLinkedFile = async () => {
    if (!task.linkedFile || !window.devfloat) {
      console.error('No linked file or API not available')
      return
    }
    try {
      await window.devfloat.shell.openFile(task.linkedFile, task.linkedLine)
    } catch (error) {
      console.error('Error opening file:', error)
    }
  }

  return (
    <div
      className={`flex gap-3 p-3 border-b border-neutral-700 hover:bg-neutral-800/50 transition ${
        isDeleting ? 'animate-slideOut' : 'animate-fadeIn'
      }`}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={handleStatusToggle}
        className={`mt-1 w-4 h-4 rounded border-neutral-600 bg-neutral-700 cursor-pointer transition ${
          isTogglingStatus ? 'animate-pulse-brief' : ''
        }`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          {/* Type Badge */}
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded border ${TASK_TYPE_COLORS[task.type]}`}
          >
            {task.type}
          </span>

          {/* Priority */}
          <span className={`text-xs font-medium ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>

          {/* Linked File Badge */}
          {task.linkedFile && (
            <button
              onClick={handleOpenLinkedFile}
              className="text-xs text-blue-300 bg-blue-900 px-2 py-0.5 rounded border border-blue-700 flex items-center gap-1 hover:bg-blue-800 hover:text-blue-200 transition cursor-pointer"
              title={`${task.linkedFile}:${task.linkedLine || 'start'}`}
            >
              <span>🔗</span>
              <span className="truncate max-w-[150px]">
                {formatFilePath(task.linkedFile)}
                {task.linkedLine && `:${task.linkedLine}`}
              </span>
            </button>
          )}

          {/* Status */}
          {task.status === 'done' && <span className="text-xs text-neutral-500 line-through">Done</span>}
        </div>

        {/* Title */}
        <p
          className={`text-sm font-medium break-words cursor-pointer hover:text-blue-400 transition ${
            task.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-200'
          }`}
          onClick={() => setIsEditing(true)}
        >
          {task.title}
        </p>

        {/* Body preview */}
        {task.body && (
          <p className="text-xs text-neutral-400 mt-1 line-clamp-2 cursor-pointer hover:text-neutral-300" onClick={() => setIsEditing(true)}>
            {task.body}
          </p>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-violet-900 text-violet-300 text-xs rounded border border-violet-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => setIsEditing(true)}
          className="p-1 text-neutral-400 hover:text-neutral-300 transition"
          title="Edit task"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12.146.854a.5.5 0 0 1 .708 0l2.292 2.292a.5.5 0 0 1 0 .708l-10.5 10.5a.5.5 0 0 1-.208.082l-4.5 1.5a.5.5 0 0 1-.65-.65l1.5-4.5a.5.5 0 0 1 .082-.208l10.5-10.5z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="p-1 text-neutral-400 hover:text-red-400 transition"
          title="Delete task"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
            <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 1a.5.5 0 0 0-.5.5v1h11V1.5a.5.5 0 0 0-.5-.5H2.5z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
