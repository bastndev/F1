# AGENTS.md

## Project

- VS Code extension.
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

## Build entrypoints

The esbuild config creates separate bundles; keep host and browser targets separate.

| Source | Output | Format | Platform |
|---|---|---|---|
| `src/extension.ts` | `dist/extension.js` | `cjs` | `node` |
| `src/clihub/webview/ui/panel-terminal/terminal.ts` | `dist/clihub/webview/webview.js` | `iife` | `browser` |
| `src/clihub/index.ts` | `dist/clihub/index.js` | `iife` | `browser` |
| `src/clihub/webview/core/terminal-cli/pty-host.ts` | `dist/clihub/webview/core/terminal-cli/pty-host.js` | `cjs` | `node` |

## Runtime assets and packaging

- `dist/` is ignored, so build before launching, testing, or packaging.
- `vscode` is provided by the extension host; keep it external in extension bundles.

## Testing and launch

- VS Code's default build task is `watch`; launch configs may start that task automatically.
- Launch configs: `Run Extension`.

## Key Conventions

- Error messages with prefix `[MySkills]`.
- Nonce of 64 chars for webview security.
- Minimum 1200ms loading on create operations (UX).
- Use `vscode.Uri.joinPath()` for paths.

## Caveats

- No test runner configured — no `test` script or test config found.
- No formatter detected — no Prettier config or format script.

## Boundaries

- Prefer existing local patterns and helper APIs before adding new abstractions.
- Keep generated, packaged, and runtime asset boundaries intact; do not move files across host/webview ownership without updating build and packaging config.
- Webview DOM code is vanilla TypeScript; do not introduce a framework unless the project explicitly adopts one.
- After changing host/webview message contracts, verify both the webview bridge and the extension host handler.
