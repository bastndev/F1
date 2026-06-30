/**
 * "My Memory" — project context engine.
 *
 * Keeps a `.f1/` folder with a cheap, structural project map and points each
 * CLI's instruction file (the AGENTS.md hub + the CLAUDE.md pointer) at it, so a
 * launched agent starts with project context instead of re-scanning the repo.
 *
 * Pure-TS and fast: a single `fs` scan, no graph build, never throws. Node-only
 * (`fs`/`path`); no `vscode`, so the host passes the workspace root in.
 *
 * This is the slim core reused by "Smart + Skills" (src/my-smart). The standalone
 * brain-button UI and the graphify graph engine were removed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MEMORY_CONFIG_FILE, MEMORY_DIR, MEMORY_MAP_FILE, RULES_FILE } from './memory-paths';
import { resolveConfig, type ResolvedConfig } from './config';
import { writeFileIfChanged } from './atomic-write';
import { writeJsonSettings } from './settings';
import { scanProject } from '../tier1-map/scan-project';
import { writeProjectMap } from '../tier1-map/write-project-map';
import { removeAllInstructionBlocks, syncInstructionFileForSlug } from '../tier1-map/sync-instructions';

export class MemoryService {
	private enabled = false;

	public isEnabled(): boolean {
		return this.enabled;
	}

	public setEnabled(value: boolean): void {
		this.enabled = value;
	}

	/**
	 * Called right before a CLI session starts. Ensures `.f1/` exists with a
	 * project map and keeps the launching CLI's instructions file pointed at it.
	 * Cheap, pure-TS, never throws — so it can't block the launch.
	 */
	public onLaunch(root: string | undefined, slug: string | undefined): void {
		if (!this.enabled || !root) {
			return;
		}
		try {
			const config = resolveConfig(root);
			this.ensureConfig(root, config);
			const mapPath = path.join(root, MEMORY_DIR, MEMORY_MAP_FILE);
			if (!fs.existsSync(mapPath)) {
				writeProjectMap(root, scanProject(root, config.ignoreDirs));
			}
			syncInstructionFileForSlug(root, slug);
		} catch (error) {
			console.error('[my-memory] onLaunch failed:', error);
		}
	}

	/** Write the built-in rules file into `.f1/` (atomic, idempotent; ensures the dir). */
	public writeRules(root: string | undefined, content: string): boolean {
		if (!root || !content) {
			return false;
		}
		try {
			return writeFileIfChanged(path.join(root, MEMORY_DIR, RULES_FILE), content);
		} catch (error) {
			console.error('[my-memory] writeRules failed:', error);
			return false;
		}
	}

	/**
	 * Delete `.f1/` and strip the managed blocks from the instruction files
	 * (the AGENTS.md hub + the CLAUDE.md pointer), restoring the user's own
	 * content. Never touches anything but the block we wrote.
	 */
	public cleanup(root: string | undefined): string[] {
		if (!root) {
			return [];
		}
		const cleaned: string[] = [];

		try {
			const dirPath = path.join(root, MEMORY_DIR);
			if (fs.existsSync(dirPath)) {
				fs.rmSync(dirPath, { recursive: true, force: true });
				cleaned.push(MEMORY_DIR);
			}
		} catch (error) {
			console.error(`[my-memory] cleanup ${MEMORY_DIR} failed:`, error);
		}

		cleaned.push(...removeAllInstructionBlocks(root));
		return cleaned;
	}

	/** Create `.f1/` + `memory.json` if missing (idempotent). */
	private ensureConfig(root: string, config: ResolvedConfig): void {
		const dir = path.join(root, MEMORY_DIR);
		fs.mkdirSync(dir, { recursive: true });

		const configPath = path.join(dir, MEMORY_CONFIG_FILE);
		if (!fs.existsSync(configPath)) {
			writeJsonSettings(configPath, {
				version: 1,
				mode: config.mode,
				createdAt: new Date().toISOString(),
				note: 'F1 project context (generated). Managed by F1.'
			});
		}
	}
}
