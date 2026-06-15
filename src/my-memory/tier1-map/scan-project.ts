/**
 * Tier 1 project scanner — builds a lightweight structural picture of the
 * workspace using only Node's `fs`. No Python, no AI, no network: this is the
 * "breadth" map (what exists) that always works and never costs tokens.
 */

import * as fs from 'fs';
import * as path from 'path';

const IGNORED_DIRS = new Set([
	'node_modules',
	'dist',
	'out',
	'build',
	'coverage',
	'.next',
	'.cache',
	'.git',
	'.f1',
	'graphify-out'
]);

export type ProjectScan = {
	name?: string;
	version?: string;
	description?: string;
	entryPoint?: string;
	scripts: string[];
	dependencies: string[];
	topLevelFolders: string[];
};

const readPackageJson = (root: string): Record<string, unknown> | undefined => {
	try {
		return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	} catch {
		return undefined;
	}
};

const objectKeys = (value: unknown): string[] => {
	return value && typeof value === 'object' ? Object.keys(value as object) : [];
};

const listTopLevelFolders = (root: string): string[] => {
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

/** Scan the workspace into a plain data object (best-effort, never throws). */
export const scanProject = (root: string): ProjectScan => {
	const pkg = readPackageJson(root);
	const asString = (value: unknown): string | undefined =>
		typeof value === 'string' && value.trim() ? value : undefined;

	return {
		name: asString(pkg?.name),
		version: asString(pkg?.version),
		description: asString(pkg?.description),
		entryPoint: asString(pkg?.main) ?? asString(pkg?.module),
		scripts: objectKeys(pkg?.scripts),
		dependencies: objectKeys(pkg?.dependencies),
		topLevelFolders: listTopLevelFolders(root)
	};
};

const MAX_WALK = 20000;

/**
 * Newest modification time (ms) among source files under `root`, skipping
 * ignored dirs, dotfiles, and `ignoreFiles` (our own generated outputs). Pass
 * `since` to short-circuit: returns as soon as a file newer than `since` is
 * found, which keeps the "is the graph stale?" check cheap once anything has
 * changed.
 */
export const newestSourceMtime = (root: string, since = 0, ignoreFiles: Set<string> = new Set<string>()): number => {
	let newest = 0;
	let visited = 0;
	const stack: string[] = [root];

	while (stack.length) {
		const dir = stack.pop() as string;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
				continue;
			}
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
				continue;
			}
			if (!entry.isFile() || ignoreFiles.has(entry.name)) {
				continue;
			}
			if (++visited > MAX_WALK) {
				return newest;
			}
			try {
				const mtime = fs.statSync(full).mtimeMs;
				if (mtime > newest) {
					newest = mtime;
				}
				if (since && mtime > since) {
					return mtime;
				}
			} catch {
				// unreadable file — skip
			}
		}
	}

	return newest;
};
