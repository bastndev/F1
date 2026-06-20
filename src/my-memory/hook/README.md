# My Memory — auto-refresh `.f1/` on commit (shelved feature)

> **Status: removed from the build.** This folder is kept only as a reference so
> the feature can be revived here or dropped into another project. None of the
> code below is currently wired in — see "Re-integration checklist" at the end.

## What it did

When **My Memory** was enabled, the committed `.f1/` context map was kept in sync
with the code automatically: on every `git commit`, if the project was stale, a
git **pre-commit hook** rebuilt `.f1/` and folded it **into the same commit** —
so commit _N_ always shipped the context for code _N_. No manual "brain button"
press, no `.f1/` drift trailing behind as uncommitted changes.

It worked regardless of how you committed (terminal, VS Code Source Control, any
GUI), because a git hook fires for all of them.

## Why it was designed this way

- **Reuses `MemoryService` instead of reimplementing in shell.** A standalone
  Node runner imports the same build logic, so the hook can never drift from the
  brain-button path.
- **Never blocks a commit.** The hook is `... || true; exit 0`, the runner wraps
  everything in a 60s timeout, and a build failure just skips staging. A context
  builder must never stop you from committing.
- **Non-destructive.** It only ever manages a hook it wrote (identified by a
  marker line) and stages only its own 3 paths (`.f1/`, `AGENTS.md`,
  `CLAUDE.md`). It steps aside entirely on repos that route hooks through
  `core.hooksPath` (husky / lefthook) or already have a foreign `pre-commit`.

## Flow on commit

1. Hook fires → runs `node dist/my-memory/run-hook.js`.
2. Runner checks staleness (one `git write-tree` — milliseconds).
3. **Not stale** → exit immediately. Clean commits stay instant.
4. **Stale + toolchain present** → rebuild `.f1/`, then
   `git add -- .f1 AGENTS.md CLAUDE.md`, then exit 0. The fresh context joins the
   in-progress commit.

After the commit: working tree clean, brain button green, no `.f1/` drift. (Note
`.f1/`, `AGENTS.md`, `CLAUDE.md` are *excluded* from the staleness tree-SHA, so
the hook rewriting them — including `memory.json`, which stores the SHA — can
never re-trigger "stale". That exclusion is what makes this loop-free.)

---

## File 1 — `src/my-memory/hook/run-hook.ts` (the runner)

Its own esbuild target → `dist/my-memory/run-hook.js` (`platform: node`,
`format: cjs`, `external: ['vscode']`).

```ts
/**
 * Standalone pre-commit runner for "My Memory".
 *
 * Invoked by the git pre-commit hook — a separate process from the extension —
 * so it reuses MemoryService directly instead of reimplementing the sync logic
 * in shell (which would drift). When the project is stale it refreshes `.f1/`
 * and stages the managed files into the in-progress commit, so each commit ships
 * a context map that matches its code.
 *
 * Contract: it touches only the files it owns (`.f1/`, AGENTS.md, CLAUDE.md) and
 * ALWAYS exits 0 — a context build must never block the user's commit.
 *
 * Node-only entry point (its own esbuild target); no `vscode`.
 */

import { spawnSync } from 'child_process';
import { MemoryService } from '../core/memory-service';

/**
 * Hard ceiling on the whole run. A context build must never block a commit, so
 * if anything hangs (e.g. a stuck graphify), we bail and let the commit proceed
 * — the refresh is picked up on the next commit or via the brain button. This is
 * the portable safety net (no reliance on a `timeout` binary in the hook shell).
 */
const HOOK_TIMEOUT_MS = 60_000;

const finish = (): never => process.exit(0);

const main = async (): Promise<void> => {
	const root = process.cwd();
	const service = new MemoryService();
	service.setEnabled(true);

	const snapshot = service.getSnapshot(root);
	// Nothing to refresh (fresh, never built, or no engine) → leave the commit alone.
	if (!snapshot.stale || !snapshot.hasGraphify) {
		finish();
	}

	const result = await service.rebuild(root);
	if (result.success) {
		// Stage ONLY our managed paths — never the user's other changes.
		spawnSync('git', ['add', '--', '.f1', 'AGENTS.md', 'CLAUDE.md'], { cwd: root, timeout: 10_000 });
	}
	finish();
};

// finish() is process.exit, so the timer (and any orphaned work) dies with us.
setTimeout(finish, HOOK_TIMEOUT_MS);
main().catch(() => finish());
```

## File 2 — `src/my-memory/core/git-hooks.ts` (install / remove / detect)

```ts
/**
 * Install / remove the "My Memory" pre-commit hook.
 *
 * The hook keeps the committed `.f1/` context in sync with the code: on commit
 * it runs the standalone runner (dist/my-memory/run-hook.js), which rebuilds
 * `.f1/` when stale and stages it into the same commit.
 *
 * Non-destructive by contract — same rule as the instruction files: we only ever
 * own a hook we wrote (it carries our marker). We never overwrite a hook we
 * didn't create, and we step aside entirely when the repo routes hooks through
 * `core.hooksPath` (husky / lefthook). Pure Node — no `vscode`.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Marker line that identifies a pre-commit hook as ours. */
const HOOK_MARKER = '# F1-MEMORY managed pre-commit hook';

export type HookInstallResult =
	| { status: 'installed' }
	| { status: 'updated' }
	| { status: 'unchanged' }
	| { status: 'skipped'; reason: 'not-git' | 'managed-elsewhere' | 'foreign-hook' };

/** True if the repo redirects hooks elsewhere (husky/lefthook) — leave it alone. */
const usesCustomHooksPath = (root: string): boolean => {
	try {
		const cfg = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
		return cfg.status === 0 && cfg.stdout.trim().length > 0;
	} catch {
		return false;
	}
};

/**
 * Write the pre-commit hook. Skips (touching nothing) when the repo isn't git,
 * routes hooks elsewhere, or already has a foreign pre-commit hook.
 */
export const installPreCommitHook = (root: string, nodePath: string, runnerPath: string): HookInstallResult => {
	if (!fs.existsSync(path.join(root, '.git'))) {
		return { status: 'skipped', reason: 'not-git' };
	}
	if (usesCustomHooksPath(root)) {
		return { status: 'skipped', reason: 'managed-elsewhere' };
	}

	const hooksDir = path.join(root, '.git', 'hooks');
	const hookPath = path.join(hooksDir, 'pre-commit');

	let existed = false;
	if (fs.existsSync(hookPath)) {
		const current = fs.readFileSync(hookPath, 'utf8');
		if (!current.includes(HOOK_MARKER)) {
			return { status: 'skipped', reason: 'foreign-hook' };
		}
		existed = true;
	}

	const body = [
		'#!/bin/sh',
		HOOK_MARKER,
		'# Refreshes .f1/ project context when the repo is stale, then stages it.',
		'# Safe to delete; it never blocks a commit.',
		`"${nodePath}" "${runnerPath}" || true`,
		'exit 0',
		''
	].join('\n');

	try {
		if (existed && fs.readFileSync(hookPath, 'utf8') === body) {
			return { status: 'unchanged' };
		}
		fs.mkdirSync(hooksDir, { recursive: true });
		fs.writeFileSync(hookPath, body, 'utf8');
		fs.chmodSync(hookPath, 0o755);
		return { status: existed ? 'updated' : 'installed' };
	} catch (error) {
		console.error('[my-memory] installPreCommitHook failed:', error);
		return { status: 'skipped', reason: 'foreign-hook' };
	}
};

/** Delete the pre-commit hook, but only if it's ours. */
export const removePreCommitHook = (root: string): void => {
	try {
		const hookPath = path.join(root, '.git', 'hooks', 'pre-commit');
		if (fs.existsSync(hookPath) && fs.readFileSync(hookPath, 'utf8').includes(HOOK_MARKER)) {
			fs.unlinkSync(hookPath);
		}
	} catch (error) {
		console.error('[my-memory] removePreCommitHook failed:', error);
	}
};
```

## File 3 — `MemoryService` integration (`src/my-memory/core/memory-service.ts`)

```ts
// import:
import { installPreCommitHook, removePreCommitHook, type HookInstallResult } from './git-hooks';

// public method:
public installCommitHook(root: string | undefined, nodePath: string, runnerPath: string): HookInstallResult {
	if (!root) {
		return { status: 'skipped', reason: 'not-git' };
	}
	return installPreCommitHook(root, nodePath, runnerPath);
}

// inside cleanup(), so disabling the toggle also removes the hook:
removePreCommitHook(root);
```

Front door (`src/my-memory/my-memory.ts`):

```ts
export type { HookInstallResult } from './core/git-hooks';
```

## File 4 — Host wiring (`src/my-cli/core/main.ts`)

Needs `import * as path from 'path';`.

```ts
/**
 * Install (or refresh) the pre-commit hook that keeps `.f1/` in sync on commit.
 * Idempotent and non-destructive — it steps aside on repos that manage their
 * own hooks. When asked, it tells the user once if it had to skip.
 */
private _installMemoryHook(notifyIfSkipped = false): void {
	const root = this._getMemoryWorkspaceRoot();
	if (!root) {
		return;
	}
	const nodePath = process.env.CLIHUB_NODE_PATH || 'node';
	const runnerPath = path.join(this._extensionUri.fsPath, 'dist', 'my-memory', 'run-hook.js');
	const result = this.memoryService.installCommitHook(root, nodePath, runnerPath);
	if (notifyIfSkipped && result.status === 'skipped' && result.reason !== 'not-git') {
		const detail = result.reason === 'managed-elsewhere'
			? 'this project routes git hooks through its own tooling (e.g. husky).'
			: 'this project already has a pre-commit hook.';
		vscode.window.showInformationMessage(
			`My Memory: auto-update on commit is off because ${detail} Use the brain button to refresh .f1/ manually.`
		);
	}
}
```

Call sites:
- In `_handleMemoryGetSnapshot`, the `if (message.enabled)` branch, after the
  `_ensureMemoryBuilt` early-return: `this._installMemoryHook(userInitiated);`
  (covers toggle-on-with-existing-graph and reload restore).
- In `_ensureMemoryBuilt`, the `if (result.success)` branch:
  `this._installMemoryHook(true);` (install after the first/any successful build).

## File 5 — Build target (`esbuild.js`)

Add a context mirroring `ptyHostCtx`, plus its `.watch()` / `.rebuild()` /
`.dispose()` calls:

```js
const memoryHookCtx = await esbuild.context({
	entryPoints: [
		'src/my-memory/hook/run-hook.ts'
	],
	bundle: true,
	format: 'cjs',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'node',
	outfile: 'dist/my-memory/run-hook.js',
	external: ['vscode'],
	logLevel: 'silent',
	plugins: [
		esbuildProblemMatcherPlugin,
	],
});
```

---

## Design decisions & gotchas (read before reviving)

- **Staleness must use a git tree-SHA via a throwaway index**, excluding `.f1/`,
  `AGENTS.md`, `CLAUDE.md`. This is what makes the hook loop-free and immune to
  `git add` / unstage / commit. If staleness ever goes back to mtime or
  `git status`, the button will flap yellow forever (we hit every one of those
  bugs). That logic lives in `MemoryService.isStale` / `gitWorkingTreeSha` and is
  **kept** even with the hook removed (the brain button relies on it).
- **Never block the commit**: keep `|| true; exit 0` in the hook *and* the 60s
  timeout in the runner. Don't add stash gymnastics.
- **Only stage the 3 owned paths.** Never `git add -A` from the hook.
- **Partial commits** (`git commit -- file`, `-p`, `--only`): the runner stages
  its 3 paths anyway; in the rare partial case `.f1/` may simply land one commit
  later. We deliberately do *not* try to detect/stash around it (that's where
  corruption risk lives). Acceptable: no code loss, just minor lag.

## Open items that were never finished (the reason it's shelved-not-shipped)

These are the "Stage 4" hardening items, untested when the feature was pulled:

1. **GUI commits (VS Code Source Control).** The hook calls
   `process.env.CLIHUB_NODE_PATH || 'node'`; a GUI commit's environment may not
   have `node` on PATH. It fails safe (that commit just doesn't refresh), but to
   make GUI commits reliable, **bake an absolute Node path at install time**.
2. **Windows.** The baked path contains `\` inside a POSIX `sh` script. Normalize
   to forward slashes (Git-for-Windows `sh` accepts them) before shipping.
3. **Extension updates** move the versioned `dist/.../run-hook.js` path, so the
   baked hook goes stale. It was refreshed on enable/restore; confirm that covers
   the update case, or re-resolve on activation.

## Re-integration checklist

1. Restore `run-hook.ts` (this folder) and `core/git-hooks.ts` from the blocks above.
2. Add the `memoryHookCtx` esbuild target + its watch/rebuild/dispose calls.
3. Add `installCommitHook` to `MemoryService` and `removePreCommitHook(root)` inside `cleanup()`.
4. Re-export `HookInstallResult` from `my-memory.ts`.
5. Add `_installMemoryHook` + the two call sites in `main.ts` (and the `path` import).
6. Resolve the three open items above before shipping.
7. `bun run compile` — expect 9 esbuild targets.
