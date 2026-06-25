# Contributing to F1

Before contributing, read the **[Architecture Guide](https://github.com/bastndev/F1/blob/main/ARCHITECTURE.md)** — it explains how the CLI Hub, Skills, and My Memory features fit together.

---

## Quick Start

> **Important:** To develop, package, or contribute to this project, you must install the [ATM extension](https://open-vsx.org/extension/bastndev/atm).

1. **[Fork the repository](https://github.com/bastndev/F1/fork)** on GitHub
2. Clone your fork and set up:

```bash
git clone https://github.com/YOUR-USERNAME/F1.git
cd F1
git checkout dev   # always work on dev
bun install        # install dependencies
bun compile        # typecheck + lint + bundle (the gate)
code .             # press F5 to launch the Extension Host and test live
```

> Submit all PRs to the `dev` branch of the original repo. Never edit `package.json` — that's maintainer-only.

---

## What You Can Contribute

<details>
<summary><strong>🤖 New or improved CLI adapter</strong></summary>

<br>

**Registry:** `src/my-cli/shared/agents.ts`
**Install detection:** `src/my-cli/core/terminal-cli/cli-installers.ts`
**Slash-command palette:** `src/my-cli/webview/tools/modal-commands/components/<agent>/`

To add a new agent:

1. Append it to the agents registry (label, command, slug).
2. Add an installer entry so the launcher can offer one-click install.
3. Drop an HTML fragment with the agent's `/` commands, plus a CSS accent color.

Test by pressing `F1`, picking your agent from the launcher, and verifying it spawns + `Alt+F1` opens its command palette.

Current built-in agents for reference: Claude Code · Codex · Cursor · Copilot · OpenCode · Antigravity · Kiro · Kilo Code · Grok.

</details>

<details>
<summary><strong>🧩 New Skill</strong></summary>

<br>

Skills are reusable instruction packs (`SKILL.md` + supporting files) that any CLI in the Hub can load. The fastest path to ship one is the marketplace at [skills.sh](https://skills.sh) — install it inside F1 to surface it in the **Trending** / **All-time** / **Flame** lists.

If you want to contribute a built-in template instead, see `src/my-skills/screens/create-skill/` for the generator that backs **AGENTS.md**, **CLAUDE.md**, and **DESIGN.md** quick-creates.

</details>

<details>
<summary><strong>🌐 Translations</strong></summary>

<br>

F1 ships in **12 locales** via two parallel files per language:

- `package.nls.<locale>.json` — extension title + description (read by VS Code before activation)
- `l10n/bundle.l10n.<locale>.json` — runtime notifications (read by `vscode.l10n.t()` at the call site)

To add a new locale, copy the `es` versions of both files, translate, and submit a PR. To improve an existing translation, edit the matching entries in both files.

> Keys in `bundle.l10n.*.json` must match the **exact English source string** passed to `vscode.l10n.t(...)` — that's how the lookup works.

</details>

<details>
<summary><strong>📝 Documentation</strong></summary>

<br>

Target files: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.

Translated READMEs live in `public/doc/` (11 languages). Screenshots and marketing assets go in `public/github/` and are referenced via GitHub raw URLs — they are not bundled in the VSIX.

In-editor tutorials live in `src/shared/tutorial/t-cli/` and `t-skill/` (HTML + CSS + TS bundled to the webview).

</details>

---

## Submitting a PR

Keep PRs small and focused on one CLI adapter, one skill, or one fix. If you're touching many areas at once, split into separate PRs — it's faster to review and faster to merge.

Your PR description should include:

- **What** changed and why
- **Screenshots / short clip** if it touches the UI (highly recommended)
- Confirmation that **`bun compile`** passes locally
- For a new CLI: confirmation that it spawns and `Alt+F1` lists its commands
- For a translation: the locale + the file(s) edited

---

## Need Help?

- **Bug or idea?** → [Open an issue](https://github.com/bastndev/F1/issues/new)
- **Architecture questions?** → [ARCHITECTURE.md](https://github.com/bastndev/F1/blob/main/ARCHITECTURE.md)
- **VS Code webview API** → [code.visualstudio.com/api](https://code.visualstudio.com/api/extension-guides/webview)
- **vscode.l10n reference** → [code.visualstudio.com/api/references/vscode-api#l10n](https://code.visualstudio.com/api/references/vscode-api#l10n)
- **Contact** → bastndev@gohit.xyz

Please follow our [Code of Conduct](https://github.com/bastndev/F1/blob/main/CODE_OF_CONDUCT.md).

---

<sub>Maintained by [Gohit X](https://gohit.xyz) · Licensed under MIT</sub>
