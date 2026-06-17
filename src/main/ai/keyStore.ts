// Encrypted storage for the user's Anthropic API key.
//
// The key is encrypted at rest with Electron's safeStorage (OS-backed: DPAPI on
// Windows, Keychain on macOS, libsecret on Linux) and written to the app's
// userData config dir. It is NEVER stored in the project's .devfloat.json,
// which lives in the repo and would leak the key into version control.

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

function getKeyFilePath(): string {
  return path.join(app.getPath('userData'), 'devfloat-config', 'ai-key.enc')
}

function ensureConfigDir(): void {
  const dir = path.join(app.getPath('userData'), 'devfloat-config')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function hasKey(): boolean {
  return fs.existsSync(getKeyFilePath())
}

export function setKey(apiKey: string): void {
  ensureConfigDir()
  const file = getKeyFilePath()

  // Empty string clears the stored key.
  if (!apiKey) {
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is not available — cannot securely store the API key.')
  }

  const encrypted = safeStorage.encryptString(apiKey)
  fs.writeFileSync(file, encrypted)
}

export function getKey(): string | null {
  const file = getKeyFilePath()
  if (!fs.existsSync(file)) return null
  try {
    const encrypted = fs.readFileSync(file)
    return safeStorage.decryptString(encrypted)
  } catch (error) {
    console.error('[ai/keyStore] Failed to decrypt API key:', error)
    return null
  }
}
