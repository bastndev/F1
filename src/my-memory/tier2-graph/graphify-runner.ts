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
import { MEMORY_DIR, MEMORY_GRAPH_FILE } from '../core/memory-paths';
import { detectToolchain, resolveGraphifyInvocation, run, type ProgressFn } from './toolchain';

// Build command (confirmed against `graphify --help` on 2026-06-15).
// `graphify update .` re-extracts CODE files only — explicitly "no LLM needed",
// so it's fully local and free. We deliberately avoid `graphify extract .`: that
// is the heavier AST + semantic-LLM path that demands an API key for any
// docs/images in the repo ("no LLM API key found"). `--force` lets a rebuild
// shrink the graph after code is deleted.
const FULL_ARGS = ['update', '.', '--force'];
const INCREMENTAL_ARGS = ['update', '.'];

const GRAPHIFY_OUT_DIR = 'graphify-out';
const OUT_GRAPH = 'graph.json';
const OUT_REPORT = 'GRAPH_REPORT.md';

export type GraphResult = { graphJsonCreated: boolean; reportCreated: boolean };

export const runGraphify = async (
	root: string,
	opts: { incremental?: boolean; onProgress?: ProgressFn } = {}
): Promise<GraphResult> => {
	const status = detectToolchain();
	const { cmd, prefix } = resolveGraphifyInvocation(status);
	const args = [...prefix, ...(opts.incremental ? INCREMENTAL_ARGS : FULL_ARGS)];

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
