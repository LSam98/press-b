// Remembers which suggestions the user has dismissed, per project, so the engine
// doesn't resurface them. Stored machine-local (like briefs), keyed by project
// root. Accepted suggestions don't need tracking here — once accepted they become
// real tasks and show up in the digest, so the model won't re-propose them.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getFilePath(): string {
  return path.join(app.getPath('userData'), 'devfloat-config', 'dismissed-suggestions.json')
}

function ensureConfigDir(): void {
  const dir = path.join(app.getPath('userData'), 'devfloat-config')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Map of projectRoot -> dismissed suggestion titles
function readAll(): Record<string, string[]> {
  const file = getFilePath()
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

export function getDismissed(projectRoot: string): string[] {
  return readAll()[projectRoot] || []
}

export function addDismissed(projectRoot: string, title: string): void {
  ensureConfigDir()
  const all = readAll()
  const list = all[projectRoot] || []
  if (!list.includes(title)) {
    list.push(title)
    // Keep the exclusion list bounded so the prompt doesn't grow without limit.
    all[projectRoot] = list.slice(-50)
    fs.writeFileSync(getFilePath(), JSON.stringify(all, null, 2))
  }
}
