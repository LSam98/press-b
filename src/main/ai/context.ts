// Assembles a compact "project digest" from .pressb.json — the structured
// signal Press B already holds (tasks, priorities, notes, file links) plus a
// bounded window of code around each linked line. This text block is what the
// AI provider receives as stable, cacheable context.

import * as fs from 'fs'
import * as path from 'path'
import { ProjectDigest, PrivacyScope } from './types'

const SNIPPET_RADIUS = 8 // lines of code to read on each side of a linked line
const MAX_RECENT_TASKS = 12 // cap how many recently-updated tasks we describe
const MAX_SNIPPETS = 10 // cap total code snippets to keep the prompt bounded

interface RawTask {
  id: string
  type: string
  title: string
  body?: string
  status: string
  priority: string
  updatedAt?: string
  linkedFile?: string
  linkedLine?: number
  tags?: string[]
}

// Read ±SNIPPET_RADIUS lines around a 1-indexed line number from a file.
function readSnippet(projectRoot: string, relFile: string, line: number): string | null {
  try {
    const abs = path.isAbsolute(relFile) ? relFile : path.join(projectRoot, relFile)
    if (!fs.existsSync(abs)) return null
    const lines = fs.readFileSync(abs, 'utf-8').split('\n')
    const start = Math.max(0, line - 1 - SNIPPET_RADIUS)
    const end = Math.min(lines.length, line + SNIPPET_RADIUS)
    return lines
      .slice(start, end)
      .map((text, i) => `${start + i + 1}: ${text}`)
      .join('\n')
  } catch {
    return null
  }
}

export function buildProjectDigest(projectRoot: string, scope: PrivacyScope): ProjectDigest {
  // Read the Press B data file; fall back to the legacy .devfloat.json if a
  // project hasn't been migrated yet (storage:load migrates it on first open).
  let tasksFile = path.join(projectRoot, '.pressb.json')
  if (!fs.existsSync(tasksFile)) {
    const legacy = path.join(projectRoot, '.devfloat.json')
    if (fs.existsSync(legacy)) tasksFile = legacy
  }

  let data: { project?: string; tasks?: RawTask[]; pinnedNotes?: Array<{ title: string; content: string }> } = {}
  if (fs.existsSync(tasksFile)) {
    try {
      data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
    } catch {
      data = {}
    }
  }

  const tasks = data.tasks || []
  const notes = data.pinnedNotes || []

  const openTasks = tasks.filter((t) => t.status === 'open')
  const doneTasks = tasks.filter((t) => t.status === 'done')
  const highPriorityOpen = openTasks.filter((t) => t.priority === 'high')

  // Most-recently-updated tasks first (this is the "what you were just working on" signal).
  const recent = [...tasks]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, MAX_RECENT_TASKS)

  const lines: string[] = []
  lines.push(`PROJECT: ${data.project || path.basename(projectRoot)}`)
  lines.push(
    `TASK SUMMARY: ${openTasks.length} open (${highPriorityOpen.length} high-priority), ${doneTasks.length} done.`
  )

  lines.push('')
  lines.push('RECENTLY UPDATED TASKS (newest first):')
  if (recent.length === 0) {
    lines.push('  (none)')
  } else {
    for (const t of recent) {
      const loc = t.linkedFile ? ` [${t.linkedFile}${t.linkedLine ? ':' + t.linkedLine : ''}]` : ''
      const tags = t.tags && t.tags.length ? ` #${t.tags.join(' #')}` : ''
      lines.push(`  - [${t.type}/${t.priority}/${t.status}] ${t.title}${loc}${tags}`)
      if (t.body) lines.push(`      note: ${t.body}`)
    }
  }

  lines.push('')
  lines.push('PINNED NOTES:')
  if (notes.length === 0) {
    lines.push('  (none)')
  } else {
    for (const n of notes) {
      lines.push(`  - ${n.title}: ${n.content}`)
    }
  }

  // Code snippets only when the user opted into sharing them.
  let snippetCount = 0
  if (scope === 'metadata+snippets' || scope === 'broad') {
    const linked = openTasks.filter((t) => t.linkedFile && t.linkedLine).slice(0, MAX_SNIPPETS)
    if (linked.length > 0) {
      lines.push('')
      lines.push('LINKED CODE SNIPPETS:')
      for (const t of linked) {
        const snippet = readSnippet(projectRoot, t.linkedFile!, t.linkedLine!)
        if (snippet) {
          lines.push(`  --- ${t.linkedFile}:${t.linkedLine} (${t.title}) ---`)
          lines.push(snippet)
          snippetCount++
        }
      }
    }
  }

  return {
    text: lines.join('\n'),
    taskCount: tasks.length,
    noteCount: notes.length,
    snippetCount
  }
}
