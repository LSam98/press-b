// Persists the most recent re-entry brief per project, so it survives app
// restarts. Stored in the app's userData config dir (NOT in .pressb.json) —
// the brief is personal, machine-local session memory, and keeping it out of
// the repo avoids git diff noise when dogfooding Press B on its own project.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface StoredBrief {
  text: string
  generatedAt: string // ISO timestamp
}

function getBriefsFilePath(): string {
  return path.join(app.getPath('userData'), 'press-b-config', 'briefs.json')
}

function ensureConfigDir(): void {
  const dir = path.join(app.getPath('userData'), 'press-b-config')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Map of projectRoot -> StoredBrief
function readAll(): Record<string, StoredBrief> {
  const file = getBriefsFilePath()
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

export function getBrief(projectRoot: string): StoredBrief | null {
  return readAll()[projectRoot] || null
}

export function setBrief(projectRoot: string, brief: StoredBrief): void {
  ensureConfigDir()
  const all = readAll()
  all[projectRoot] = brief
  fs.writeFileSync(getBriefsFilePath(), JSON.stringify(all, null, 2))
}
