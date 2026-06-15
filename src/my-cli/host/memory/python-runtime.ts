/**
 * Python runtime detection and installation via `uv`.
 * Handles checking if Python 3.12 exists and installing if needed.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type PythonCheckResult = {
	found: boolean;
	version?: string;
	path?: string;
	error?: string;
};

type PythonInstallResult = {
	success: boolean;
	message: string;
	error?: string;
};

const isWindows = process.platform === 'win32';
const pythonCommands = isWindows ? ['python', 'python3.12', 'python3'] : ['python3.12', 'python3', 'python'];

const execAsync = (
	command: string,
	options?: childProcess.ExecOptions
): Promise<{ stdout: string; stderr: string }> => {
	return new Promise((resolve) => {
		childProcess.exec(command, { timeout: 10000, ...options }, (error, stdout, stderr) => {
			resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
		});
	});
};

const spawnAsync = (
	command: string,
	args: string[],
	options?: childProcess.SpawnOptions
): Promise<{ code: number; stdout: string; stderr: string }> => {
	return new Promise((resolve) => {
		const proc = childProcess.spawn(command, args, {
			timeout: 60000,
			...options
		});

		let stdout = '';
		let stderr = '';

		if (proc.stdout) {proc.stdout.on('data', (data) => (stdout += data.toString()));}
		if (proc.stderr) {proc.stderr.on('data', (data) => (stderr += data.toString()));}

		proc.on('close', (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});

		proc.on('error', () => {
			resolve({ code: 1, stdout, stderr });
		});
	});
};

export class PythonRuntime {
	private pythonPath?: string;

	async checkPython(): Promise<PythonCheckResult> {
		if (this.pythonPath) {
			return { found: true, path: this.pythonPath };
		}

		for (const cmd of pythonCommands) {
			const { stdout, stderr } = await execAsync(`${cmd} --version`);
			const output = stdout || stderr;

			if (output.includes('3.12') || output.includes('3.11') || output.includes('3.10')) {
				this.pythonPath = cmd;
				const version = output.match(/(\d+\.\d+)/)?.[1] || 'unknown';
				return { found: true, version, path: cmd };
			}
		}

		return { found: false };
	}

	async installPython(): Promise<PythonInstallResult> {
		try {
			const result = await this.installVia_uv();
			if (result.success) {
				this.pythonPath = undefined;
				const check = await this.checkPython();
				if (check.found) {
					this.pythonPath = check.path;
					return { success: true, message: `Python installed: ${check.version}` };
				}
			}
			return result;
		} catch (error) {
			return {
				success: false,
				message: 'Failed to install Python',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	private async installVia_uv(): Promise<PythonInstallResult> {
		const uvCommand = isWindows ? 'uv' : 'uv';

		try {
			const result = await spawnAsync(uvCommand, ['python', 'install', '3.12']);

			if (result.code === 0) {
				return { success: true, message: 'Python 3.12 installed via uv' };
			}

			return {
				success: false,
				message: `uv install failed (code ${result.code})`,
				error: result.stderr || result.stdout
			};
		} catch (error) {
			return {
				success: false,
				message: 'Failed to run uv',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	async getPythonPath(): Promise<string | undefined> {
		if (this.pythonPath) {return this.pythonPath;}

		const check = await this.checkPython();
		return check.path;
	}
}
