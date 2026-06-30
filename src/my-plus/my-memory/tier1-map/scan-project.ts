/**
 * Tier 1 project scanner — builds a lightweight structural picture of the
 * workspace using only Node's `fs`. No Python, no AI, no network: this is the
 * "breadth" map (what exists) that always works and never costs tokens.
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_IGNORED_DIRS = [
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
];

/** Base ignores plus any extra directory names supplied via config. */
const buildIgnoredDirs = (extra?: string[]): Set<string> => {
	const ignored = new Set(BASE_IGNORED_DIRS);
	for (const name of extra ?? []) {
		if (typeof name === 'string' && name.trim()) {
			ignored.add(name.trim());
		}
	}
	return ignored;
};

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

const listTopLevelFolders = (root: string, ignored: Set<string>): string[] => {
	try {
		return fs
			.readdirSync(root, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !ignored.has(entry.name))
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
};

/**
 * Scan the workspace into a plain data object (best-effort, never throws).
 * `extraIgnoredDirs` (from the config cascade) is merged onto the base ignore set.
 */
export const scanProject = (root: string, extraIgnoredDirs?: string[]): ProjectScan => {
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
		topLevelFolders: listTopLevelFolders(root, buildIgnoredDirs(extraIgnoredDirs))
	};
};
