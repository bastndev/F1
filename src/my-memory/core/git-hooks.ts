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
