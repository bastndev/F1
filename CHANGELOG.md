# F1

⚡ **One Hotkey. Every AI CLI.** ⚡

All-in-One (F1 [AI] composer) — turn VS Code into a hub for AI coding agents. Open Claude Code, Codex, Copilot, Cursor, Kiro, Grok, Antigravity, or any custom CLI in embedded terminals, switch between them instantly, write better prompts in your own language, and keep your project's context cheap to load for every agent.

## Features

- **9 Built-in Agents + Custom**: Claude Code, Codex, Cursor, Copilot, OpenCode, Antigravity, Kiro, Kilo Code, Grok — plus any command you bring
- **Skills Marketplace**: Install, create, and manage reusable skills (AGENTS.md / CLAUDE.md / DESIGN.md) per workspace
- **My Memory**: Committed `.f1/` project context so every CLI starts with shared knowledge — cheaper tokens, faster onboarding
- **Smart Prompt Composer**: 5-language source picker (en / es / zh / pt / ru), @-file mentions, image paste, live spellcheck, auto-translate to English before sending
- **Built-in Tools**: Prompt · Translator · Status · Keymaps · Commands — all one keystroke away
- **Voice & Finish Cue**: Read terminal output aloud, plus an optional "ding" when an agent finishes
- **12 Locales**: Fully translated UI in en, es, de, fr, ja, ko, pt-br, ru, vi, hi, ar, zh-cn

  Discover more extensions [here](https://gohit.xyz/extensions)

## Changelog

Following VS Code best practices, F1 uses semantic versioning for all releases.

<br>
<!-- --- -->

---
## [2.1.1] - 2026-07-06
- **Better**: filter chat

---
## [2.1.0] - 2026-07-03
- **Better**: Chat  , Translator
- **Better**: Prompt composer now remembers open/closed state and draft per CLI when switching sessions
- **fix**: 🐞 spelling correction
- **fix**: 🐞 prompt sometimes sent to the wrong CLI when switching sessions mid-translate
- **Refactor**:  @modal-prompt & @modal-translator
- **TEST**: 🧪 

---
## [2.0.1] - 2026-07-02
- **Add**: Mode /plan & /usage


---
## [2.0.0] - 2026-07-01
- **fix**: Implement `Smart + skill

---
## [1.1.2] - 2026-06-23
- **fix**: data, world
- **new**: Skill and cerebrito


---
## [1.1.1] - 2026-06-23
- **New**: Keymaps add in README.md


---
## [1.0.1] - 2026-06-23
- **Add**: l10n
- **BETTER**: Readme, ctrl+capslock, flame confirmation & ARCHITECTURE.md


---
## [1.0.0] - 2026-06-22

### 🎉 Initial Release
- **CLI Hub**: 9 built-in agents (Claude Code, Codex, Cursor, Copilot, OpenCode, Antigravity, Kiro, Kilo Code, Grok) plus a Custom CLI launcher.
- **Slash-Commands Palette**: Per-CLI `/` command browser at `Alt + F1`, with search and one-click send.
- **Skills Marketplace**: Install from All-time, Trending (24h), 🔥 Flame, and Official sources. Create new skills with guided generators for `AGENTS.md`, `CLAUDE.md`, and `DESIGN.md`.
- **My Memory**: Committed `.f1/` project map and symbol graph; per-workspace toggle; git tree-SHA staleness detection.
- **Prompt Composer**: 5-language source picker (en / es / zh / pt / ru) with auto-translate to English, live spellcheck for en/es/pt/ru, and `@`-file mentions + image paste.
- **Built-in Tools**: Prompt (`Shift + F1`), Translator (`Shift + F2`), Status / use (`Shift + F3`), Keymaps (`Shift + F4`), Commands (`Alt + F1`).
- **Voice**: Read terminal output and agent replies aloud, with an optional finish-ding cue when an agent completes.
- **Localization**: 12-locale identity strings (`package.nls.*.json`) + 11-locale runtime notification bundles via `vscode.l10n` (`l10n/bundle.l10n.*.json`).
- **Tutorials**: In-editor walkthroughs for the CLI Hub and Skills surfaces.

---
