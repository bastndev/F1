/**
 * Detect and install the optional "graphify" toolchain (Tier 2 engine).
 *
 * Pure Node — `child_process` + `fs`, no `vscode`. A VS Code extension can't
 * bundle Python, so graphify lives on the user's machine. We bootstrap it with
 * `uv` (a single self-contained binary that can provision Python *and* install
 * the package), once per machine. Code-only extraction is local and free.
 *
 * Fresh installs land in ~/.local/bin, which won't be on the current process
 * PATH until the shell reloads — so we always look beyond PATH and, as a last
 * resort, run graphify through `uv tool run`.
 */

import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const isWindows = process.platform === 'win32';

export type ProgressFn = (message: string) => void;

export type ToolchainStatus = {
	hasUv: boolean;
	hasGraphify: boolean;
	uvPath?: string;
	graphifyPath?: string;
};

/** Directories where uv/graphify land that may not be on PATH yet. */
const userBinDirs = (): string[] => {
	const home = os.homedir();
	if (isWindows) {
		const dirs = [path.join(home, '.local', 'bin')];
		if (process.env.APPDATA) {
			dirs.push(path.join(process.env.APPDATA, 'uv'));
		}
		return dirs;
	}
	return [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin')];
};

const exeName = (name: string): string => (isWindows ? `${name}.exe` : name);

/** Resolve an executable on PATH or in the known user bin dirs. */
export const findExecutable = (name: string): string | undefined => {
	const probe = spawnSync(isWindows ? 'where' : 'which', [name], { encoding: 'utf8' });
	if (probe.status === 0) {
		const first = probe.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
		if (first && fs.existsSync(first)) {
			return first;
		}
	}
	for (const dir of userBinDirs()) {
		const full = path.join(dir, exeName(name));
		if (fs.existsSync(full)) {
			return full;
		}
	}
	return undefined;
};

/** True if `graphifyy` is installed as a uv tool (covers the not-on-PATH case). */
const uvToolHasGraphify = (uvPath: string): boolean => {
	const res = spawnSync(uvPath, ['tool', 'list'], { encoding: 'utf8' });
	return res.status === 0 && /graphify/i.test(res.stdout || '');
};

export const detectToolchain = (): ToolchainStatus => {
	const uvPath = findExecutable('uv');
	const graphifyPath = findExecutable('graphify');
	const hasGraphify = Boolean(graphifyPath) || (Boolean(uvPath) && uvToolHasGraphify(uvPath as string));
	return { hasUv: Boolean(uvPath), hasGraphify, uvPath, graphifyPath };
};

/** Spawn a command, streaming output to `onProgress`, rejecting on non-zero exit. */
export const run = (
	cmd: string,
	args: string[],
	opts: { cwd?: string; onProgress?: ProgressFn } = {}
): Promise<void> => {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
		let stderr = '';
		const pump = (chunk: Buffer) => {
			const text = chunk.toString().trim();
			if (text) {
				opts.onProgress?.(text.split(/\r?\n/).pop() || text);
			}
		};
		child.stdout?.on('data', pump);
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
			pump(chunk);
		});
		child.on('error', (err) => reject(err));
		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${path.basename(cmd)} exited with code ${code}${stderr ? `: ${stderr.trim().slice(-300)}` : ''}`));
			}
		});
	});
};

/** Download + run uv's official installer for this platform. */
const installUv = async (onProgress?: ProgressFn): Promise<void> => {
	onProgress?.('Installing uv…');
	if (isWindows) {
		await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'], { onProgress });
	} else {
		await run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { onProgress });
	}
};

/** Ensure uv (if missing) then graphify are installed. Throws on failure. */
export const installToolchain = async (onProgress?: ProgressFn): Promise<ToolchainStatus> => {
	let status = detectToolchain();

	if (!status.hasUv) {
		await installUv(onProgress);
		status = detectToolchain();
		if (!status.uvPath) {
			throw new Error('uv was installed but could not be located. You may need to restart your terminal.');
		}
	}

	if (!status.hasGraphify) {
		onProgress?.('Installing graphify…');
		await run(status.uvPath as string, ['tool', 'install', 'graphifyy'], { onProgress });
		status = detectToolchain();
		if (!status.hasGraphify) {
			throw new Error('graphify was installed but could not be located.');
		}
	}

	return status;
};

/** How to invoke graphify: directly if on PATH, else through `uv tool run`. */
export const resolveGraphifyInvocation = (status: ToolchainStatus): { cmd: string; prefix: string[] } => {
	if (status.graphifyPath) {
		return { cmd: status.graphifyPath, prefix: [] };
	}
	if (status.uvPath) {
		return { cmd: status.uvPath, prefix: ['tool', 'run', '--from', 'graphifyy', 'graphify'] };
	}
	return { cmd: exeName('graphify'), prefix: [] };
};
