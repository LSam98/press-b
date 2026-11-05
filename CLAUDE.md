# CLAUDE.md — Press B

Instructions for Claude Code in this repository. This file holds the stable facts: what the project is, how to run it, and the rules that keep it healthy. Current status and next steps live in the maintainer's Claude memory (the handoff note), not here.

## What Press B is

A floating, always-on-top Electron companion (380×600, frameless) that holds a project's working state: code-anchored tasks, pinned notes, and AI context. The point is *recall*: sit back down at a project and get back in context fast ("press B = return to base").

The product's value is the curated project signal in `.pressb.json` plus the AI digest built from it. New features should either sharpen that signal or make it easier to use.

Formerly called **DevFloat**. Old names still appear only in the legacy-file migration (`.devfloat.json` → `.pressb.json`).

## Commands

```bash
npm install
npm run dev          # run the app with hot reload
npm run typecheck    # node + web tsconfigs; must be clean before any commit
npm run lint
npm run build:win    # NSIS installer -> dist/press-b-<version>-setup.exe
```

- The renderer hot-reloads. Changes to the **main process or preload** need a full `npm run dev` restart.
- `build:win` needs Windows **Developer Mode ON** (electron-builder extracts winCodeSign symlinks). The installer is unsigned, so SmartScreen will warn.
- There is no test suite yet. Verification means typecheck plus checking the behavior in the running app.

## Layout

```
src/main/index.ts        main process: window, tray, global shortcut, single-instance lock,
                         IPC handlers (storage/dialog/shell/config/window/watcher/ai/deeplink),
                         TODO comment watcher (chokidar), IDE file-jump
src/main/deeplink.ts     pressb:// URL parsing + validation
src/main/ai/             AI layer: anthropic.ts (provider + system prompts), context.ts
                         (buildProjectDigest, the central artifact), *Store.ts (machine-local persistence)
src/preload/             exposes window.pressB via contextBridge (+ index.d.ts types)
src/renderer/src/        React 19 UI: App.tsx (4 tabs), components/, hooks/ (useTasks,
                         usePinnedNotes, useAI), types/, utils/
extensions/vscode/       VS Code extension: "Create Task/Note in Press B" -> pressb:// link
```

## Data and storage

- **Per project:** `.pressb.json` at the project root holds tasks, pinned notes, and settings. It is gitignored here, so the maintainer's own dogfood data stays out of the repo.
- **Per machine:** stored under userData `press-b-config/`. This covers the project root and recents, the encrypted API key (Electron `safeStorage`), the last brief, dismissed suggestions, and Ask chat history.
- Never put API keys or other machine-local data in `.pressb.json`.

## Rules that keep the project healthy

1. **Keep tabs mounted.** `App.tsx` renders all tabs permanently and hides inactive ones with CSS. Do not go back to conditional tab rendering: it wipes drafts and scroll state.
2. **Preload stays self-contained.** It must not import renderer types; use `unknown` and mirror types in `src/preload/index.d.ts`. Shared payload types are mirrored by hand in three places (main, preload `.d.ts`, `renderer/src/types`), so keep them in sync.
3. **AI is pull, not push.** AI features run only on an explicit user action. Never auto-spend tokens or add background calls, badges, or nags. Returning nothing is a valid result. Staleness shows as "generated X ago" so the user decides when to refresh.
4. **Precision over recall in the watcher.** The comment regex is anchored to line start. Keep the directory ignore list, the source-extension allowlist, and the size cap. Junk tasks poison the AI digest.
5. **Sanitize anything that becomes a file link.** Accept relative paths only, with no `..` and a positive line number. Follow the existing patterns: `sanitizeLink` in `anthropic.ts` and the parser in `deeplink.ts`.
6. **Bulk task changes save once.** Use `deleteTasks` and similar helpers; calling the single-item writer in a loop causes a save race.

## Workflow

- **Design first for big features.** Lay out the options with a recommendation and agree on the design before building. Small fixes and polish can go straight ahead.
- **Milestones:** build, then typecheck, then the user verifies in the live app, then commit. Always give concrete restart and test steps. Don't commit work the user hasn't verified.
- **Git:** single branch, `master`, with no PR flow; don't introduce branches unasked. Remote: `origin` = `github.com/LSam98/press-b` (public). The user is new to git, so explain git and release steps concretely. The `gh` CLI is not installed; GitHub Releases are created in the web UI.
- **Commit identity:** the repo-local identity is a GitHub no-reply address. Never commit with a personal email, because the repo is public.
- **Code style:** Prettier (single quotes, no semicolons, 100 columns, no trailing commas) and 2-space indent. Comments are short and say *why*.

## Releasing a version

1. Bump `version` in `package.json` **and** the About line in `src/renderer/src/components/SettingsPanel.tsx`.
2. Run `npm run typecheck`, commit `vX.Y.Z — <summary>` to `master`, and tag `vX.Y.Z`.
3. Run `git push origin master` and then `git push origin vX.Y.Z`.
4. Run `npm run build:win`. The user creates the GitHub Release and attaches `dist/press-b-X.Y.Z-setup.exe`.
