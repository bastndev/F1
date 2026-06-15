/**
 * "My Memory" orchestrator (Tier 1 — pure TypeScript, no Python).
 *
 * Tier 1 keeps a committed `.f1/` folder with a lightweight project map and
 * points each CLI's instructions file at it, so a launched agent starts with
 * project context for minimal tokens instead of re-analyzing the codebase.
 *
 * Tier 2 (graphify) will later add a real dependency graph as an OPTIONAL
 * depth upgrade — this service never depends on it and never fails because of it.
 *
 * Node-only (`fs`/`path`); no `vscode`, so the host passes the workspace root in.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MEMORY_CONFIG_FILE, MEMORY_DIR, MEMORY_GRAPH_FILE, MEMORY_MAP_FILE } from './memory-paths';
import { scanProject } from '../tier1-map/scan-project';
import { writeProjectMap } from '../tier1-map/write-project-map';
import { syncAllInstructionFiles, syncInstructionFileForSlug } from '../tier1-map/sync-instructions';
import type { MemorySnapshot, MemoryBuildResult } from '../../my-cli/shared/memory-types';

export class MemoryService {
	private enabled = false;

	public isEnabled(): boolean {
		return this.enabled;
	}

	public setEnabled(value: boolean): void {
		this.enabled = value;
	}

	/** Current state of `.f1/` for the snapshot the webview button reads. */
	public getSnapshot(root: string | undefined): MemorySnapshot {
		if (!root) {
			return { enabled: this.enabled, status: 'error', error: 'No workspace open' };
		}

		const memoryDir = path.join(root, MEMORY_DIR);
		const hasDir = fs.existsSync(memoryDir);

		return {
			enabled: this.enabled,
			status: 'ready',
			projectPath: root,
			lastUpdated: hasDir ? this.getLastModified(memoryDir) : undefined,
			hasGraphJson: hasDir && fs.existsSync(path.join(memoryDir, MEMORY_GRAPH_FILE)),
			projectMapMd: hasDir && fs.existsSync(path.join(memoryDir, MEMORY_MAP_FILE))
		};
	}

	/**
	 * Build `.f1/` if absent (config + map) and sync every instruction file.
	 * Called when the toggle flips ON — never overwrites an existing map.
	 */
	public ensureForWorkspace(root: string | undefined): void {
		if (!this.enabled || !root) {
			return;
		}
		try {
			this.ensureConfig(root);
			const mapPath = path.join(root, MEMORY_DIR, MEMORY_MAP_FILE);
			if (!fs.existsSync(mapPath)) {
				writeProjectMap(root, scanProject(root));
			}
			syncAllInstructionFiles(root);
		} catch (error) {
			console.error('[my-memory] ensureForWorkspace failed:', error);
		}
	}

	/**
	 * Called right before a CLI session starts. Ensures `.f1/` exists and points
	 * the launching CLI's instructions file at the map. Never throws — a memory
	 * failure must not block launching the CLI.
	 */
	public onLaunch(root: string | undefined, slug: string | undefined): void {
		if (!this.enabled || !root) {
			return;
		}
		try {
			this.ensureConfig(root);
			const mapPath = path.join(root, MEMORY_DIR, MEMORY_MAP_FILE);
			if (!fs.existsSync(mapPath)) {
				writeProjectMap(root, scanProject(root));
			}
			syncInstructionFileForSlug(root, slug);
		} catch (error) {
			console.error('[my-memory] onLaunch failed:', error);
		}
	}

	/**
	 * Full refresh triggered by the brain button: re-scan the project, rewrite
	 * the map, and re-sync all instruction files. Pure TypeScript — always
	 * succeeds (best-effort), so the button never gets stuck.
	 */
	public rebuild(root: string | undefined): MemoryBuildResult {
		const startTime = Date.now();

		if (!root) {
			return { success: false, message: 'Open a folder to build project memory.' };
		}

		try {
			this.ensureConfig(root);
			writeProjectMap(root, scanProject(root));
			const filesUpdated = syncAllInstructionFiles(root);

			return {
				success: true,
				message: 'Memory updated',
				durationMs: Date.now() - startTime,
				projectMapEnriched: true,
				graphJsonCreated: false,
				filesUpdated
			};
		} catch (error) {
			return {
				success: false,
				message: 'Rebuild failed',
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime
			};
		}
	}

	/** Create `.f1/` + `memory.json` if missing (idempotent). */
	private ensureConfig(root: string): void {
		const dir = path.join(root, MEMORY_DIR);
		fs.mkdirSync(dir, { recursive: true });

		const configPath = path.join(dir, MEMORY_CONFIG_FILE);
		if (!fs.existsSync(configPath)) {
			const config = {
				version: 1,
				createdAt: new Date().toISOString(),
				note: 'F1 "My Memory" project context. Commit this folder so contributors share it.'
			};
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
		}
	}

	private getLastModified(dir: string): number {
		try {
			return fs.statSync(dir).mtimeMs;
		} catch {
			return 0;
		}
	}
}
