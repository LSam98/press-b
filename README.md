# Press B

**A floating companion that holds your project's working state — and helps you recall it.**

Named after the League of Legends "press B to recall" — Press B is about *returning to base*: you sit back down at a project after a day (or a month), press B, and you're back in context. It lives in a small always-on-top window beside your editor, scoped to one project folder, and keeps the things you lose between sessions: what you were doing, what's left, and why.

> Status: **early and experimental.** Built for the author's own use and a handful of testers. Things will change.

---

## What it does

- **Code-anchored tasks** — TODO / PENDING / REFACTOR / BUG, each with priority, status, and an optional `file:line` link that opens straight to that spot in your IDE.
- **TODO watcher** — scans your source for `// TODO:` / `// REFACTOR:` comments and turns them into tracked tasks automatically.
- **Pinned notes** — scratch context that should survive the session.
- **AI Companion** (bring your own Anthropic API key):
  - **Re-Entry Brief** — reads your project's state and tells you, in a few sentences, where you left off and a sensible next step.
  - **Suggestions** — on demand only, proposes a few sharp, justified next tasks you can accept (→ a real task) or dismiss (remembered, won't nag again). Tunable by *volume* and *focus lens*.
- **Multi-project** — switch between recent projects from the title bar.
- **Lives like a utility** — system tray, close-to-tray (the window hides, it doesn't quit), global **Ctrl+Shift+F** to show/hide.

All project state is stored in a single `.pressb.json` file at your project root — human-readable, and it travels with the repo.

---

## Install (Windows)

1. Download the latest `press-b-<version>-setup.exe` from the Releases page.
2. The installer is **not code-signed yet**, so Windows SmartScreen will warn ("Windows protected your PC"). Click **More info → Run anyway**.
3. It installs per-user and adds a **Press B** desktop + Start-menu shortcut.

> macOS / Linux builds aren't published yet.

---

## Use it

You don't need a dev environment — the installed app is self-contained.

1. Open your project in whatever IDE you like.
2. Launch **Press B** from its shortcut.
3. Point it at the **same project folder** (folder picker on first run; recents after that).
4. *(Optional, for AI)* Open **Settings → AI Assistant** and paste your own [Anthropic API key](https://console.anthropic.com). It's encrypted on your machine and never leaves it except to call the API. (Note: the Anthropic API is pay-as-you-go and **separate from a Claude Pro subscription**.)

That's it — Press B now rides along with your project.

---

## Development

```bash
npm install
npm run dev        # run locally
npm run build:win  # produce the Windows installer in dist/
```

Built with Electron + React + TypeScript (electron-vite) + Tailwind CSS.

---

## License

[MIT](LICENSE). Built on open-source components — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The name is an affectionate nod to a game mechanic; Press B is not affiliated with or endorsed by Riot Games, and uses none of its assets.
