/**
 * "My Memory" orchestrator.
 *
 * Keeps a committed `.f1/` folder with project context and points each CLI's
 * instructions file at it, so a launched agent starts with project context for
 * minimal tokens instead of re-analyzing the codebase.
 *
 * The content engine is **graphify** (Tier 2): a real, local, free code graph.
 * The pure-TS wiring (Tier 1) owns `.f1/`, writes the human-readable map, and
 * syncs the instruction files — graphify can't do that. They work together.
 *
 * Node-only (`fs`/`path`/`child_process`); no `vscode`, so the host passes the
 * workspace root in and drives all UI (notifications, progress).
 */

import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_FILE, GRAPHIFY_IGNORE_COMMENT, GRAPHIFY_OUT_DIR, HUB_FILE, MEMORY_CONFIG_FILE, MEMORY_DIR, MEMORY_GRAPH_FILE, MEMORY_MAP_FILE } from './memory-paths';
import { newestSourceMtime, scanProject } from '../tier1-map/scan-project';
import { writeProjectMap } from '../tier1-map/write-project-map';
import { removeAllInstructionBlocks, syncAllInstructionFiles, syncInstructionFileForSlug } from '../tier1-map/sync-instructions';
import { detectToolchain, installToolchain, type ProgressFn, type ToolchainStatus } from '../tier2-graph/toolchain';
import { ensureGraphifyOutIgnored, runGraphify } from '../tier2-graph/graphify-runner';
import type { MemorySnapshot, MemoryBuildResult } from '../memory-types';

export class MemoryService {
	private enabled = false;

	public isEnabled(): boolean {
		return this.enabled;
	}

	public setEnabled(value: boolean): void {
		this.enabled = value;
	}

	/** Is the graphify toolchain already installed on this machine? */
	public hasToolchain(): boolean {
		return detectToolchain().hasGraphify;
	}

	public detectToolchain(): ToolchainStatus {
		return detectToolchain();
	}

	/** Install uv (if needed) + graphify. Throws on failure (host shows it). */
	public async installToolchain(onProgress?: ProgressFn): Promise<void> {
		await installToolchain(onProgress);
	}

	/** Current state of `.f1/` for the snapshot the webview button reads. */
	public getSnapshot(root: string | undefined): MemorySnapshot {
		if (!root) {
			return { enabled: this.enabled, status: 'error', error: 'No workspace open' };
		}

		const memoryDir = path.join(root, MEMORY_DIR);
		const hasDir = fs.existsSync(memoryDir);
		const hasGraphify = this.hasToolchain();
		const projectMapMd = hasDir && fs.existsSync(path.join(memoryDir, MEMORY_MAP_FILE));
		const graphPath = path.join(memoryDir, MEMORY_GRAPH_FILE);
		const hasGraphJson = hasDir && fs.existsSync(graphPath);

		let status: MemorySnapshot['status'];
		if (!hasGraphify) {
			status = 'missing-toolchain';
		} else if (hasDir && projectMapMd) {
			status = 'ready';
		} else {
			status = 'error';
		}

		return {
			enabled: this.enabled,
			status,
			projectPath: root,
			lastUpdated: hasDir ? this.getLastModified(memoryDir) : undefined,
			hasGraphJson,
			projectMapMd,
			hasGraphify,
			stale: hasGraphJson ? this.isStale(root, graphPath) : false
		};
	}

	/**
	 * Called right before a CLI session starts. Keeps the launching CLI's
	 * instructions file pointed at `.f1/` (cheap, pure-TS — never runs graphify,
	 * so it can't block the launch). Never throws.
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
	 * Full build, triggered by the toggle turning on or the brain button: run
	 * graphify, copy its graph into `.f1/`, rewrite the map, and re-sync the
	 * instruction files. Assumes the toolchain is present (the host installs it
	 * first); always an authoritative `--force` rebuild of the code graph.
	 */
	public async rebuild(
		root: string | undefined,
		options: { onProgress?: ProgressFn } = {}
	): Promise<MemoryBuildResult> {
		const startTime = Date.now();

		if (!root) {
			return { success: false, message: 'Open a folder to build project memory.' };
		}

		try {
			this.ensureConfig(root);
			ensureGraphifyOutIgnored(root);

			let graphJsonCreated = false;
			try {
				const graph = await runGraphify(root, { onProgress: options.onProgress });
				graphJsonCreated = graph.graphJsonCreated;
			} catch (graphError) {
				// graphify is installed but extraction failed. Keep the wiring valid
				// (write a map + sync) so the instruction files don't dangle, and
				// surface the failure to the host for a notification.
				writeProjectMap(root, scanProject(root), { hasGraph: false });
				const filesUpdated = syncAllInstructionFiles(root);
				return {
					success: false,
					message: 'Graph build failed',
					error: graphError instanceof Error ? graphError.message : String(graphError),
					durationMs: Date.now() - startTime,
					filesUpdated
				};
			}

			options.onProgress?.('Writing project map…');
			writeProjectMap(root, scanProject(root), { hasGraph: graphJsonCreated });
			const filesUpdated = syncAllInstructionFiles(root);
			this.markBuilt(root);

			return {
				success: true,
				message: 'Memory updated',
				durationMs: Date.now() - startTime,
				projectMapEnriched: true,
				graphJsonCreated,
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

	/**
	 * Full cleanup: delete `.f1/`, `graphify-out/`, strip managed blocks from
	 * instruction files (deleting them if empty), and remove our `.gitignore` entry.
	 * Called when the user turns the toggle OFF.
	 */
	public cleanup(root: string | undefined): string[] {
		if (!root) {
			return [];
		}
		const cleaned: string[] = [];

		for (const dir of [MEMORY_DIR, GRAPHIFY_OUT_DIR]) {
			try {
				const dirPath = path.join(root, dir);
				if (fs.existsSync(dirPath)) {
					fs.rmSync(dirPath, { recursive: true, force: true });
					cleaned.push(dir);
				}
			} catch (error) {
				console.error(`[my-memory] cleanup ${dir} failed:`, error);
			}
		}

		this.removeGitignoreEntry(root);
		cleaned.push(...removeAllInstructionBlocks(root));
		return cleaned;
	}

	private removeGitignoreEntry(root: string): void {
		try {
			const gitignorePath = path.join(root, '.gitignore');
			if (!fs.existsSync(gitignorePath)) {
				return;
			}
			const content = fs.readFileSync(gitignorePath, 'utf8');
			const lines = content.split('\n');
			const filtered = lines.filter(line => {
				const trimmed = line.trim();
				if (trimmed === GRAPHIFY_IGNORE_COMMENT) {
					return false;
				}
				const normalized = trimmed.replace(/^\//, '').replace(/\/$/, '');
				return normalized !== GRAPHIFY_OUT_DIR;
			});
			const cleaned = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
			if (cleaned) {
				fs.writeFileSync(gitignorePath, cleaned + '\n', 'utf8');
			} else {
				fs.unlinkSync(gitignorePath);
			}
		} catch (error) {
			console.error('[my-memory] removeGitignoreEntry failed:', error);
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

	/** True if any source file changed since the last successful build. */
	private isStale(root: string, graphPath: string): boolean {
		let reference = this.readLastBuilt(root);
		if (!reference) {
			try {
				reference = fs.statSync(graphPath).mtimeMs;
			} catch {
				return false;
			}
		}
		// Our own generated wiring files aren't "source" — ignore them.
		const ignore = new Set<string>([HUB_FILE, CLAUDE_FILE]);
		return newestSourceMtime(root, reference, ignore) > reference;
	}

	/** Record the build time in memory.json so staleness survives reloads. */
	private markBuilt(root: string): void {
		try {
			const configPath = path.join(root, MEMORY_DIR, MEMORY_CONFIG_FILE);
			let config: Record<string, unknown> = {};
			try {
				config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
			} catch {
				config = {};
			}
			config.lastBuilt = Date.now();
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
		} catch {
			// best-effort
		}
	}

	private readLastBuilt(root: string): number {
		try {
			const config = JSON.parse(fs.readFileSync(path.join(root, MEMORY_DIR, MEMORY_CONFIG_FILE), 'utf8'));
			return typeof config.lastBuilt === 'number' ? config.lastBuilt : 0;
		} catch {
			return 0;
		}
	}
}
