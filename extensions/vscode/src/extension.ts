import * as vscode from 'vscode'

// The extension stays deliberately dumb: it ships the raw selection (or current
// line), file path, and workspace root as a pressb:// URL. Press B's main
// process validates everything and the renderer does the title/type seeding.

const MAX_TEXT = 1500
// Windows ShellExecute / Run-dialog URL limits sit around 2048 — stay under.
const MAX_URL = 1900

function buildUrl(
  target: 'task' | 'note',
  file: string,
  line: number,
  text: string,
  root: string
): string {
  const params = new URLSearchParams({ type: target, file, line: String(line) })
  if (root) params.set('root', root)
  if (text) params.set('text', text)
  return `pressb://create?${params.toString()}`
}

async function sendToPressB(target: 'task' | 'note'): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  const doc = editor.document
  const sel = editor.selection

  let text = (sel.isEmpty ? doc.lineAt(sel.active.line).text : doc.getText(sel)).slice(0, MAX_TEXT)
  const line = sel.start.line + 1 // 1-indexed, matching Press B's linkedLine
  // Untitled documents have no real fsPath; Press B drops non-absolute paths,
  // so the capture still goes through as text-only.
  const file = doc.isUntitled ? '' : doc.uri.fsPath
  const root = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? ''

  let url = buildUrl(target, file, line, text, root)
  // URL-encoding can inflate length ~3x — trim the text until the URL fits.
  while (url.length > MAX_URL && text.length > 0) {
    text = text.slice(0, Math.max(0, text.length - 100))
    url = buildUrl(target, file, line, text, root)
  }
  await vscode.env.openExternal(vscode.Uri.parse(url))
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pressb.createTask', () => sendToPressB('task')),
    vscode.commands.registerCommand('pressb.createNote', () => sendToPressB('note'))
  )
}

export function deactivate(): void {}
