# AGENTS.md

## Commands

```bash
bun run compile      # Full build: check-types → lint → esbuild (production)
bun run watch        # Dev mode: parallel tsc + esbuild watchers
bun run check-types  # TypeScript only (no emit)
bun run lint         # ESLint on src/
```

No test suite exists. Verify changes with `npm run compile` (must pass typecheck + lint + build).

## Architecture

VS Code extension providing a panel with multiple CLI agent integrations (OpenCode, Codex, Claude Code, etc.).

**Three esbuild contexts** (see `esbuild.js`):
1. **Extension host** (Node/CJS): `src/extension.ts` → `dist/extension.js`
2. **Webview** (browser/IIFE): `src/clihub/webview/ui/panel-terminal/terminal.ts` → `dist/clihub/webview/webview.js`
3. **PTY host** (Node/CJS): `src/clihub/webview/core/terminal-cli/pty-host.ts` → `dist/clihub/webview/core/terminal-cli/pty-host.js`

**Externals** (not bundled): `vscode`, `node-pty`

**Static assets**: HTML/CSS/SVG from `src/clihub/` are copied to `dist/clihub/` on build. The esbuild plugin `clihub-assets` handles this automatically.

## Key entrypoints

- `src/extension.ts` — VS Code activation, registers `CliHubViewProvider`
- `src/clihub/main.ts` — Webview provider, message routing, HTML templating
- `src/clihub/webview/` — Browser-side UI (terminal, tabs, translate panels)
- `src/clihub/webview/core/terminal-cli/` — PTY management, session handling, agent definitions

## Conventions

- Webview code runs in browser context — no Node.js APIs (use message passing to extension host)
- PTY operations must go through `pty-host.ts` (separate Node context)
- HTML uses placeholder substitution: `${styleUri}`, `${nonce}`, `${cliModels}`, `${workspacePath}`, `${contentSecurityPolicy}`
- CSP is strict: `default-src 'none'`, nonce-based scripts only
- ESLint enforces `camelCase`/`PascalCase` for imports, `curly`, `eqeqeq`, `semi`
