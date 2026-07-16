// Persists the Ask conversation per project so it survives app restarts —
// a re-entry tool that forgot its own conversations would be ironic. Stored
// machine-local in the userData config dir (NOT in .pressb.json), same pattern
// as briefStore. History is capped so the file (and the prompt) stay bounded.

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { ChatMessage } from './types'

const MAX_STORED_MESSAGES = 30 // per project; oldest dropped first

function getChatsFilePath(): string {
  return path.join(app.getPath('userData'), 'press-b-config', 'chats.json')
}

function ensureConfigDir(): void {
  const dir = path.join(app.getPath('userData'), 'press-b-config')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// Map of projectRoot -> ChatMessage[]
function readAll(): Record<string, ChatMessage[]> {
  const file = getChatsFilePath()
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, ChatMessage[]>): void {
  ensureConfigDir()
  fs.writeFileSync(getChatsFilePath(), JSON.stringify(all, null, 2))
}

export function getChat(projectRoot: string): ChatMessage[] {
  return readAll()[projectRoot] || []
}

export function appendToChat(projectRoot: string, messages: ChatMessage[]): void {
  const all = readAll()
  const existing = all[projectRoot] || []
  all[projectRoot] = [...existing, ...messages].slice(-MAX_STORED_MESSAGES)
  writeAll(all)
}

export function clearChat(projectRoot: string): void {
  const all = readAll()
  if (projectRoot in all) {
    delete all[projectRoot]
    writeAll(all)
  }
}
