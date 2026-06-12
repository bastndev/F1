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

# Data-invariant tests (agent registry; tests/ lives outside tsconfig, bun runs the TS directly)
bun test
```

There is no UI test suite. To debug the extension, press **F5** in VS Code (uses `.vscode/launch.json` → `extensionHost` config, which runs `compile` as a pre-launch task).

## Architecture

F1 is a VS Code extension providing a **CLI Hub** panel that lets users launch and manage multiple AI coding CLI tools (Claude Code, Codex CLI, OpenCode, Copilot, Cursor, Amp, Kiro, Kilo Code, Grok, Antigravity) in embedded xterm.js terminals.

### Three layers

`src/` is split by **where the code runs**:

- `src/host/` — extension-host (Node.js) code: the webview provider (`main.ts`), HTML builders (`launcher-html.ts`, `webview-html.ts`, `webview-assets.ts`), session manager + pty host, workspace queries, translation/spellcheck/voice/attachment services.
- `src/webview/` — browser code: the launcher (`launcher/`), the terminal panel (`panel-terminal/`, `panel-tab/`), the tools modals (`tools/`), styles and SVG assets.
- `src/shared/` — code imported from both sides: the message protocol (`protocol.ts`), the CLI agent registry (`agents.ts`), prompt/token logic (`prompt/`), launch-guard, model detection, voice/translation types, UI strings (`ui-strings.ts`).

Host code must never be imported from `src/webview/**` and vice versa; `src/shared/**` must not import `vscode` or touch the DOM at module scope (types and pure logic only).

### Four build targets (esbuild.js)

| Entry point | Output | Platform |
|---|---|---|
| `src/extension.ts` | `dist/extension.js` | Node.js / CJS |
| `src/webview/launcher/index.ts` | `dist/webview/launcher/index.js` | Browser / IIFE |
| `src/webview/panel-terminal/terminal.ts` | `dist/webview/terminal.js` | Browser / IIFE |
| `src/host/terminal-cli/pty-host.ts` | `dist/host/pty-host.js` | Node.js / CJS |

`node-pty` and `vscode` are always external. Non-TS assets (HTML, CSS, SVG) are copied from `src/webview/` into `dist/webview/` by the build script — they are not bundled. CSS/HTML files imported inside the terminal bundle (modal UI files) use esbuild's `text` loader so they bundle as strings.

### Two-phase webview

**Phase 1 – Launcher** (`src/webview/launcher/index.ts` + `index.html`, host side `src/host/launcher-html.ts`):
The initial webview renders a fuzzy-search launcher to pick which CLI to open. State is persisted via `vscode.getState()`/`setState()`. On selection, a `{ type: 'openAgent', agent }` message is posted to the extension host.

**Phase 2 – Terminal** (`src/webview/panel-terminal/terminal.ts`, host side `src/host/webview-html.ts`):
Once an agent is chosen, `CliHubViewProvider` replaces `webviewView.webview.html` entirely with the terminal layout. From this point, `terminal.ts` drives xterm.js instances and exchanges typed messages with the host. Its supporting modules live alongside it: `host-rpc.ts` (request/response channels), `boot-skeleton.ts`, `copy-to-translate.ts`, `terminal-theme.ts`.

### PTY host subprocess

`CliSessionManager` (`src/host/terminal-cli/session-manager.ts`) runs in the extension host. For each CLI session it spawns `dist/host/pty-host.js` as a Node.js child process with IPC stdio. The pty-host process owns the `node-pty` instance and relays `output`, `exit`, and `error` messages back over IPC. This keeps the native `node-pty` module out of the renderer process and out of the main extension bundle. The pty-host must be spawned with system `node` (Electron-as-Node segfaults with node-pty).

### Message protocol

All message contracts live in **`src/shared/protocol.ts`** — both sides of each boundary import from it:

- **Extension host ↔ webview**: `webview.postMessage()` / `window.addEventListener('message')`. `WebviewToHostMessage` / `HostToWebviewMessage`; types are prefixed `cli.*`, `prompt.*`, `workspace.*`, `voice.*`, `clipboard.*`.
- **Extension host ↔ pty-host**: Node.js IPC. `PtyHostCommand` (`start`, `input`, `resize`, `kill`) / `PtyHostEvent` (`ready`, `output`, `exit`, `error`).

`cli.state` snapshots include a session's terminal buffer only the first time that session is announced to the current webview; afterwards the webview maintains its own copy from incremental `cli.output` messages.

### Tools panel

The terminal panel has a right-side tools area (`src/webview/tools/`) with three modals:

- **Prompt** (`modal-prompt/`) – rich textarea with @-file mention picker, image paste support, collapsed pastes, skills chips, live spell-marking, and ES→EN translation before sending to the CLI. `prompt.ts` orchestrates; the concerns live in sibling modules (`attachments-ui.ts`, `highlight.ts`, `skills-chips.ts`, `footer-model.ts`, `lowercase-input.ts`, `textarea-history.ts`, `session-state.ts`).
- **Translator** (`modal-translator/`) – standalone translation modal; uses selection from the active terminal (webview-side providers in `browser-terminal-translator.ts`).
- **Keymaps** (`modal-keymaps/`) – keyboard shortcut reference.

Prompt translation is handled in the extension host (`src/host/translation/host-prompt-translator.ts`) using MyMemory and Google Translate (no API key required) with an in-memory cache and per-provider rate-limit cooldown.

Image attachments are saved to `context.globalStorageUri/clihub-images/` by `src/host/attachments/host-preparer.ts` before the final text is sent to the CLI.

### Adding a new CLI agent

1. Add one entry to the registry in `src/shared/agents.ts` (label, command, args, slug, aliases, icon file).
2. Add the SVG icon to `src/webview/assets/icons-cli/`.
3. Optionally add an installer entry in `src/host/terminal-cli/cli-installers.ts`.

`bun test` verifies the registry invariants (unique labels/slugs, icon files exist, installers match).
