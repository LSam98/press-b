import { DeepLinkPayload, PinnedNote, Task, TaskType } from '../types'

// Seeding rules for IDE captures ("Create in Press B" deep links): the raw
// selection/line comes in as text; we turn its first meaningful line into a
// title, detect TODO-style prefixes as task types, and keep the full selection
// as the body when the title alone doesn't carry it.

const LEADING_COMMENT_MARKERS = /^\s*(\/\/|\/\*|\*|#|--|<!--)\s*/
const TRAILING_COMMENT_MARKERS = /\s*(\*\/|-->)\s*$/
const TYPE_PREFIX = /^(TODO|FIXME|BUG|REFACTOR|HACK)\b\s*:?\s*/i
const PREFIX_TO_TYPE: Record<string, TaskType> = {
  TODO: 'TODO',
  FIXME: 'BUG',
  BUG: 'BUG',
  REFACTOR: 'REFACTOR',
  HACK: 'REFACTOR'
}
const TITLE_MAX = 80

// Same id style as AI-accepted suggestions in App.tsx, with an ide- prefix.
function newId(): string {
  return `ide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p
}

// "path:line" anchor for breadcrumbs — relative when in-project, else absolute.
function anchorOf(p: DeepLinkPayload): string {
  const file = p.file || p.absFile
  if (!file) return ''
  return p.line ? `${file}:${p.line}` : file
}

function seedFromText(text: string | undefined): {
  title: string
  body?: string
  type: TaskType
} {
  if (!text || !text.trim()) return { title: '', type: 'TODO' }
  const lines = text.split('\n')
  const raw = lines.find((l) => l.trim()) || ''
  let line = raw.replace(LEADING_COMMENT_MARKERS, '').replace(TRAILING_COMMENT_MARKERS, '').trim()

  let type: TaskType = 'TODO'
  const prefix = line.match(TYPE_PREFIX)
  if (prefix) {
    type = PREFIX_TO_TYPE[prefix[1].toUpperCase()]
    line = line.slice(prefix[0].length).trim()
  }

  const overflow = line.length > TITLE_MAX
  const title = overflow ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line
  const isMultiline = lines.filter((l) => l.trim()).length > 1
  // Keep the full raw selection when the title alone loses information.
  const body = isMultiline || overflow ? text.trim() : undefined
  return { title, body, type }
}

export function buildTaskDraftFromDeepLink(p: DeepLinkPayload): Task {
  const now = new Date().toISOString()
  const seeded = seedFromText(p.text)
  const fallbackTitle = p.absFile
    ? `Task from ${baseName(p.absFile)}${p.line ? `:${p.line}` : ''}`
    : 'New task'

  // Outside the current project → no real link; keep the source as a breadcrumb.
  let body = seeded.body
  if (!p.file && p.absFile) {
    const breadcrumb = `From: ${anchorOf(p)}`
    body = body ? `${body}\n\n${breadcrumb}` : breadcrumb
  }

  return {
    id: newId(),
    type: seeded.type,
    title: seeded.title || fallbackTitle,
    body,
    status: 'open',
    priority: 'medium',
    createdAt: now,
    updatedAt: now,
    tags: ['ide'],
    linkedFile: p.file || undefined,
    // Only anchor a line when there's a file to anchor it to (App.tsx precedent).
    linkedLine: p.file ? p.line : undefined
  }
}

export function buildNoteDraftFromDeepLink(p: DeepLinkPayload): PinnedNote {
  const seeded = seedFromText(p.text)
  const fallbackTitle = p.absFile
    ? `Note from ${baseName(p.absFile)}${p.line ? `:${p.line}` : ''}`
    : 'New note'
  const title = seeded.title || fallbackTitle

  // Notes have no link fields, so the anchor always goes into the content.
  // Content falls back to the title text — NoteForm requires it non-empty.
  let content = p.text?.trim() || title
  const anchor = anchorOf(p)
  if (anchor) content += `\n\nFrom: ${anchor}`

  return {
    id: newId(),
    title,
    content,
    createdAt: new Date().toISOString()
  }
}
