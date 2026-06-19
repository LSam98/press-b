# Third-Party Notices

Press B is built on open-source software. Each component is the property of its
respective authors and is used under its own license (all permissive — MIT or
Apache-2.0). This file preserves their notices as those licenses require.

## Runtime dependencies

| Package | License |
| --- | --- |
| [Electron](https://github.com/electron/electron) | MIT |
| [React](https://github.com/facebook/react) / react-dom | MIT |
| [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) | MIT |
| [chokidar](https://github.com/paulmillr/chokidar) | MIT |
| [@electron-toolkit/preload, utils](https://github.com/alex8088/electron-toolkit) | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) / @tailwindcss/postcss | MIT |
| [electron-updater](https://github.com/electron-userland/electron-builder) | MIT |

## Build-time dependencies

| Package | License |
| --- | --- |
| [Vite](https://github.com/vitejs/vite) / @vitejs/plugin-react | MIT |
| [electron-vite](https://github.com/alex8088/electron-vite) | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [ESLint](https://github.com/eslint/eslint) | MIT |
| [Prettier](https://github.com/prettier/prettier) | MIT |

## Bundled in the packaged app

The packaged Electron application also includes Electron, Chromium, and Node.js.
Their full license texts are bundled automatically by electron-builder
(`LICENSE.electron.txt` and `LICENSES.chromium.html` inside the installed app
directory).

The full license text for each npm dependency is available in its respective
folder under `node_modules/<package>/`. This list covers the project's direct
dependencies; transitive dependencies carry their own (likewise permissive)
licenses.
