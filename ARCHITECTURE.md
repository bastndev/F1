# 🏗️ F1 — Architecture

A VS Code extension that turns the editor into a hub for AI coding agents. Ships **3 features**: a **CLI Hub** (9 agents + custom), a **Skills** marketplace, and a **My Memory** project-context engine — wired together by a webview/host split and a single keystroke (`F1`).

---

## 📁 Project Structure

```text
F1/
├── .vscode/                             # Editor workspace settings
├── src/
│   ├── extension.ts                     # Extension entry — wires the 3 features
│   │
│   ├── my-cli/                          # 🖥️ Feature 1 — CLI Hub
│   │   ├── core/                        # Host-side (Node)
│   │   │   ├── main.ts                  # Webview view provider + message router
│   │   │   ├── terminal-cli/            # PTY spawn, install detection, pty-host
│   │   │   ├── translation/             # Source→EN bridge (calls fixnow)
│   │   │   ├── spellcheck/              # Per-language dictionary host
│   │   │   ├── voice/                   # Read-aloud + "ding" finish cue (WAVs)
│   │   │   ├── attachments/             # @-file mentions, image paste
│   │   │   └── launcher-html.ts         # Inlines launcher HTML/CSS
│   │   ├── webview/                     # Browser-side bundles (xterm.js UI)
│   │   │   ├── panel-terminal/          # xterm.js + xterm-addon-fit
│   │   │   ├── panel-tab/               # Session list + Alt+/Alt− affordances
│   │   │   ├── launcher/                # Fuzzy-search agent picker
│   │   │   └── tools/                   # Right-side tools dock
│   │   │       ├── modal-prompt/        # Composer + 5-lang picker + spellcheck
│   │   │       ├── modal-translator/    # Terminal-selection translator
│   │   │       ├── modal-use/           # Per-CLI usage / status view
│   │   │       ├── modal-keymaps/       # Shortcut reference
│   │   │       └── modal-commands/      # Slash-command palette (per CLI)
│   │   └── shared/                      # DOM- and vscode-free types & helpers
│   │       ├── agents.ts                # The 9 CLI registry
│   │       └── prompt/languages.ts      # Prompt-picker language table
│   │
│   ├── my-skills/                       # 🧩 Feature 2 — Skills
│   │   ├── core/main.ts                 # Webview view provider
│   │   ├── screens/
│   │   │   ├── install-skill/           # Marketplace install (skills.sh + npx)
│   │   │   ├── create-skill/            # AGENTS.md / CLAUDE.md / DESIGN.md gens
│   │   │   └── local-skill/             # On-disk + saved-skill library
│   │   ├── view/                        # Browser bundle (dist/webview.js)
│   │   └── assets/                      # Webview-only CSS/SVG
│   │
│   ├── my-memory/                       # 🧠 Feature 3 — My Memory
│   │   ├── my-memory.ts                 # Public façade (enable/disable/rebuild)
│   │   ├── core/                        # graphify install + sync orchestration
│   │   ├── tier1-map/                   # File-tree map (.f1/map.json)
│   │   ├── tier2-graph/                 # Symbol graph (.f1/graph.json)
│   │   └── hook/                        # Commit-hook spec (built then shelved)
│   │
│   ├── shared/                          # Cross-feature helpers
│   │   ├── tutorial/                    # In-editor tutorials (HTML+CSS+TS)
│   │   │   ├── t-cli/                   # CLI Hub walkthrough
│   │   │   └── t-skill/                 # Skills walkthrough
│   │   ├── keymaps/                     # Shared keymap utilities
│   │   └── assets/
│   └── __test__/                        # Unit tests
│
├── l10n/                                # 🌐 Runtime i18n bundles (vscode.l10n)
│   └── bundle.l10n.{ar,de,es,fr,hi,ja,ko,pt-br,ru,vi,zh-cn}.json
│
├── public/                              # Marketing & docs (excluded from VSIX)
│   ├── banner.webp
│   ├── doc/                             # Translated READMEs (11 languages)
│   └── github/                          # Marketplace assets
│
├── dist/                                # esbuild output (gitignored)
├── package.json                         # Manifest + contributes + l10n field
├── package.nls.json                     # Default identity (en) — title/desc
├── package.nls.{ar,de,…,zh-cn}.json     # Translated identity per locale
├── esbuild.js                           # 8 bundle contexts (host + webviews + pty-host)
├── tsconfig.json
├── eslint.config.mjs
├── bun.lock                             # Bun lockfile (the project compiles with bun)
├── AGENTS.md                            # Build commands & shared conventions
├── CLAUDE.md                            # Claude-specific workflow notes
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md
├── LICENSE                              # MIT
└── icon.png
```

---

## 🎯 The 3 Features

| # | Feature | What it does |
| :- | :------ | :----------- |
| 1 | **CLI Hub** (`my-cli/`) | Runs every AI agent in an embedded xterm.js terminal. One panel, many sessions. |
| 2 | **My Skills** (`my-skills/`) | Marketplace + local library for reusable skill files (`AGENTS.md`, `CLAUDE.md`, `DESIGN.md`). |
| 3 | **My Memory** (`my-memory/`) | Builds a committed `.f1/` project context so every CLI starts with shared knowledge — cheaper tokens, faster onboarding. |

---

## 🤖 The 9 Built-in CLIs

| # | Agent | Command |
| :- | :---- | :------ |
| 1 | **Claude Code** | `claude` |
| 2 | **Codex CLI** | `codex` |
| 3 | **Cursor** | `cursor agent` |
| 4 | **Copilot CLI** | `copilot` |
| 5 | **OpenCode** | `opencode` |
| 6 | **Antigravity** | `agy` |
| 7 | **Kiro CLI** | `kiro-cli` |
| 8 | **Kilo Code** | `kilo` |
| 9 | **Grok** | `grok` |
| + | **Custom CLI** | any user-supplied command |

Each agent has its own slash-command fragment in `webview/tools/modal-commands/components/<agent>/` — opening the Commands palette (`Alt+F1`) switches between them via `--agent-accent`.

---

## 🧱 The Webview Split

VS Code extensions have two execution contexts: the **host** (Node, has `vscode` API) and the **webview** (browser sandbox, has `acquireVsCodeApi()`). F1 keeps them sharply separated.

```text
                    ┌────────────────────────────────────────┐
                    │            extension.ts (host)         │
                    └──┬──────────────┬───────────────────┬──┘
                       │              │                   │
              ┌────────▼───────┐ ┌────▼──────┐ ┌──────────▼──────────┐
              │  my-cli/core   │ │ my-skills │ │     my-memory       │
              │ (view + PTY)   │ │  /core    │ │ (graphify, .f1/ )   │
              └────────┬───────┘ └────┬──────┘ └─────────────────────┘
                       │              │
                       │              │  postMessage
                       ▼              ▼
              ┌────────────────────────────────────┐
              │   webviews (browser bundles)       │
              │   xterm.js · tools · launcher      │
              └────────────────────────────────────┘

  src/my-cli/shared/  →  imported by BOTH sides — must stay vscode-free
```

> [!IMPORTANT]
> Anything imported from a `webview/` bundle cannot reference `vscode`.
> The shared `prompt/languages.ts` and `ui-strings.ts` files are loaded by
> both sides, so they hold pure data only.

---

## ⚙️ The Build (`esbuild.js`)

`bun compile` runs **typecheck → lint → 8 esbuild contexts** in parallel:

| Context | Platform | Output | Why separate |
| :------ | :------- | :----- | :----------- |
| `extension.ts` | node | `dist/extension.js` | Host entry. `vscode` is external. |
| `panel-terminal/terminal.ts` | browser | `dist/my-cli/webview/terminal.js` | xterm.js runtime |
| `panel-tab/…` | browser | `dist/…` | Session list UI |
| `launcher/index.ts` | browser | `dist/…` | Agent picker |
| `my-skills/view/index.ts` | browser | `dist/webview.js` | Skills panel UI |
| `create-skill/ui/index.ts` | browser | `dist/create-skill.js` | Create-skill flow |
| `tutorial/t-cli/support.ts` | browser | `dist/cli-tutorial.js` | Tutorial webview |
| `pty-host.ts` | node (separate process) | `dist/my-cli/core/pty-host.js` | Avoids `node-pty` segfault under Electron |

> [!WARNING]
> The PTY host **must** spawn with system Node, never Electron-as-Node — `node-pty`'s native binding has a different ABI and crashes silently. See `src/my-cli/core/terminal-cli/pty-host.ts`.

---

## 🌐 Localization (Two Mechanisms)

VS Code splits i18n into two stores — F1 uses both:

| File | What it covers | How it's read |
| :--- | :------------- | :------------ |
| `package.nls.*.json` (at root) | `displayName` + `description` (and any `%placeholder%` in `package.json` contributions) | VS Code reads before activation |
| `l10n/bundle.l10n.*.json` | Runtime notifications — `showInformationMessage`, modal dialogs, etc. | `vscode.l10n.t("English text")` at the call site |

Both ship for **12 locales**: `en` (default) + `ar · de · es · fr · hi · ja · ko · pt-br · ru · vi · zh-cn`.

The `"l10n": "./l10n"` field in `package.json` tells VS Code where to find the bundles.

---

## 🧠 My Memory in 4 Steps

1. User toggles **Memory** on for the workspace (persisted in `workspaceState`).
2. `my-memory/core` installs the local **graphify** engine (one-time, per machine).
3. `tier1-map/` writes `.f1/map.json` (file tree) · `tier2-graph/` writes `.f1/graph.json` (symbol graph).
4. Instruction files (`AGENTS.md` / `CLAUDE.md`) are pointed at `.f1/` so any agent reads it first — saving tokens on every launch.

Staleness is detected by comparing the workspace's **git tree-SHA** with the one stored in `.f1/`. The brain button colors itself accordingly (blue · stale · red = broken).

---

## 📦 What VS Code Loads

`package.json` is the single source of truth:

- **`contributes.viewsContainers`** — registers the `myCliContainer` (bottom panel) + `myskills-activity` (activity bar)
- **`contributes.views`** — wires each container to a webview view provider in `src/`
- **`contributes.commands`** + **`contributes.keybindings`** — declare `F1` (focus CLI), `Ctrl+3` (focus Skills), `Ctrl+\`` (maximize)
- **`main`** points at `./dist/extension.js`
- **`l10n`** points at `./l10n`
- **`.vscodeignore`** strips `public/`, `src/`, configs, and unused WAVs from the published VSIX

---

## 🧩 Companion Extensions

| Extension | Purpose |
| :-------- | :------ |
| [Lynx Theme Pro](https://github.com/bastndev/Lynx-Theme) | Six themes + matching icon pack |
| [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | Unified keyboard shortcuts across editors |
| [ATM](https://github.com/bastndev/atm) | Error Lens, Git Blame, Env Protection, screenshots |

---

<sub>Maintained by [Gohit X](https://gohit.xyz) · Extension ID: `bastndev.f1` · MIT</sub>
