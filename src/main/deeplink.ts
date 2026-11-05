import * as path from 'path'

// Parsed pressb:// deep-link payload delivered to the renderer.
// `file` is set (relative) only when the target file lives under the active
// project root; otherwise `absFile` carries the sanitized absolute path so the
// renderer can keep it as a breadcrumb instead of a real link.
export interface DeepLinkPayload {
  target: 'task' | 'note'
  file?: string
  absFile?: string
  line?: number
  text?: string
}

const MAX_TEXT_LENGTH = 2000
const MAX_PATH_LENGTH = 500
const MAX_LINE = 999999

// Control characters except \n (000A), \r (000D), \t (0009) — selections are
// multi-line, so those survive. Built from a string to keep the source ASCII.
// eslint-disable-next-line no-control-regex -- matching control chars is the point
const CONTROL_CHARS = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', 'g')

// Find a pressb:// URL anywhere in an argv array. Prefix-scan only — never
// positional, because Chromium injects its own flags into second-instance argv.
export function extractDeepLinkUrl(argv: string[]): string | null {
  return argv.find((arg) => arg.toLowerCase().startsWith('pressb://')) ?? null
}

function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, '')
}

// Parse + validate a pressb://create URL. Returns null for anything malformed —
// the caller warns and drops it; a bad link must never crash or half-apply.
export function parseDeepLink(rawUrl: string, projectRoot: string | null): DeepLinkPayload | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol.toLowerCase() !== 'pressb:') return null
  // `pressb://create?...` puts "create" in host (empty pathname); the
  // triple-slash form puts it in pathname. Accept both.
  const action = url.host.toLowerCase() || url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (action !== 'create') return null

  const typeParam = url.searchParams.get('type')
  if (typeParam !== null && typeParam !== 'task' && typeParam !== 'note') return null
  const target: 'task' | 'note' = typeParam === 'note' ? 'note' : 'task'

  const payload: DeepLinkPayload = { target }

  const textParam = url.searchParams.get('text')
  if (textParam) {
    const text = stripControlChars(textParam).slice(0, MAX_TEXT_LENGTH).trim()
    if (text) payload.text = text
  }

  const lineParam = url.searchParams.get('line')
  if (lineParam) {
    const line = Number(lineParam)
    if (Number.isInteger(line) && line >= 1 && line <= MAX_LINE) payload.line = line
  }

  const fileParam = url.searchParams.get('file')
  if (fileParam && fileParam.length <= MAX_PATH_LENGTH) {
    const cleaned = stripControlChars(fileParam).trim()
    // Require an absolute path with no traversal segments left after normalize.
    if (cleaned && path.isAbsolute(cleaned)) {
      const abs = path.normalize(cleaned)
      if (!abs.split(/[\\/]/).includes('..')) {
        payload.absFile = abs
        if (projectRoot) {
          // Case-insensitive containment check (Windows paths).
          const root = path.resolve(projectRoot)
          const rel = path.relative(root, abs)
          const contained =
            rel !== '' &&
            !rel.startsWith('..') &&
            !path.isAbsolute(rel) &&
            abs.toLowerCase().startsWith(root.toLowerCase() + path.sep)
          if (contained) payload.file = rel
        }
      }
    }
  }

  return payload
}
