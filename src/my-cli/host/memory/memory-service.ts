/**
 * "My Memory" service (Phase 2) — project context management.
 * Orchestrates Python detection, graphify builds, and instructions file syncing.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PythonRuntime } from './python-runtime';
import { GraphBuilder } from './graph-builder';
import type { MemorySnapshot, MemoryBuildResult } from '../../shared/memory-types';

const MEMORY_DIR = '.f1';
const MEMORY_CONFIG_FILE = 'memory.json';
const MEMORY_MAP_FILE = 'project-map.md';

const BLOCK_START = '<!-- F1-MEMORY:START -->';
const BLOCK_END = '<!-- F1-MEMORY:END -->';

const memoryInstructionFileBySlug: Record<string, string> = {
	claude: 'CLAUDE.md',
	codex: 'AGENTS.md',
	opencode: 'AGENTS.md',
	kiro: 'AGENTS.md',
	cursor: 'AGENTS.md',
	antigravity: 'AGENTS.md',
	kilocode: 'AGENTS.md',
	grok: 'AGENTS.md',
	copilot: '.github/copilot-instructions.md'
};

const memoryInstructionFileForSlug = (slug: string | undefined): string => {
	return slug && memoryInstructionFileBySlug[slug] ? memoryInstructionFileBySlug[slug] : 'AGENTS.md';
};

export class MemoryService {
	private enabled = false;
	private pythonRuntime: PythonRuntime;
	private graphBuilder: GraphBuilder;
	private buildInProgress = false;

	constructor() {
		this.pythonRuntime = new PythonRuntime();
		this.graphBuilder = new GraphBuilder();
	}

	public isEnabled(): boolean {
		return this.enabled;
	}

	public setEnabled(value: boolean): void {
		this.enabled = value;
	}

	public async getSnapshot(workspaceRoot: string): Promise<MemorySnapshot> {
		const memoryDir = path.join(workspaceRoot, MEMORY_DIR);
		const hasMemoryDir = fs.existsSync(memoryDir);
		const hasGraphJson = hasMemoryDir && fs.existsSync(path.join(memoryDir, 'graph.json'));
		const hasProjectMap = hasMemoryDir && fs.existsSync(path.join(memoryDir, MEMORY_MAP_FILE));

		const pythonCheck = await this.pythonRuntime.checkPython();

		let status: 'ready' | 'building' | 'missing-python' | 'error' = 'ready';
		if (this.buildInProgress) {
			status = 'building';
		} else if (!pythonCheck.found && !hasGraphJson) {
			status = 'missing-python';
		}

		return {
			enabled: this.enabled,
			status,
			lastUpdated: hasMemoryDir ? this.getLastModified(memoryDir) : undefined,
			projectPath: workspaceRoot,
			hasGraphJson,
			projectMapMd: hasProjectMap
		};
	}

	public async rebuild(workspaceRoot: string, installPython = false): Promise<MemoryBuildResult> {
		if (this.buildInProgress) {
			return {
				success: false,
				message: 'Build already in progress'
			};
		}

		this.buildInProgress = true;
		const startTime = Date.now();

		try {
			const memoryDir = path.join(workspaceRoot, MEMORY_DIR);
			if (!fs.existsSync(memoryDir)) {
				fs.mkdirSync(memoryDir, { recursive: true });
			}

			const configPath = path.join(memoryDir, MEMORY_CONFIG_FILE);
			if (!fs.existsSync(configPath)) {
				const config = {
					version: 1,
					createdAt: new Date().toISOString(),
					note: 'F1 "My Memory" project context. Commit this folder to share with your team.'
				};
				fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
			}

			let pythonPath = await this.pythonRuntime.getPythonPath();

			if (!pythonPath) {
				if (!installPython) {
					return {
						success: false,
						message: 'Python 3.12 not found',
						error: 'Python required to build graph'
					};
				}

				const installResult = await this.pythonRuntime.installPython();
				if (!installResult.success) {
					return {
						success: false,
						message: 'Failed to install Python',
						error: installResult.error
					};
				}

				pythonPath = await this.pythonRuntime.getPythonPath();
				if (!pythonPath) {
					return {
						success: false,
						message: 'Python installation failed',
						error: 'Could not locate Python after install'
					};
				}
			}

			const buildResult = await this.graphBuilder.buildGraph(pythonPath, workspaceRoot);

			if (!buildResult.success) {
				return {
					success: false,
					message: 'Graph build failed',
					error: buildResult.error,
					durationMs: buildResult.durationMs
				};
			}

			const mapPath = this.graphBuilder.enrichProjectMap(workspaceRoot, buildResult.graphData);

			const filesUpdated = this.syncInstructionFiles(workspaceRoot);

			const durationMs = Date.now() - startTime;

			return {
				success: true,
				message: 'Memory updated successfully',
				durationMs,
				graphJsonCreated: buildResult.graphJsonPath !== undefined,
				projectMapEnriched: true,
				filesUpdated
			};
		} catch (error) {
			return {
				success: false,
				message: 'Rebuild failed',
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - startTime
			};
		} finally {
			this.buildInProgress = false;
		}
	}

	private syncInstructionFiles(workspaceRoot: string): string[] {
		const updated: string[] = [];

		const instructionFiles = Object.values(memoryInstructionFileBySlug);
		const uniqueFiles = Array.from(new Set(instructionFiles));

		for (const relFile of uniqueFiles) {
			try {
				const filePath = path.join(workspaceRoot, relFile);
				fs.mkdirSync(path.dirname(filePath), { recursive: true });

				const block = [
					BLOCK_START,
					'## Project context (F1 My Memory)',
					'',
					`This project ships a prebuilt context map at \`./${MEMORY_DIR}/${MEMORY_MAP_FILE}\`.`,
					'Read it first to understand the structure before scanning files — it saves tokens.',
					BLOCK_END
				].join('\n');

				let content = '';
				if (fs.existsSync(filePath)) {
					content = fs.readFileSync(filePath, 'utf8');
				}

				const start = content.indexOf(BLOCK_START);
				const end = content.indexOf(BLOCK_END);

				if (start !== -1 && end !== -1) {
					content = content.slice(0, start) + block + content.slice(end + BLOCK_END.length);
				} else {
					content = content.trim().length ? `${content.trimEnd()}\n\n${block}\n` : `${block}\n`;
				}

				fs.writeFileSync(filePath, content, 'utf8');
				updated.push(relFile);
			} catch (error) {
				console.error(`[memory-service] Failed to sync ${relFile}:`, error);
			}
		}

		return updated;
	}

	private getLastModified(dir: string): number {
		try {
			const stat = fs.statSync(dir);
			return stat.mtimeMs;
		} catch {
			return 0;
		}
	}
}
