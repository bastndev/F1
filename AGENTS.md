# AGENTS.md

## Project

- %description%.
- Built with: esbuild.
- Language: TypeScript.

## Package manager

- Use `bun` for this workspace. The lockfile is `bun.lock`.
- Run package scripts with `bun <script>`.

## Commands

```bash
bun check-types      # check types without emitting
bun lint             # run linter
bun compile          # compile/bundle (dev)
bun watch            # watch and rebuild on changes
```

`compile` already runs typecheck and lint before bundling; use it as the normal pre-finish gate.

No formatter, test runner is configured.

## Architecture

- VS Code extension targeting `^1.75.0`.
- Extension host main: `./dist/extension.js`; build before launching because runtime output lives under `dist/`.
- Source activation entrypoint: `src/extension.ts`.
- `src/my-skills/core/main.ts` owns the `WebviewViewProvider`, host-side message handling, template loading, and workspace file writes.
- `src/my-skills/view/index.ts` is the shell bridge between webview events and `vscode.postMessage`.
Key paths:
- `src/my-skills/screens/create-skill/ui/index.ts` — CREATE screen client bundle entrypoint.
- `src/my-skills/screens/install-skill/core` — INSTALL marketplace and installation core.
- `src/my-skills/screens/local-skill/core` — LOCAL installed-skill discovery and state.

## Build entrypoints

The esbuild config creates separate bundles; keep host and browser targets separate.

| Source | Output | Format | Platform |
|---|---|---|---|
| `src/extension.ts` | `dist/extension.js` | `cjs` | `node` |
| `src/my-cli/webview/panel-terminal/terminal.ts` | `dist/my-cli/webview/terminal.js` | `iife` | `browser` |
| `src/my-cli/webview/launcher/index.ts` | `dist/my-cli/webview/launcher/index.js` | `iife` | `browser` |
| `src/my-skills/view/index.ts` | `dist/webview.js` | `iife` | `browser` |
| `src/my-skills/screens/create-skill/ui/index.ts` | `dist/create-skill.js` | `iife` | `browser` |
| `src/shared/tutorial/t-skill/support.ts` | `dist/create-skill-support.js` | `iife` | `browser` |
| `src/shared/tutorial/t-cli/support.ts` | `dist/cli-tutorial.js` | `iife` | `browser` |
| `src/my-cli/core/terminal-cli/pty-host.ts` | `dist/my-cli/core/pty-host.js` | `cjs` | `node` |

## Runtime assets and packaging

- `dist/` is ignored, so build before launching, testing, or packaging.
- `vscode` is provided by the extension host; keep it external in extension bundles.
- HTML templates, CSS, and SVG assets under `src/my-skills/` are loaded at runtime by the extension host, not bundled into the webview JS.
- `.vscodeignore` excludes TypeScript sources but keeps `src/my-skills/**/*.html`, `**/*.css`, and `**/*.svg`; update packaging rules if new runtime asset types are added.

## Testing and launch

- VS Code's default build task is `watch`; launch configs may start that task automatically.
- Launch configs: `Run Extension`.
- Tests are present, but no `test` package script was detected; inspect the test config before running broad suites.

## Related instruction files

- Also check `CLAUDE.md` when the task touches matching tooling or design behavior.

## Key Conventions

- Error messages with prefix `[MySkills]`.
- Nonce of 64 chars for webview security.
- Minimum 1200ms loading on create operations (UX).
- Use `vscode.Uri.joinPath()` for paths.

## Caveats

- No formatter detected — no Prettier config or format script.

## Boundaries

- Prefer existing local patterns and helper APIs before adding new abstractions.
- Keep generated, packaged, and runtime asset boundaries intact; do not move files across host/webview ownership without updating build and packaging config.
- Webview DOM code is vanilla TypeScript; do not introduce a framework unless the project explicitly adopts one.
- After changing host/webview message contracts, verify both the webview bridge and the extension host handler.
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` must not exist when packaging the extension.
