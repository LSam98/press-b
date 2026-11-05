# Press B — VS Code extension

Adds **Create Task in Press B** and **Create Note in Press B** to the editor
right-click menu. Select some code (or just right-click a line) and the Press B
float comes to front with a pre-filled form — file, line, and title seeded from
the selection.

Requires the Press B desktop app (installed build — the installer registers the
`pressb://` URL protocol this extension uses).

## Build & install (local, no marketplace)

```
cd extensions/vscode
npm install
npm run compile
npx @vscode/vsce package
code --install-extension pressb-vscode-0.1.0.vsix
```

Then reload VS Code. To develop: open this folder in VS Code and press F5
(Extension Development Host).
