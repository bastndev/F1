/**
 * Runs graphify against the project and copies its graph into `.f1/`.
 *
 * graphify writes to a `graphify-out/` folder; we copy `graph.json` (and the
 * human-readable report) into `.f1/` so that one committed folder holds all the
 * shared context. Code-only extraction is local and free (tree-sitter AST).
 *
 * Pure Node — no `vscode`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GRAPHIFY_IGNORE_COMMENT, GRAPHIFY_OUT_DIR, MEMORY_DIR, MEMORY_GRAPH_FILE } from '../core/memory-paths';
import { detectToolchain, resolveGraphifyInvocation, run, type ProgressFn } from './toolchain';

// Build command (confirmed against `graphify --help` on 2026-06-15).
// `graphify update .` re-extracts CODE files only — explicitly "no LLM needed",
// so it's fully local and free. We deliberately avoid `graphify extract .`: that
// is the heavier AST + semantic-LLM path that demands an API key for any
// docs/images in the repo ("no LLM API key found"). `--force` makes an explicit
// rebuild authoritative — graphify otherwise refuses to overwrite when the graph
// would shrink (after deleting code, or recovering a deleted .f1/ over a stale cache).
const BUILD_ARGS = ['update', '.', '--force'];

const OUT_GRAPH = 'graph.json';
const OUT_REPORT = 'GRAPH_REPORT.md';

export type GraphResult = { graphJsonCreated: boolean; reportCreated: boolean };

export const runGraphify = async (
	root: string,
	opts: { onProgress?: ProgressFn } = {}
): Promise<GraphResult> => {
	const status = detectToolchain();
	const { cmd, prefix } = resolveGraphifyInvocation(status);
	const args = [...prefix, ...BUILD_ARGS];

	opts.onProgress?.('Building code graph with graphify (local, no API)…');
	await run(cmd, args, { cwd: root, onProgress: opts.onProgress });

	const outDir = path.join(root, GRAPHIFY_OUT_DIR);
	const f1Dir = path.join(root, MEMORY_DIR);
	fs.mkdirSync(f1Dir, { recursive: true });

	let graphJsonCreated = false;
	const srcGraph = path.join(outDir, OUT_GRAPH);
	if (fs.existsSync(srcGraph)) {
		fs.copyFileSync(srcGraph, path.join(f1Dir, MEMORY_GRAPH_FILE));
		graphJsonCreated = true;
	}

	let reportCreated = false;
	const srcReport = path.join(outDir, OUT_REPORT);
	if (fs.existsSync(srcReport)) {
		fs.copyFileSync(srcReport, path.join(f1Dir, OUT_REPORT));
		reportCreated = true;
	}

	return { graphJsonCreated, reportCreated };
};

/**
 * Ensure the project's own `.gitignore` lists `graphify-out/`, so graphify's
 * working dir + cache go grey/untracked like `dist`/`node_modules` instead of
 * being committed. Idempotent and non-destructive: only appends the line if it
 * isn't already there; creates `.gitignore` if the project has none. (The
 * committed context lives in `.f1/`, which we never ignore.)
 */
export const ensureGraphifyOutIgnored = (root: string): void => {
	try {
		const gitignorePath = path.join(root, '.gitignore');
		const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

		const alreadyIgnored = existing.split('\n').some((line) => {
			const normalized = line.trim().replace(/^\//, '').replace(/\/$/, '');
			return normalized === GRAPHIFY_OUT_DIR;
		});
		if (alreadyIgnored) {
			return;
		}

		const next = existing.trim().length
			? `${existing.trimEnd()}\n\n${GRAPHIFY_IGNORE_COMMENT}\n${GRAPHIFY_OUT_DIR}/\n`
			: `${GRAPHIFY_IGNORE_COMMENT}\n${GRAPHIFY_OUT_DIR}/\n`;
		fs.writeFileSync(gitignorePath, next, 'utf8');
	} catch (error) {
		console.error('[my-memory] ensureGraphifyOutIgnored failed:', error);
	}
};
