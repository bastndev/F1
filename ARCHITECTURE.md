# 🏗️ F1 — Architecture

A VS Code extension that turns the editor into a hub for AI coding agents. Ships **3 surface features**: a **CLI Hub** (9 agents + custom), a **Skills** marketplace, and a **My Plus** engine — the latter bundles **My Memory** (project context) and **Smart + Skills** (automatic CLI priming). Everything is wired together by a webview/host split and a single keystroke (`F1`).

---

## 📁 Project Structure

```text
F1/
├── .vscode/                             # Editor workspace settings
├── src/
│   ├── extension.ts                     # Extension entry — wires CLI Hub + Skills
│   │
│   ├── my-cli/                          # 🖥️ Feature 1 — CLI Hub
│   │   ├── core/                        # Host-side (Node)
│   │   │   ├── main.ts                  # Webview view provider + message router
│   │   │   ├── terminal-cli/            # PTY spawn, install detection, pty-host
│   │   │   ├── translation/             # Source→EN bridge (calls fixnow)
│   │   │   ├── spellcheck/              # Per-language dictionary host
│   │   │   ├── voice/                   # Read-aloud + "ding" finish cue (WAVs)
│   │   │   ├── attachments/             # @-file mentions host prep
│   │   │   ├── launcher-html.ts         # Inlines launcher HTML/CSS
│   │   │   ├── webview-assets.ts        # CLI webview asset helpers
│   │   │   ├── webview-html.ts          # Terminal panel HTML assembly
│   │   │   └── workspace.ts             # Workspace-state helpers
│   │   ├── shared/                      # DOM- and vscode-free types & helpers
│   │   │   ├── prompt/                  # Prompt processing, attachments, languages
│   │   │   ├── rules/                   # Built-in rules content
│   │   │   ├── translation/             # HTML entities for translator
│   │   │   ├── voice/                   # WAV assets + voice types
│   │   │   ├── agents.ts                # The 9 CLI registry
│   │   │   ├── agent-launch-guard.ts    # Launch validation / policies
│   │   │   ├── model-detect.ts          # Model-name detection
│   │   │   ├── protocol.ts              # Host↔webview message contracts
│   │   │   └── ui-strings.ts            # Shared UI copy
│   │   ├── webview/                     # Browser-side bundles (xterm.js UI)
│   │   │   ├── assets/icons-cli/        # Per-agent SVG icons
│   │   │   ├── styles/                  # Global CSS + skeleton themes
│   │   │   ├── panel-terminal/          # xterm.js + xterm-addon-fit
│   │   │   ├── panel-tab/               # Session list + Alt+/Alt− affordances
│   │   │   ├── launcher/                # Fuzzy-search agent picker
│   │   │   └── tools/                   # Right-side tools dock
│   │   │       ├── modal-prompt/        # Composer + 5-lang picker + spellcheck
│   │   │       ├── modal-translator/    # Terminal-selection translator
│   │   │       ├── modal-use/           # Per-CLI usage / status view
│   │   │       ├── modal-keymaps/       # Shortcut reference
│   │   │       └── modal-commands/      # Slash-command palette (per CLI)
│   │   └── my-cli.ts                    # Public façade (only host exports)
│   │
│   ├── my-skills/                       # 🧩 Feature 2 — Skills
│   │   ├── core/                        # Host-side provider + orchestration
│   │   │   ├── main.ts                  # WebviewViewProvider
│   │   │   ├── install-skills-controller.ts
│   │   │   ├── install-state.ts
│   │   │   ├── messages.ts
│   │   │   └── skills-webview-html.ts
│   │   ├── screens/
│   │   │   ├── install-skill/           # Marketplace install (skills.sh + npx)
│   │   │   ├── create-skill/            # AGENTS.md / CLAUDE.md / DESIGN.md gens
│   │   │   │   ├── core/                # Generators + workspace inspection
│   │   │   │   └── ui/                  # Chat create / chat search / shared shell
│   │   │   └── local-skill/             # On-disk + saved-skill library
│   │   ├── view/                        # Browser bundle (dist/webview.js)
│   │   ├── assets/                      # Webview-only images + SVG
│   │   └── my-skills.ts                 # Public façade (only host exports)
│   │
│   ├── my-plus/                         # ➕ Feature 3 — My Plus (Memory + Smart)
│   │   ├── my-memory/                   # 🧠 Project-context engine
│   │   │   ├── core/                    # Config, paths, atomic writes, service
│   │   │   └── tier1-map/               # File-tree map (.f1/map.json)
│   │   ├── my-smart/                    # Smart + Skills priming
│   │   │   ├── core/                    # Smart service + skill helpers
│   │   │   ├── webview/                 # Smart skeleton overlay
│   │   │   └── assets/skills/default/   # Built-in default skill asset
│   │   ├── shared/
│   │   │   └── instruction-builder.ts   # Shared prompt builder
│   │   └── plus.ts                      # Public barrel
│   │
│   ├── shared/                          # Cross-feature helpers
│   │   ├── tutorial/                    # In-editor tutorials (HTML+CSS+TS)
│   │   │   ├── t-cli/                   # CLI Hub walkthrough
│   │   │   └── t-skill/                 # Skills walkthrough
│   │   ├── keymaps/                     # Shared keymap utilities
│   │   │   └── lynx-keymap/             # Lynx Keymap install prompt
│   │   ├── tips/                        # Tip snippets
│   │   └── assets/                      # Logo + tutorial images
│   │
│   └── __test__/                        # Unit tests
│       ├── my-cli.test.ts
│       ├── my-memory.test.ts
│       ├── my-skills.test.ts
│       ├── my-smart.test.ts
│       └── smart-rules.test.ts
│
├── l10n/                                # 🌐 Runtime i18n bundles (vscode.l10n)
│   └── bundle.l10n.{ar,de,es,fr,hi,ja,ko,pt-br,ru,vi,zh-cn}.json
│
├── public/                              # Marketing & docs (excluded from VSIX)
│   ├── banner.webp
│   ├── docs/                            # Translated READMEs (11 languages)
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
├── NOTES.md                             # Internal notes
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md
├── vsc-extension-quickstart.md          # VS Code extension quickstart
├── .prettierignore
├── LICENSE                              # MIT
└── icon.png
```

---

## 🎯 The 3 Features

| # | Feature | What it does |
| :- | :------ | :----------- |
| 1 | **CLI Hub** (`my-cli/`) | Runs every AI agent in an embedded xterm.js terminal. One panel, many sessions. |
| 2 | **My Skills** (`my-skills/`) | Marketplace + local library for reusable skill files (`AGENTS.md`, `CLAUDE.md`, `DESIGN.md`). |
| 3 | **My Plus** (`my-plus/`) | Project-context engine. `my-memory/` builds `.f1/` maps; `my-smart/` primes CLI launches with cheap context. |

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
               │  my-cli/core   │ │ my-skills │ │      my-plus        │
               │ (view + PTY)   │ │  /core    │ │ (memory + smart)    │
               └────────┬───────┘ └────┬──────┘ └─────────────────────┘
                        │              │
                        │              │  postMessage
                        ▼              ▼
               ┌────────────────────────────────────┐
               │   webviews (browser bundles)       │
               │   xterm.js · tools · launcher      │
               │   skills · create-skill · tutorials│
               └────────────────────────────────────┘

  src/my-cli/shared/  →  imported by BOTH sides — must stay vscode-free
  src/my-plus/shared/ →  imported by memory + smart — must stay vscode-free
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
| `tutorial/t-cli/support.ts` | browser | `dist/cli-tutorial.js` | CLI tutorial webview |
| `tutorial/t-skill/support.ts` | browser | `dist/create-skill-support.js` | Skills tutorial webview |
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

1. `MemoryService` is enabled (standalone toggle or forced on by Smart mode).
2. `tier1-map/` scans the workspace and writes `.f1/map.json` (cheap structural tree).
3. `sync-instructions.ts` keeps the launching CLI's instruction file pointed at `.f1/`.
4. The agent starts with project context already loaded — saving tokens on every launch.

Staleness is detected by comparing the workspace's **git tree-SHA** with the one stored in `.f1/`. The older graphify-based symbol graph and brain-button UI were removed; only the fast Tier-1 map remains.

---

## 🧠 Smart + Skills

`SmartService` reuses `MemoryService` to:

1. Build the `.f1/` project map and write `.f1/smart-rules.md`.
2. Read the latest `graphify-out/GRAPH_REPORT.md` (when available) for symbol-level context.
3. Assemble a single priming prompt and type it into the CLI so the agent itself says **"i am ready for work ✅"**.
4. Clean up generated files after the agent's first reply settles.

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
