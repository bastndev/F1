<div align="center">

[![Lynx F1](https://raw.githubusercontent.com/bastndev/F1/refs/heads/main/public/banner.webp)](https://www.gohit.xyz/extension/f1)

<p>
  <img src="https://vsmarketplacebadges.dev/version-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=VERSION" alt="Version">&nbsp;
  <img src="https://vsmarketplacebadges.dev/downloads-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=Downloads" alt="Downloads">&nbsp;
  <img src="https://vsmarketplacebadges.dev/rating-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=RATING" alt="Rating">&nbsp;
  <a href="https://github.com/bastndev/F1"><img src="https://raw.githubusercontent.com/bastndev/F1/refs/heads/main/public/github/icons/star.png" width="26.6px" alt="Github Star ⭐️"></a>
</p>

<p >
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_ES.md">Español 🇪🇸</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_ZH.md">中文 🇨🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_DE.md">Deutsch 🇩🇪</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_FR.md">Français 🇫🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_JA.md">日本語 🇯🇵</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_KO.md">한국어 🇰🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_PT.md">Português 🇧🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_RU.md">Русский 🇷🇺</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_VI.md">Tiếng Việt 🇻🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_HI.md">हिन्दी 🇮🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_AR.md">العربية 🇸🇦</a><span>...</span>
</p>

**Launch and manage every AI coding CLI from one VS Code panel.**

</div>

---

F1 turns VS Code into a hub for AI coding agents. Open **Claude Code, Codex, Copilot, Cursor, Kiro, Kilo Code, OpenCode, Grok, Antigravity** — or any custom CLI — in embedded terminals, switch between them instantly, write better prompts, and keep your project's context cheap to load for every agent.

## ⌨️ Keyboard shortcuts

| Shortcut            | Action                    |     |
| ------------------- | ------------------------- | --- |
| `F1`                | Focus the CLI Hub panel   | ✅  |
| `Ctrl` + `3`        | Focus the My Skills panel | ✅  |
| `Ctrl` + `          | Toggle maximized panel    | ✅  |
| -                   | -                         | -   |
| `Ctrl` + `Capslock` | Side Panel                | ✅  |

---

<h2 align="center">:: Features ::</h2>

### 🖥️ CLI Hub

- Run multiple AI coding CLIs side by side in embedded [xterm.js](https://xtermjs.org/) terminals.
- Fuzzy-search launcher to pick an agent; press **F1** to jump straight to the panel.
- Built-in tools alongside every session:
  - **Prompt** — rich editor with `@`-file mentions, image paste, skill chips, live spell‑marking, and source→English translation before sending.
  - **Translator** — translate any terminal selection inline.
  - **Use** — per‑CLI usage / status view.
  - **Keymaps** — keyboard‑shortcut reference.
- **Voice** — read replies aloud, plus an optional "ding" when an agent finishes while your attention is elsewhere.

### 🧩 My Skills

- Install skills from the marketplace — **All‑time**, **Trending (24h)**, **🔥 Flame**, and **Official** sources.
- Create skills with guided generators for `AGENTS.md`, `CLAUDE.md`, and `DESIGN.md`, plus fast templates by category.
- Manage local and saved skills per workspace.

### 🧠 My Memory

- Generate a committed `.f1/` project‑context map so any CLI starts with cheap, shared context.
- Per‑project toggle; instruction files (`AGENTS.md` / `CLAUDE.md`) stay pointed at the context.

## 🚀 Getting started

1. Install **F1** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bastndev.f1).
2. Press **`F1`** to open the **CLI Hub** panel.
3. Pick an agent from the launcher (or **Custom CLI** to run your own command).
4. Open **My Skills** from the activity bar (**`Ctrl+3`**) to install or create skills.

> The first launch of an agent installs its CLI if it isn't already on your `PATH`.

<br>

---

---

<br>

## 📋 Requirements

- VS Code `^1.75.0` (or a compatible fork: Cursor, Windsurf, Trae.ai, Kiro, Firebase Studio).
- The AI CLI you want to use (F1 can install supported ones on first launch).

## 🛠️ Development

This repo uses [Bun](https://bun.sh/) and [esbuild](https://esbuild.github.io/).

```bash
bun install          # install dependencies
bun run compile      # type-check + lint + bundle (the full gate)
bun run watch        # rebuild on change (esbuild + tsc)
```

Press **F5** in VS Code to launch the Extension Development Host.

The codebase is organized into three products under `src/` — `my-cli/`, `my-skills/`, `my-memory/` — plus a shared layer. See [`AGENTS.md`](AGENTS.md) for the full architecture (layout, build targets, message protocol, and how to add a new CLI agent).

## 🤝 Contributing

Issues and pull requests are welcome — please open them on the [GitHub repository](https://github.com/bastndev/F1). Run `bun run compile` before submitting.

## 📄 License

[MIT](LICENSE) © [Gohit (X) Bastian](https://www.gohit.xyz/me)
