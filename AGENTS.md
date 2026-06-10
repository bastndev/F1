# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build (type-check + lint + bundle)
bun run compile

# Development watch mode (esbuild + tsc in parallel)
bun run watch

# Type-check only
bun run check-types

# Lint only
bun run lint
```

There is no test suite. To debug the extension, press **F5** in VS Code (uses `.vscode/launch.json` → `extensionHost` config, which runs `compile` as a pre-launch task).

## Architecture

F1 is a VS Code extension providing a **CLI Hub** panel that lets users launch and manage multiple AI coding CLI tools (Claude Code, Codex CLI, OpenCode, Copilot, Cursor, Amp, Kiro, Kilo Code, Grok, Antigravity) in embedded xterm.js terminals.

### Four build targets (esbuild.js)

| Entry point | Output | Platform |
|---|---|---|
| `src/extension.ts` | `dist/extension.js` | Node.js / CJS |
| `src/clihub/index.ts` | `dist/clihub/index.js` | Browser / IIFE |
| `src/clihub/webview/ui/panel-terminal/terminal.ts` | `dist/clihub/webview/webview.js` | Browser / IIFE |
| `src/clihub/webview/core/terminal-cli/pty-host.ts` | `dist/clihub/webview/core/terminal-cli/pty-host.js` | Node.js / CJS |

`node-pty` and `vscode` are always external. Non-TS assets (HTML, CSS, SVG) are copied from `src/clihub/` into `dist/clihub/` by the build script — they are not bundled. CSS/HTML files imported inside `terminal.ts` and the modal UI files use esbuild's `text` loader so they bundle as strings.

### Two-phase webview

**Phase 1 – Launcher** (`src/clihub/index.ts` + `src/clihub/index.html`):
The initial webview renders a fuzzy-search launcher to pick which CLI to open. State is persisted via `vscode.getState()`/`setState()`. On selection, a `{ type: 'openAgent', agent }` message is posted to the extension host.

**Phase 2 – Terminal** (`src/clihub/webview/ui/panel-terminal/terminal.ts`):
Once an agent is chosen, `CliHubViewProvider` replaces `webviewView.webview.html` entirely with the terminal layout (built by `src/clihub/webview/webview.ts`). From this point, `terminal.ts` drives xterm.js instances and exchanges typed messages with the host.

### PTY host subprocess

`CliSessionManager` (`src/clihub/webview/core/terminal-cli/session-manager.ts`) runs in the extension host. For each CLI session it spawns `dist/clihub/webview/core/terminal-cli/pty-host.js` as a Node.js child process with IPC stdio. The pty-host process owns the `node-pty` instance and relays `output`, `exit`, and `error` messages back over IPC. This keeps the native `node-pty` module out of the renderer process and out of the main extension bundle.

### Message protocol

All communication crosses two boundaries:

- **Extension host ↔ webview**: `webview.postMessage()` / `window.addEventListener('message')`. Message types are prefixed: `cli.*`, `prompt.*`, `workspace.*`.
- **Extension host ↔ pty-host**: Node.js IPC (`process.send` / `host.on('message')`). Types: `start`, `input`, `resize`, `kill`, `ready`, `output`, `exit`, `error`.

### Tools panel

The terminal panel has a right-side tools area (`src/clihub/webview/ui/panel-terminal/tools-cli-ui/`) with three modals:

- **Prompt** – rich textarea with @-file mention picker, image paste support, autocorrect, and ES→EN translation before sending to the CLI.
- **Translator** – standalone translation modal; uses selection from the active terminal.
- **Keymaps** – keyboard shortcut reference.

Translation is handled in the extension host (`src/clihub/webview/core/tools-cli-core/modal-translation/host-prompt-translator.ts`) using MyMemory and Google Translate (no API key required) with an in-memory cache and per-provider rate-limit cooldown.

Image attachments are saved to `context.globalStorageUri/clihub-images/` by `src/clihub/webview/core/tools-cli-core/prompt/attachments/host-preparer.ts` before the final text is sent to the CLI.

### Adding a new CLI agent

1. Add an entry to `cliAgents` in `src/clihub/webview/core/terminal-cli/agents.ts`.
2. Add the matching entry to `launcherAgents` in `src/clihub/main.ts`.
3. Add the SVG icon to `src/clihub/assets/icons-cli/`.
4. Optionally add an installer entry in `src/clihub/webview/core/terminal-cli/data/cli-installers.ts`.
5. Add the slug mapping in both `getAgentSlug` functions (`src/clihub/index.ts` and `src/clihub/webview/ui/panel-terminal/terminal.ts`).
