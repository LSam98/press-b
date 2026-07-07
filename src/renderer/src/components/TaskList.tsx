import { useState } from 'react'
import { Task, TaskType, Priority } from '../types'
import TaskForm from './TaskForm'
import TaskItem from './TaskItem'

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

// Build-output / cache dirs the watcher no longer scans (since v1.4.1).
// NOTE: keep in sync with IGNORED_DIR_NAMES in src/main/index.ts (separate bundle).
// Used to offer cleanup of legacy tasks that were auto-created from these dirs.
const BUILD_ARTIFACT_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  'target',
  '__pycache__',
  'venv',
  'vendor',
  'bin',
  'obj'
])

// True when a task's linked path lives inside a build-artifact dir (any segment
// matches — dist\win-unpacked\... etc). Paths here are project-relative.
function isBuildArtifactPath(relPath: string): boolean {
  return relPath
    .split(/[\\/]/)
    .some((segment) => BUILD_ARTIFACT_DIRS.has(segment.toLowerCase()))
}

interface TaskListProps {
  tasks: Task[]
  onAddTask: (task: Task) => void
  onUpdateTask: (task: Task) => void
  onDeleteTask: (id: string) => void
  onDeleteTasks: (ids: string[]) => void
  onToggleStatus: (id: string) => void
}

const TASK_TYPES: TaskType[] = ['TODO', 'BUG', 'REFACTOR', 'PENDING']

export default function TaskList({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onDeleteTasks,
  onToggleStatus
}: TaskListProps): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [activeTypes, setActiveTypes] = useState<TaskType[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done'>('all')
  const [linkedFileFilter, setLinkedFileFilter] = useState('')
  const [activeTagFilter, setActiveTagFilter] = useState('')
  const [noiseDismissed, setNoiseDismissed] = useState(false) // session-only "Keep"

  // Legacy noise: tasks linked into build-artifact dirs (created before the
  // watcher excluded them). Offered for one-click cleanup — never auto-deleted.
  const noiseTasks = tasks.filter((t) => t.linkedFile && isBuildArtifactPath(t.linkedFile))

  // Apply filters then sort open tasks by priority (high → medium → low)
  const filteredTasks = tasks.filter((task) => {
    if (activeTypes.length > 0 && !activeTypes.includes(task.type)) return false
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (linkedFileFilter && task.linkedFile !== linkedFileFilter) return false
    if (activeTagFilter && !(task.tags || []).includes(activeTagFilter)) return false
    return true
  })

  const openTasks = filteredTasks
    .filter((t) => t.status === 'open')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const doneTasks = filteredTasks.filter((t) => t.status === 'done')

  // Get unique linked files for filter suggestions
  const linkedFiles = Array.from(new Set(tasks.filter((t) => t.linkedFile).map((t) => t.linkedFile))) as string[]

  // Get unique tags across all tasks for filter chips
  const allTags = Array.from(new Set(tasks.flatMap((t) => t.tags || [])))

  const hasActiveFilters = activeTypes.length > 0 || statusFilter !== 'all' || linkedFileFilter !== '' || activeTagFilter !== ''

  const handleToggleType = (type: TaskType) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const clearFilters = () => {
    setActiveTypes([])
    setStatusFilter('all')
    setLinkedFileFilter('')
    setActiveTagFilter('')
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showForm && (
        <TaskForm
          onSubmit={(task) => {
            onAddTask(task)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="draggable-no-drag m-3 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition cursor-pointer"
        >
          + New Task
        </button>
      )}

      {/* Cleanup banner — legacy tasks auto-created from build outputs (dist/, out/…) */}
      {noiseTasks.length > 0 && !noiseDismissed && (
        <div className="flex-shrink-0 mx-3 mb-2 p-2 bg-amber-950/60 border border-amber-700/50 rounded flex items-center gap-2">
          <p className="flex-1 text-xs text-amber-200">
            {noiseTasks.length} task{noiseTasks.length === 1 ? '' : 's'} link to build artifacts
            (dist/, out/…) — likely watcher noise.
          </p>
          <button
            onClick={() => onDeleteTasks(noiseTasks.map((t) => t.id))}
            className="text-xs px-2 py-0.5 bg-amber-600 text-white rounded hover:bg-amber-500 transition cursor-pointer font-medium"
          >
            Clean up
          </button>
          <button
            onClick={() => setNoiseDismissed(true)}
            className="text-xs px-2 py-0.5 text-neutral-400 hover:text-neutral-200 transition cursor-pointer"
          >
            Keep
          </button>
        </div>
      )}

      {/* Filter Section */}
      <div className="flex-shrink-0 px-3 py-2 bg-neutral-800 border-b border-neutral-700 space-y-2">
        {/* Task Count */}
        <div className="text-xs text-neutral-400">
          {statusFilter === 'open' || statusFilter === 'all'
            ? `${openTasks.length} of ${tasks.filter((t) => t.status === 'open').length} open`
            : statusFilter === 'done'
            ? `${doneTasks.length} completed`
            : `${filteredTasks.length} of ${tasks.length} total`}
        </div>

        {/* Status Filter */}
        <div className="flex gap-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`text-xs px-2 py-1 rounded transition ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`text-xs px-2 py-1 rounded transition ${
              statusFilter === 'open'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setStatusFilter('done')}
            className={`text-xs px-2 py-1 rounded transition ${
              statusFilter === 'done'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
            }`}
          >
            Done
          </button>
        </div>

        {/* Type Filter */}
        <div className="flex flex-wrap gap-1">
          {TASK_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleToggleType(type)}
              className={`text-xs px-2 py-0.5 rounded border transition ${
                activeTypes.includes(type)
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-neutral-700 border-neutral-600 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Linked File Filter — dropdown to keep UI clean as project grows */}
        {linkedFiles.length > 0 && (
          <select
            value={linkedFileFilter}
            onChange={(e) => setLinkedFileFilter(e.target.value)}
            className={`w-full text-xs px-2 py-1 rounded border transition ${
              linkedFileFilter
                ? 'bg-blue-900 border-blue-600 text-blue-200'
                : 'bg-neutral-700 border-neutral-600 text-neutral-300'
            } focus:outline-none focus:border-blue-500`}
          >
            <option value="">🗂 Project Files</option>
            {linkedFiles.map((file) => (
              <option key={file} value={file}>
                {file}
              </option>
            ))}
          </select>
        )}

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTagFilter(activeTagFilter === tag ? '' : tag)}
                className={`text-xs px-2 py-0.5 rounded transition ${
                  activeTagFilter === tag
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-neutral-400 hover:text-neutral-200 transition"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Open tasks */}
        {openTasks.length > 0 ? (
          <div>
            {openTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onToggleStatus={onToggleStatus}
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-sm font-medium text-neutral-300">No tasks yet</p>
            <div className="mt-2 text-xs text-neutral-500 space-y-1.5">
              <p>
                Hit <span className="text-teal-400 font-medium">+ New Task</span> to add one
                manually.
              </p>
              <p>
                Or enable the <span className="text-neutral-300">File Watcher</span> in Settings to
                auto-capture{' '}
                <span className="font-mono text-neutral-400">// TODO:</span> /{' '}
                <span className="font-mono text-neutral-400">// REFACTOR:</span> comments from your
                code.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-neutral-500">All tasks done! 🎉</div>
        )}

        {/* Done tasks */}
        {doneTasks.length > 0 && (
          <div>
            <div className="px-4 py-2 bg-neutral-800 border-t border-neutral-700 sticky top-0">
              <p className="text-xs font-semibold text-neutral-500 uppercase">Completed ({doneTasks.length})</p>
            </div>
            {doneTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onToggleStatus={onToggleStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
