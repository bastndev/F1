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

F1 is a VS Code extension providing a **CLI Hub** panel that lets users launch and manage multiple AI coding CLI tools (Claude Code, Codex CLI, OpenCode, Copilot, Cursor, Kiro, Kilo Code, Grok, Antigravity) in embedded xterm.js terminals.

### Repository layout

`src/` hosts two products side by side — keep them separate:

- `src/my-cli/` — everything belonging to the CLI Hub feature (this extension).
- `src/my-skill/` — placeholder for a future second extension. Do not mix CLI Hub code into it.

Each product exposes one **front door** that is the only file importable from outside its folder: `src/my-cli/my-cli.ts` (host-side exports only — never re-export webview code there) and `src/my-skill/my-skills.ts`. `src/extension.ts` imports exclusively through these.

Inside `src/my-cli/` the code is split by **where it runs**:

- `src/my-cli/host/` — extension-host (Node.js) code: the webview provider (`main.ts`), HTML builders (`launcher-html.ts`, `webview-html.ts`, `webview-assets.ts`), session manager + pty host, workspace queries, translation/spellcheck/voice/attachment services.
- `src/my-cli/webview/` — browser code: the launcher (`launcher/`), the terminal panel (`panel-terminal/`, `panel-tab/`), the tools modals (`tools/`), styles and SVG assets.
- `src/my-cli/shared/` — code imported from both sides: the message protocol (`protocol.ts`), the CLI agent registry (`agents.ts`), prompt/token logic (`prompt/`), launch-guard, model detection, voice/translation types, UI strings (`ui-strings.ts`).

Host code must never be imported from `webview/**` and vice versa; `shared/**` must not import `vscode` or touch the DOM at module scope (types and pure logic only).

### Four build targets (esbuild.js)

| Entry point | Output | Platform |
|---|---|---|
| `src/extension.ts` | `dist/extension.js` | Node.js / CJS |
| `src/my-cli/webview/launcher/index.ts` | `dist/my-cli/webview/launcher/index.js` | Browser / IIFE |
| `src/my-cli/webview/panel-terminal/terminal.ts` | `dist/my-cli/webview/terminal.js` | Browser / IIFE |
| `src/my-cli/host/terminal-cli/pty-host.ts` | `dist/my-cli/host/pty-host.js` | Node.js / CJS |

`node-pty` and `vscode` are always external. Non-TS assets (HTML, CSS, SVG) are copied from `src/my-cli/webview/` into `dist/my-cli/webview/` by the build script — they are not bundled. CSS/HTML files imported inside the terminal bundle (modal UI files) use esbuild's `text` loader so they bundle as strings.

### Two-phase webview

**Phase 1 – Launcher** (`src/my-cli/webview/launcher/index.ts` + `index.html`, host side `src/my-cli/host/launcher-html.ts`):
The initial webview renders a fuzzy-search launcher to pick which CLI to open. State is persisted via `vscode.getState()`/`setState()`. On selection, a `{ type: 'openAgent', agent }` message is posted to the extension host.

**Phase 2 – Terminal** (`src/my-cli/webview/panel-terminal/terminal.ts`, host side `src/my-cli/host/webview-html.ts`):
Once an agent is chosen, `MyCliViewProvider` replaces `webviewView.webview.html` entirely with the terminal layout. From this point, `terminal.ts` drives xterm.js instances and exchanges typed messages with the host. Its supporting modules live alongside it: `host-rpc.ts` (request/response channels), `boot-skeleton.ts`, `copy-to-translate.ts`, `terminal-theme.ts`.

### PTY host subprocess

`CliSessionManager` (`src/my-cli/host/terminal-cli/session-manager.ts`) runs in the extension host. For each CLI session it spawns `dist/my-cli/host/pty-host.js` as a Node.js child process with IPC stdio. The pty-host process owns the `node-pty` instance and relays `output`, `exit`, and `error` messages back over IPC. This keeps the native `node-pty` module out of the renderer process and out of the main extension bundle. The pty-host must be spawned with system `node` (Electron-as-Node segfaults with node-pty).

### Message protocol

All message contracts live in **`src/my-cli/shared/protocol.ts`** — both sides of each boundary import from it:

- **Extension host ↔ webview**: `webview.postMessage()` / `window.addEventListener('message')`. `WebviewToHostMessage` / `HostToWebviewMessage`; types are prefixed `cli.*`, `prompt.*`, `workspace.*`, `voice.*`, `clipboard.*`.
- **Extension host ↔ pty-host**: Node.js IPC. `PtyHostCommand` (`start`, `input`, `resize`, `kill`) / `PtyHostEvent` (`ready`, `output`, `exit`, `error`).

`cli.state` snapshots include a session's terminal buffer only the first time that session is announced to the current webview; afterwards the webview maintains its own copy from incremental `cli.output` messages.

### Tools panel

The terminal panel has a right-side tools area (`src/my-cli/webview/tools/`) with three modals:

- **Prompt** (`modal-prompt/`) – rich textarea with @-file mention picker, image paste support, collapsed pastes, skills chips, live spell-marking, and ES→EN translation before sending to the CLI. `prompt.ts` orchestrates; the concerns live in sibling modules (`attachments-ui.ts`, `highlight.ts`, `skills-chips.ts`, `footer-model.ts`, `lowercase-input.ts`, `textarea-history.ts`, `session-state.ts`).
- **Translator** (`modal-translator/`) – standalone translation modal; uses selection from the active terminal (webview-side providers in `browser-terminal-translator.ts`).
- **Keymaps** (`modal-keymaps/`) – keyboard shortcut reference.

Prompt translation is handled in the extension host (`src/my-cli/host/translation/host-prompt-translator.ts`) using MyMemory and Google Translate (no API key required) with an in-memory cache and per-provider rate-limit cooldown.

Image attachments are saved to `context.globalStorageUri/my-cli-images/` by `src/my-cli/host/attachments/host-preparer.ts` before the final text is sent to the CLI.

### Adding a new CLI agent

1. Add one entry to the registry in `src/my-cli/shared/agents.ts` (label, command, args, slug, aliases, icon file).
2. Add the SVG icon to `src/my-cli/webview/assets/icons-cli/`.
3. Optionally add an installer entry in `src/my-cli/host/terminal-cli/cli-installers.ts`.
