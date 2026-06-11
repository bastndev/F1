/**
 * Spanish text-to-speech for the Translator modal, powered by Piper.
 *
 * F1 complements the ATM extension (same publisher): both keep the Piper
 * engine and voice models inside their globalStorage folder. Resources are
 * resolved ATM-first — if ATM already downloaded the engine or the Spanish
 * voice (…/globalStorage/bastndev.atm), F1 reuses those files and downloads
 * nothing. Only what is missing in BOTH extensions is downloaded into F1's
 * own storage, behind a VS Code progress notification (same UX as ATM).
 *
 * Adapted from ATM's voice-tts module (voice-tts/core). Spanish only for
 * now; future voices will mirror whatever ATM ships.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn, execFile, type ChildProcess } from 'child_process';

const VOICE_ID = 'es_ES-sharvard-medium';
const VOICE_DOWNLOAD_BASE =
	'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium/';
const PIPER_RELEASE_BASE =
	'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const ATM_STORAGE_DIR = 'bastndev.atm';

export type VoiceResources = {
	piperPath: string;
	modelPath: string;
};

/* ── Paths & shared-storage resolution ───────────────────────────── */

type PiperPlatform = {
	archiveUrl: string;
	dirName: string;
	isTarGz: boolean;
};

function getPiperPlatform(): PiperPlatform {
	const platform = process.platform;
	const arch = process.arch;

	switch (platform) {
		case 'win32':
			return { archiveUrl: `${PIPER_RELEASE_BASE}/piper_windows_amd64.zip`, dirName: 'windows_amd64', isTarGz: false };
		case 'darwin':
			return arch === 'arm64'
				? { archiveUrl: `${PIPER_RELEASE_BASE}/piper_macos_aarch64.tar.gz`, dirName: 'macos_aarch64', isTarGz: true }
				: { archiveUrl: `${PIPER_RELEASE_BASE}/piper_macos_x64.tar.gz`, dirName: 'macos_x64', isTarGz: true };
		case 'linux':
			if (arch === 'arm64') {
				return { archiveUrl: `${PIPER_RELEASE_BASE}/piper_linux_aarch64.tar.gz`, dirName: 'linux_aarch64', isTarGz: true };
			}
			if (arch === 'arm') {
				return { archiveUrl: `${PIPER_RELEASE_BASE}/piper_linux_armv7l.tar.gz`, dirName: 'linux_armv7l', isTarGz: true };
			}
			return { archiveUrl: `${PIPER_RELEASE_BASE}/piper_linux_x86_64.tar.gz`, dirName: 'linux_x86_64', isTarGz: true };
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}
}

function piperBinaryPath(storageBase: string): string {
	const binary = process.platform === 'win32' ? 'piper.exe' : 'piper';
	return path.join(storageBase, 'piper', getPiperPlatform().dirName, binary);
}

function voiceFilePaths(storageBase: string): { modelPath: string; configPath: string } {
	const voicesDir = path.join(storageBase, 'voices');
	return {
		modelPath: path.join(voicesDir, `${VOICE_ID}.onnx`),
		configPath: path.join(voicesDir, `${VOICE_ID}.onnx.json`),
	};
}

/** Storage folders to search, ATM first so existing downloads are reused. */
function storageBases(context: vscode.ExtensionContext): string[] {
	const own = context.globalStorageUri.fsPath;
	const atm = path.join(path.dirname(own), ATM_STORAGE_DIR);
	return [atm, own];
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function findExistingPiper(context: vscode.ExtensionContext): Promise<string | null> {
	for (const base of storageBases(context)) {
		const candidate = piperBinaryPath(base);
		if (await fileExists(candidate)) {
			return candidate;
		}
	}
	return null;
}

async function findExistingVoice(context: vscode.ExtensionContext): Promise<string | null> {
	for (const base of storageBases(context)) {
		const { modelPath, configPath } = voiceFilePaths(base);
		if (await fileExists(modelPath) && await fileExists(configPath)) {
			return modelPath;
		}
	}
	return null;
}

/* ── Setup: download whatever is missing in both extensions ──────── */

let setupInFlight: Promise<VoiceResources> | null = null;

export async function ensureSpanishVoice(context: vscode.ExtensionContext): Promise<VoiceResources> {
	const piperPath = await findExistingPiper(context);
	const modelPath = await findExistingVoice(context);
	if (piperPath && modelPath) {
		return { piperPath, modelPath };
	}

	// A download may already be running (e.g. double click) — share it.
	setupInFlight ??= downloadMissingResources(context, piperPath, modelPath)
		.finally(() => {
			setupInFlight = null;
		});
	return setupInFlight;
}

async function downloadMissingResources(
	context: vscode.ExtensionContext,
	existingPiper: string | null,
	existingModel: string | null,
): Promise<VoiceResources> {
	const own = context.globalStorageUri.fsPath;
	await fs.promises.mkdir(own, { recursive: true });

	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'F1 Translator — Voice setup',
			cancellable: false,
		},
		async (progress) => {
			let piperPath = existingPiper;
			if (!piperPath) {
				piperPath = piperBinaryPath(own);
				progress.report({ message: 'Installing Piper TTS engine (first time only)…' });
				await installPiper(path.join(own, 'piper'), piperPath, progress);
			}

			let modelPath = existingModel;
			if (!modelPath) {
				const target = voiceFilePaths(own);
				progress.report({ message: 'Downloading Spanish voice… 0%' });
				await downloadFile(`${VOICE_DOWNLOAD_BASE}${VOICE_ID}.onnx`, target.modelPath, (p) => {
					const pct = p.percentage ?? 0;
					progress.report({ message: `Downloading Spanish voice… ${pct}% (${formatBytes(p.bytesDownloaded)})` });
				});
				progress.report({ message: 'Downloading voice config…' });
				await downloadFile(`${VOICE_DOWNLOAD_BASE}${VOICE_ID}.onnx.json`, target.configPath);
				modelPath = target.modelPath;
			}

			progress.report({ message: 'Voice ready!' });
			return { piperPath, modelPath };
		},
	);
}

/* ── Download helpers (from ATM's installer) ─────────────────────── */

type DownloadProgress = {
	bytesDownloaded: number;
	totalBytes: number | null;
	percentage: number | null;
};

function downloadFile(
	url: string,
	destination: string,
	onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
	const protocol = url.startsWith('https') ? https : http;

	return fs.promises.mkdir(path.dirname(destination), { recursive: true })
		.then(() => fs.promises.unlink(destination).catch(() => undefined))
		.then(() => new Promise<void>((resolve, reject) => {
			const file = fs.createWriteStream(destination, { flags: 'wx' });

			const fail = (err: Error) => {
				file.close();
				fs.promises.unlink(destination).catch(() => undefined);
				reject(err);
			};

			const request = protocol.get(url, (response) => {
				const status = response.statusCode ?? 0;
				if (status === 301 || status === 302 || status === 307) {
					if (response.headers.location) {
						file.close();
						fs.promises.unlink(destination).catch(() => undefined);
						downloadFile(new URL(response.headers.location, url).toString(), destination, onProgress)
							.then(resolve, reject);
						return;
					}
				}

				if (status !== 200) {
					fail(new Error(`Failed to download file: ${status} ${response.statusMessage}`));
					return;
				}

				const totalBytes = response.headers['content-length']
					? parseInt(response.headers['content-length'], 10)
					: null;
				let bytesDownloaded = 0;

				response.on('data', (chunk: Buffer) => {
					bytesDownloaded += chunk.length;
					onProgress?.({
						bytesDownloaded,
						totalBytes,
						percentage: totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : null,
					});
				});

				response.pipe(file);

				file.on('finish', () => {
					file.close();
					fs.promises.stat(destination)
						.then((stats) => {
							if (stats.size === 0) {
								reject(new Error(`Downloaded file is empty: ${destination}`));
							} else {
								resolve();
							}
						})
						.catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
				});
			});

			request.on('error', fail);
			file.on('error', fail);
		}));
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Piper engine install (from ATM's installer) ─────────────────── */

async function installPiper(
	piperDir: string,
	piperPath: string,
	progress: vscode.Progress<{ message?: string }>,
): Promise<void> {
	const info = getPiperPlatform();
	const targetDir = path.join(piperDir, info.dirName);
	const tempFile = path.join(os.tmpdir(), info.isTarGz ? 'f1-piper-download.tar.gz' : 'f1-piper-download.zip');

	await fs.promises.mkdir(piperDir, { recursive: true });

	try {
		await downloadFile(info.archiveUrl, tempFile, (p) => {
			progress.report({ message: `Downloading Piper engine… ${p.percentage ?? 0}% (${formatBytes(p.bytesDownloaded)})` });
		});

		progress.report({ message: 'Extracting Piper engine…' });
		await extractArchive(tempFile, piperDir, info.dirName, info.isTarGz);

		if (process.platform === 'linux' || process.platform === 'darwin') {
			await setExecutablePermissions(targetDir);
		}
		if (process.platform === 'linux') {
			await fixSymlinks(targetDir);
		}

		if (!(await fileExists(piperPath))) {
			throw new Error(`Piper binary not found after extraction at: ${piperPath}`);
		}
	} finally {
		await fs.promises.unlink(tempFile).catch(() => undefined);
	}
}

async function extractArchive(
	archivePath: string,
	outputDir: string,
	targetDirName: string,
	isTarGz: boolean,
): Promise<void> {
	const tempExtractDir = path.join(outputDir, '_temp_extract');
	await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
	await fs.promises.mkdir(tempExtractDir, { recursive: true });

	const command = isTarGz
		? { cmd: 'tar', args: ['xzf', archivePath, '-C', tempExtractDir] }
		: {
			cmd: 'powershell.exe',
			args: [
				'-NoProfile',
				'-Command',
				`Expand-Archive -Path '${archivePath}' -DestinationPath '${tempExtractDir}' -Force`,
			],
		};

	try {
		await new Promise<void>((resolve, reject) => {
			execFile(command.cmd, command.args, (error) => {
				if (error) {
					reject(new Error(`Failed to extract archive: ${error.message}`));
				} else {
					resolve();
				}
			});
		});

		// Archives nest the binaries inside a "piper/" folder; flatten it.
		const extractedPiperDir = path.join(tempExtractDir, 'piper');
		const finalDir = path.join(outputDir, targetDirName);
		await fs.promises.rm(finalDir, { recursive: true, force: true }).catch(() => undefined);

		if (await fileExists(extractedPiperDir)) {
			await fs.promises.rename(extractedPiperDir, finalDir);
			await fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
		} else {
			await fs.promises.rename(tempExtractDir, finalDir);
		}
	} catch (error) {
		await fs.promises.rm(tempExtractDir, { recursive: true, force: true }).catch(() => undefined);
		throw error;
	}
}

async function setExecutablePermissions(dir: string): Promise<void> {
	try {
		const files = await fs.promises.readdir(dir);
		for (const file of files) {
			const filePath = path.join(dir, file);
			const stat = await fs.promises.stat(filePath);
			if (!stat.isFile()) {
				continue;
			}
			const name = file.toLowerCase();
			if (
				name === 'piper'
				|| name === 'espeak-ng'
				|| name === 'piper_phonemize'
				|| name.endsWith('.so')
				|| name.includes('.so.')
			) {
				await fs.promises.chmod(filePath, 0o755);
			}
		}
	} catch (error) {
		console.error('[f1-voice] Error setting permissions:', error);
	}
}

// Piper's Linux archives ship versioned .so files without the unversioned
// names the binary links against.
async function fixSymlinks(binaryDir: string): Promise<void> {
	if (process.platform !== 'linux' || !(await fileExists(binaryDir))) {
		return;
	}

	const mappings = [
		{ target: 'libespeak-ng.so.1.52.0.1', link: 'libespeak-ng.so.1' },
		{ target: 'libespeak-ng.so.1', link: 'libespeak-ng.so' },
		{ target: 'libonnxruntime.so.1.14.1', link: 'libonnxruntime.so' },
		{ target: 'libpiper_phonemize.so.1.2.0', link: 'libpiper_phonemize.so.1' },
		{ target: 'libpiper_phonemize.so.1', link: 'libpiper_phonemize.so' },
	];

	for (const { target, link } of mappings) {
		const linkPath = path.join(binaryDir, link);
		try {
			if (!(await fileExists(path.join(binaryDir, target)))) {
				continue;
			}
			try {
				if (await fs.promises.readlink(linkPath) === target) {
					continue;
				}
				await fs.promises.unlink(linkPath);
			} catch {
				// Link missing or not a symlink — create it below.
			}
			await fs.promises.symlink(target, linkPath);
		} catch (error) {
			console.error(`[f1-voice] Failed to create symlink ${link} -> ${target}:`, error);
		}
	}
}

/* ── Playback (from ATM's core) ──────────────────────────────────── */

type PlaybackCommand = {
	command: string;
	args: string[];
};

function getPlaybackCommand(piperPath: string): PlaybackCommand {
	switch (process.platform) {
		case 'win32':
			return {
				command: path.join(path.dirname(piperPath), 'sox', 'play.exe'),
				args: ['-t', 'raw', '-r', '22050', '-b', '16', '-e', 'signed', '-c', '1', '-L', '-', 'remix', '1'],
			};
		case 'darwin':
			return { command: 'afplay', args: ['-'] };
		case 'linux':
			return { command: 'aplay', args: ['-r', '22050', '-f', 'S16_LE', '-t', 'raw', '-'] };
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

let piperProcess: ChildProcess | undefined;
let playerProcess: ChildProcess | undefined;
let stoppedByUser = false;

export function wasVoiceStoppedByUser(): boolean {
	return stoppedByUser;
}

export function isVoiceSpeaking(): boolean {
	return (piperProcess !== undefined && !piperProcess.killed)
		|| (playerProcess !== undefined && !playerProcess.killed);
}

export function stopVoicePlayback(): void {
	stoppedByUser = true;
	try {
		if (piperProcess && playerProcess) {
			piperProcess.stdout?.unpipe(playerProcess.stdin ?? undefined);
			playerProcess.stdin?.destroy();
		}
		if (piperProcess && !piperProcess.killed) {
			piperProcess.kill();
		}
		if (playerProcess && !playerProcess.killed) {
			playerProcess.kill();
		}
	} catch (error) {
		console.error('[f1-voice] Error stopping playback:', error);
	} finally {
		piperProcess = undefined;
		playerProcess = undefined;
	}
}

/**
 * Speaks the given text with the resolved Piper resources. Resolves when
 * playback finishes (or is stopped by the user); rejects on process errors.
 * Callers obtain `resources` via ensureSpanishVoice() first.
 *
 * `onAudioStart` fires when the first synthesized bytes reach the player —
 * i.e. when sound actually becomes audible, seconds after spawn for long
 * texts. UIs should switch to their "speaking" visuals then, not earlier.
 */
export async function playSpanishText(
	resources: VoiceResources,
	text: string,
	onAudioStart?: () => void,
): Promise<void> {
	const cleaned = text.trim();
	if (!cleaned) {
		throw new Error('No text provided');
	}

	stopVoicePlayback();

	if (!(await fileExists(resources.piperPath))) {
		throw new Error(`Piper executable not found at: ${resources.piperPath}`);
	}
	if (!(await fileExists(resources.modelPath))) {
		throw new Error('Spanish voice model not found.');
	}

	// The engine may come from ATM's storage where another process manages
	// permissions; re-asserting is idempotent and cheap.
	if (process.platform === 'linux' || process.platform === 'darwin') {
		await setExecutablePermissions(path.dirname(resources.piperPath));
		await fixSymlinks(path.dirname(resources.piperPath));
	}

	const playback = getPlaybackCommand(resources.piperPath);
	stoppedByUser = false;

	const piper = spawn(resources.piperPath, ['--model', resources.modelPath, '--output-raw'], {
		cwd: path.dirname(resources.piperPath),
		env: { ...process.env },
		windowsHide: false,
	});
	piperProcess = piper;

	const player = spawn(playback.command, playback.args);
	playerProcess = player;

	const noop = () => undefined;
	piper.stdout.on('error', noop);
	player.stdin.on('error', noop);

	piper.stdout.once('data', () => {
		if (!stoppedByUser) {
			onAudioStart?.();
		}
	});

	piper.stdout.pipe(player.stdin);
	piper.stdin.write(cleaned);
	piper.stdin.end();

	return new Promise((resolve, reject) => {
		let settled = false;
		let piperClosed = false;
		let playerClosed = false;

		const resolveOnce = () => {
			if (!settled) {
				settled = true;
				resolve();
			}
		};

		const rejectOnce = (err: unknown) => {
			if (!settled) {
				settled = true;
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		};

		const maybeFinish = () => {
			if (stoppedByUser || (piperClosed && playerClosed)) {
				resolveOnce();
			}
		};

		const onProcessError = (err: Error) => {
			if (stoppedByUser) {
				resolveOnce();
			} else {
				stopVoicePlayback();
				rejectOnce(err);
			}
		};

		piper.on('error', onProcessError);
		player.on('error', onProcessError);

		piper.on('close', (code) => {
			piperProcess = undefined;
			piperClosed = true;
			if (!stoppedByUser && code !== 0 && code !== null) {
				stopVoicePlayback();
				rejectOnce(new Error(`Piper process exited with code: ${code}`));
			} else {
				maybeFinish();
			}
		});

		player.on('close', (code) => {
			playerProcess = undefined;
			playerClosed = true;
			if (stoppedByUser || code === 0) {
				maybeFinish();
			} else {
				stopVoicePlayback();
				rejectOnce(new Error(`Player process exited with code: ${code}`));
			}
		});
	});
}
