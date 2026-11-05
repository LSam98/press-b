/* eslint-disable @typescript-eslint/no-explicit-any -- settings files are
   untyped JSON written by people and other tools; only `env` is touched. */
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// The per-project "deep capture" switch. Turning it on writes ONE value into the
// project's .claude/settings.local.json:
//     "env": { "ANTHROPIC_BASE_URL": "http://127.0.0.1:<port>" }
// Every Claude Code session started in that project (terminal, VS Code, the
// desktop app) then sends its API traffic through Press B's proxy.
//
// Turning it off (or quitting Press B) REWRITES the value to the real API
// instead of deleting it: a running session picks up a changed value, but keeps
// a deleted one, so deleting would leave live sessions pointed at a proxy that
// is gone. The leftover direct value is removed on a later Press B start.
//
// All other keys in the file are left exactly as they were. A file that isn't
// valid JSON is never touched. Bookkeeping lives machine-local in `stateFile`.

export const DIRECT_API = 'https://api.anthropic.com'
const KEY = 'ANTHROPIC_BASE_URL'

interface HookRecord {
  root: string
  enabled: boolean // the switch, as the person set it
  url: string | null // the proxy address while it is in the file
  upstream: string // where traffic really goes: the API, or the person's own gateway
  previous: string | null // the file's own value before Press B (null = none)
  createdFile: boolean
  createdEnv: boolean
  leftDirect: boolean // `upstream` was left in the file on unhook; remove it later
}

type HookState = Record<string, HookRecord>

const norm = (root: string): string => path.resolve(root).toLowerCase()

export function settingsFile(root: string): string {
  return path.join(root, '.claude', 'settings.local.json')
}

function userSettingsFile(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  return path.join(base, 'settings.json')
}

// { data, exists }. Throws if the file exists but isn't a JSON object.
function readSettings(file: string): { data: any; exists: boolean } {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return { data: {}, exists: false }
  }
  if (!text.trim()) return { data: {}, exists: true }
  let data: any
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error(
      `${file} isn't valid JSON, so Press B won't change it. Fix the file and try again.`
    )
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error(`${file} isn't a JSON object, so Press B won't change it.`)
  return { data, exists: true }
}

// Write via a temp file + rename, so a crash never leaves half a file.
function writeSettings(file: string, data: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.pressb-tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
    fs.rmSync(tmp, { force: true })
  }
}

function envValue(file: string): string | null {
  try {
    const v = readSettings(file).data?.env?.[KEY]
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

export const proxyUrl = (port: number): string => `http://127.0.0.1:${port}`

export class Hookup {
  constructor(private readonly stateFile: string) {}

  private load(): HookState {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) || {}
    } catch {
      return {}
    }
  }

  private save(state: HookState): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8')
  }

  isEnabled(root: string): boolean {
    return this.load()[norm(root)]?.enabled === true
  }

  // The port of a proxy address Press B wrote earlier (to reuse it after a crash,
  // so sessions still pointed at it reconnect on their own).
  lastPort(root: string): number | null {
    const r = this.load()[norm(root)]
    const m = /:(\d+)$/.exec(r?.url ?? '')
    return m ? Number(m[1]) : null
  }

  // Where the traffic should really go. The first value found wins, in Claude
  // Code's own order: this project's local file (unless it's ours), the
  // project's shared settings, the user's settings, the environment.
  resolveUpstream(root: string, ownUrl: string): string {
    const rec = this.load()[norm(root)]
    const local = envValue(settingsFile(root))
    const mine =
      local !== null && rec && (local === rec.url || (rec.leftDirect && local === rec.upstream))
    const candidates = [
      mine ? rec.previous : local,
      envValue(path.join(root, '.claude', 'settings.json')),
      envValue(userSettingsFile()),
      process.env[KEY] || null
    ]
    const found = candidates.find((v): v is string => !!v && v.replace(/\/$/, '') !== ownUrl)
    return (found ?? DIRECT_API).replace(/\/$/, '')
  }

  // Point the project at the proxy. Returns the upstream to forward to.
  hook(root: string, port: number): string {
    const file = settingsFile(root)
    const { data, exists } = readSettings(file)
    const state = this.load()
    const key = norm(root)
    const rec = state[key]
    const url = proxyUrl(port)
    const cur = typeof data.env?.[KEY] === 'string' ? data.env[KEY] : null
    const mine =
      rec && cur !== null && (cur === rec.url || (rec.leftDirect && cur === rec.upstream))
    const upstream = this.resolveUpstream(root, url)
    const next: HookRecord = {
      root,
      enabled: true,
      url,
      upstream,
      previous: mine ? rec.previous : cur,
      createdFile: mine ? rec.createdFile : !exists,
      createdEnv: mine ? rec.createdEnv : !data.env,
      leftDirect: false
    }
    if (!data.env || typeof data.env !== 'object' || Array.isArray(data.env)) data.env = {}
    data.env[KEY] = url
    writeSettings(file, data)
    state[key] = next
    this.save(state)
    return upstream
  }

  // Point the project straight at the real API again. Synchronous on purpose:
  // it runs while Press B quits. A value the person changed is left alone.
  unhook(root: string): void {
    const state = this.load()
    const key = norm(root)
    const rec = state[key]
    if (!rec?.url) return
    try {
      const file = settingsFile(root)
      const { data } = readSettings(file)
      if (data.env?.[KEY] === rec.url) {
        data.env[KEY] = rec.upstream
        writeSettings(file, data)
        rec.leftDirect = true
      } else {
        rec.leftDirect = false
      }
    } catch (e) {
      console.warn('Could not unhook capture (left as is):', e)
    }
    rec.url = null
    this.save(state)
  }

  setEnabled(root: string, on: boolean): void {
    const state = this.load()
    const rec = state[norm(root)]
    if (rec) {
      rec.enabled = on
      this.save(state)
    }
  }

  // Put the file back the way it was before Press B (switch is off, and the
  // sessions that ran meanwhile have had a Press B restart to finish).
  private cleanup(rec: HookRecord, state: HookState): void {
    const key = norm(rec.root)
    try {
      const file = settingsFile(rec.root)
      const { data } = readSettings(file)
      if (data.env?.[KEY] === rec.upstream) {
        if (rec.previous !== null) data.env[KEY] = rec.previous
        else delete data.env[KEY]
        if (rec.createdEnv && Object.keys(data.env).length === 0) delete data.env
        if (rec.createdFile && Object.keys(data).length === 0) fs.rmSync(file, { force: true })
        else writeSettings(file, data)
      }
    } catch (e) {
      console.warn('Capture cleanup skipped:', e)
    }
    delete state[key]
  }

  // At Press B start: anything still pointing at a proxy that died with the last
  // run (crash, killed process) goes back to the real API now. Projects whose
  // switch is off get their file restored.
  repairAll(): void {
    for (const rec of Object.values(this.load())) {
      if (rec.url) this.unhook(rec.root)
    }
    const state = this.load()
    for (const rec of Object.values(state)) {
      if (!rec.enabled && rec.leftDirect) this.cleanup(rec, state)
    }
    this.save(state)
  }
}

// Keep the settings file out of git. If git would pick it up, add a rule to the
// repository's own local exclude list (.git/info/exclude), which is never
// committed and never changes anyone else's checkout. Returns a note for the
// person, or null when nothing needed doing.
export function keepOutOfGit(root: string): string | null {
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 5000
    }).trim()
  const rel = '.claude/settings.local.json'
  try {
    git('rev-parse', '--git-dir')
  } catch {
    return null // not a git repository
  }
  try {
    git('ls-files', '--error-unmatch', rel)
    return `${rel} is tracked by git, so the proxy address shows up as a change. Don't commit it.`
  } catch {
    // not tracked: good
  }
  try {
    git('check-ignore', '-q', rel)
    return null // already ignored
  } catch {
    // not ignored: add a local rule
  }
  try {
    const gitDir = path.resolve(root, git('rev-parse', '--git-dir'))
    const prefix = git('rev-parse', '--show-prefix')
    const exclude = path.join(gitDir, 'info', 'exclude')
    fs.mkdirSync(path.dirname(exclude), { recursive: true })
    const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : ''
    const sep = existing && !existing.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(exclude, `${sep}# Press B deep capture (machine-local)\n/${prefix}${rel}\n`)
    return 'Kept out of git with a local rule in .git/info/exclude (never committed).'
  } catch {
    return `Couldn't confirm git ignores ${rel}. Don't commit it.`
  }
}
