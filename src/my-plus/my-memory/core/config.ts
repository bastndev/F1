/**
 * Resolved configuration for "My Memory", from a 4-level cascade (highest wins):
 *
 *   1. `F1_MODE` environment variable
 *   2. `.f1/config.json` for the project (nearest, walking up to the FS root)
 *   3. `~/.config/f1/config.json` (user global; honours `XDG_CONFIG_HOME`)
 *   4. Built-in defaults
 *
 * Pure Node, no `vscode`. Best-effort — any unreadable/malformed layer is simply
 * skipped, and resolution never throws.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MEMORY_DIR, MEMORY_USER_CONFIG_FILE } from './memory-paths';
import { readJsonSettings } from './settings';

export type ResolvedConfig = {
	/** Reserved selector for future rule intensity / project variants. */
	mode: string;
	/** Extra directory names the project scanner should ignore. */
	ignoreDirs: string[];
};

type ConfigFile = {
	mode?: unknown;
	ignoreDirs?: unknown;
};

const DEFAULTS: ResolvedConfig = { mode: 'default', ignoreDirs: [] };
const MAX_WALK_UP = 64;

const asString = (value: unknown): string | undefined =>
	typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asStringArray = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
		: [];

const userConfigPath = (): string => {
	const base = asString(process.env.XDG_CONFIG_HOME) ?? path.join(os.homedir(), '.config');
	return path.join(base, 'f1', 'config.json');
};

/** Nearest `.f1/config.json` walking up from `root`, or undefined if none. */
const findProjectConfigPath = (root: string): string | undefined => {
	let current = path.resolve(root);
	for (let depth = 0; depth < MAX_WALK_UP; depth += 1) {
		const candidate = path.join(current, MEMORY_DIR, MEMORY_USER_CONFIG_FILE);
		try {
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		} catch {
			/* ignore and keep walking */
		}
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
	return undefined;
};

const readLayer = (filePath: string | undefined): ConfigFile | undefined =>
	filePath ? readJsonSettings<ConfigFile>(filePath) : undefined;

/** Resolve effective config for `root` from the cascade (best-effort). */
export const resolveConfig = (root: string | undefined): ResolvedConfig => {
	const resolved: ResolvedConfig = { mode: DEFAULTS.mode, ignoreDirs: [...DEFAULTS.ignoreDirs] };
	try {
		const user = readLayer(userConfigPath());
		const project = root ? readLayer(findProjectConfigPath(root)) : undefined;

		const ignore = new Set<string>(DEFAULTS.ignoreDirs);
		for (const dir of [...asStringArray(user?.ignoreDirs), ...asStringArray(project?.ignoreDirs)]) {
			ignore.add(dir);
		}
		resolved.ignoreDirs = [...ignore];

		resolved.mode =
			asString(process.env.F1_MODE) ?? asString(project?.mode) ?? asString(user?.mode) ?? DEFAULTS.mode;
	} catch (error) {
		console.error('[my-memory] resolveConfig failed:', error);
	}
	return resolved;
};
