/**
 * Multi-language text-to-speech for the Translator modal, powered by Piper.
 *
 * F1 complements the ATM extension (same publisher): both keep the Piper
 * engine and voice models inside their globalStorage folder. Resources are
 * resolved ATM-first — if ATM already downloaded the engine or a voice
 * (…/globalStorage/bastndev.atm), F1 reuses those files and downloads
 * nothing. Only what is missing in BOTH extensions is downloaded into F1's
 * own storage, behind a VS Code progress notification (same UX as ATM).
 *
 * Adapted from ATM's voice-tts module. One voice per supported language
 * (en/es/zh/pt), mirroring ATM's "best" medium voice for each — same voice ids
 * and on-disk layout, so ATM's downloads are reused as-is. The engine is shared
 * across all languages; only the voice model differs.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn, execFile, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process';

// One voice per language, keyed by the prompt/translator language code. These are
// ATM's recommended medium voices; using the same ids keeps ATM's cache reusable.
const VOICE_IDS: Record<string, string> = {
	en: 'en_US-hfc_female-medium',
	es: 'es_ES-sharvard-medium',
	zh: 'zh_CN-huayan-medium',
	pt: 'pt_BR-faber-medium',
};
const VOICE_LABELS: Record<string, string> = {
	en: 'English',
	es: 'Spanish',
	zh: 'Chinese',
	pt: 'Portuguese',
};
const DEFAULT_LANG = 'es';

const resolveVoiceId = (lang: string): string => VOICE_IDS[lang] ?? VOICE_IDS[DEFAULT_LANG];

// Voice files are resolved from HuggingFace's catalog (voices.json) so paths stay
// correct if the upstream layout changes. Cached on disk (ATM-first) + in memory.
const VOICES_JSON_URL = 'https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json';
const VOICES_DOWNLOAD_BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/';

const PIPER_RELEASE_BASE =
	'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const ATM_STORAGE_DIR = 'bastndev.atm';

type VoicesCatalog = Record<string, { files: Record<string, { size_bytes?: number }> }>;
let voicesCatalogCache: VoicesCatalog | null = null;

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

function voiceFilePaths(storageBase: string, voiceId: string): { modelPath: string; configPath: string } {
	const voicesDir = path.join(storageBase, 'voices');
	return {
		modelPath: path.join(voicesDir, `${voiceId}.onnx`),
		configPath: path.join(voicesDir, `${voiceId}.onnx.json`),
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

async function findExistingVoice(context: vscode.ExtensionContext, voiceId: string): Promise<string | null> {
	for (const base of storageBases(context)) {
		const { modelPath, configPath } = voiceFilePaths(base, voiceId);
		if (await fileExists(modelPath) && await fileExists(configPath)) {
			return modelPath;
		}
	}
	return null;
}

/* ── Setup: download whatever is missing in both extensions ──────── */

const setupInFlight = new Map<string, Promise<VoiceResources>>();

export async function ensureVoice(context: vscode.ExtensionContext, lang: string): Promise<VoiceResources> {
	const voiceId = resolveVoiceId(lang);
	const piperPath = await findExistingPiper(context);
	const modelPath = await findExistingVoice(context, voiceId);
	if (piperPath && modelPath) {
		return { piperPath, modelPath };
	}

	// Share an in-flight setup per voice (double-click, or both modals at once)
	// so the same model is never downloaded twice concurrently.
	let inflight = setupInFlight.get(voiceId);
	if (!inflight) {
		const label = VOICE_LABELS[lang] ?? 'voice';
		inflight = downloadMissingResources(context, piperPath, modelPath, voiceId, label)
			.finally(() => setupInFlight.delete(voiceId));
		setupInFlight.set(voiceId, inflight);
	}
	return inflight;
}

async function downloadMissingResources(
	context: vscode.ExtensionContext,
	existingPiper: string | null,
	existingModel: string | null,
	voiceId: string,
	langLabel: string,
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
				const target = voiceFilePaths(own, voiceId);
				const { modelUrl, configUrl } = await resolveVoiceDownloadUrls(context, voiceId);
				progress.report({ message: `Downloading ${langLabel} voice… 0%` });
				await downloadFile(modelUrl, target.modelPath, (p) => {
					const pct = p.percentage ?? 0;
					progress.report({ message: `Downloading ${langLabel} voice… ${pct}% (${formatBytes(p.bytesDownloaded)})` });
				});
				progress.report({ message: 'Downloading voice config…' });
				await downloadFile(configUrl, target.configPath);
				modelPath = target.modelPath;
			}

			progress.report({ message: 'Voice ready!' });
			return { piperPath, modelPath };
		},
	);
}

/* ── Voice catalog (voices.json) resolution ──────────────────────── */

async function loadVoicesCatalog(context: vscode.ExtensionContext): Promise<VoicesCatalog> {
	if (voicesCatalogCache) {
		return voicesCatalogCache;
	}

	// Reuse a catalog already on disk (ATM first, then F1's own storage).
	for (const base of storageBases(context)) {
		const candidate = path.join(base, 'voices', 'voices.json');
		if (await fileExists(candidate)) {
			try {
				voicesCatalogCache = JSON.parse(await fs.promises.readFile(candidate, 'utf8')) as VoicesCatalog;
				return voicesCatalogCache;
			} catch {
				// Corrupt copy — fall through to a fresh download.
			}
		}
	}

	const dest = path.join(context.globalStorageUri.fsPath, 'voices', 'voices.json');
	await downloadFile(VOICES_JSON_URL, dest);
	voicesCatalogCache = JSON.parse(await fs.promises.readFile(dest, 'utf8')) as VoicesCatalog;
	return voicesCatalogCache;
}

/** Resolve a voice's .onnx + .onnx.json download URLs from its catalog entry. */
async function resolveVoiceDownloadUrls(
	context: vscode.ExtensionContext,
	voiceId: string,
): Promise<{ modelUrl: string; configUrl: string }> {
	const catalog = await loadVoicesCatalog(context);
	const entry = catalog[voiceId];
	if (!entry) {
		throw new Error(`Voice "${voiceId}" is not in the catalog.`);
	}

	const files = Object.keys(entry.files);
	const onnxFile = files.find((f) => f.endsWith('.onnx') && !f.endsWith('.onnx.json'));
	const configFile = files.find((f) => f.endsWith('.onnx.json'));
	if (!onnxFile || !configFile) {
		throw new Error(`Voice "${voiceId}" is missing model/config files in the catalog.`);
	}

	return {
		modelUrl: `${VOICES_DOWNLOAD_BASE_URL}${onnxFile}`,
		configUrl: `${VOICES_DOWNLOAD_BASE_URL}${configFile}`,
	};
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

// Several short-lived child processes can be alive at once: a streaming piper+player
// for the first block, plus a prefetch piper synthesizing the next block during it.
// Track them all so stop/pause can end every one.
const activeProcesses = new Set<ChildProcess>();
let stoppedByUser = false;

function trackProcess(proc: ChildProcess): void {
	activeProcesses.add(proc);
	const drop = () => {
		activeProcesses.delete(proc);
	};
	proc.once('close', drop);
	proc.once('exit', drop);
}

export function wasVoiceStoppedByUser(): boolean {
	return stoppedByUser;
}

export function isVoiceSpeaking(): boolean {
	for (const proc of activeProcesses) {
		if (!proc.killed) {
			return true;
		}
	}
	return false;
}

export function stopVoicePlayback(markStoppedByUser = true): void {
	stoppedByUser = markStoppedByUser;
	for (const proc of activeProcesses) {
		try {
			proc.stdin?.destroy();
			if (!proc.killed) {
				proc.kill();
			}
		} catch (error) {
			console.error('[f1-voice] Error stopping playback:', error);
		}
	}
	activeProcesses.clear();
}

/** Verify the engine + voice exist and (re)assert exec permissions before spawning. */
async function assertResourcesReady(resources: VoiceResources): Promise<void> {
	if (!(await fileExists(resources.piperPath))) {
		throw new Error(`Piper executable not found at: ${resources.piperPath}`);
	}
	if (!(await fileExists(resources.modelPath))) {
		throw new Error('Voice model not found.');
	}
	// The engine may come from ATM's storage where another process manages
	// permissions; re-asserting is idempotent and cheap.
	if (process.platform === 'linux' || process.platform === 'darwin') {
		await setExecutablePermissions(path.dirname(resources.piperPath));
		await fixSymlinks(path.dirname(resources.piperPath));
	}
}

function spawnPiper(resources: VoiceResources): ChildProcessWithoutNullStreams {
	const piper = spawn(resources.piperPath, ['--model', resources.modelPath, '--output-raw'], {
		cwd: path.dirname(resources.piperPath),
		env: { ...process.env },
		windowsHide: false,
	});
	trackProcess(piper);
	return piper;
}

/**
 * Streams synthesis straight to the speaker (piper → player pipe), so audio starts
 * as soon as the first bytes are produced. This is the fast-start path used for the
 * FIRST block of a run (and single-block reads) — no full-buffer wait. `onAudioStart`
 * fires on the first audible bytes, ideal for kicking off the next block's prefetch.
 */
export async function streamSpeech(
	resources: VoiceResources,
	text: string,
	onAudioStart?: () => void,
): Promise<void> {
	const cleaned = text.trim();
	if (!cleaned) {
		return;
	}

	await assertResourcesReady(resources);
	const playback = getPlaybackCommand(resources.piperPath);
	stoppedByUser = false;

	const piper = spawnPiper(resources);
	const player = spawn(playback.command, playback.args);
	trackProcess(player);

	const noop = () => undefined;
	piper.stdout.on('error', noop);
	player.stdin.on('error', noop);
	piper.stdout.once('data', () => onAudioStart?.());
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
			if (piperClosed && playerClosed) {
				resolveOnce();
			}
		};

		// null exit code == killed by stop/pause — treat as a clean end.
		piper.on('error', rejectOnce);
		player.on('error', rejectOnce);
		piper.on('close', (code) => {
			piperClosed = true;
			if (code !== 0 && code !== null) {
				rejectOnce(new Error(`Piper process exited with code: ${code}`));
			} else {
				maybeFinish();
			}
		});
		player.on('close', (code) => {
			playerClosed = true;
			if (code !== 0 && code !== null) {
				rejectOnce(new Error(`Player process exited with code: ${code}`));
			} else {
				maybeFinish();
			}
		});
	});
}

/**
 * Synthesizes `text` to raw PCM (S16LE, 22050 Hz, mono) entirely in memory and
 * resolves the buffer — no audio is played. This is the "produce" half, run ahead
 * of playback so the next block is ready before the current one ends. Rejects on a
 * real Piper failure; a process the user stopped resolves with whatever it had.
 */
export async function synthesizeSpeech(resources: VoiceResources, text: string): Promise<Buffer> {
	const cleaned = text.trim();
	if (!cleaned) {
		return Buffer.alloc(0);
	}

	await assertResourcesReady(resources);

	return new Promise<Buffer>((resolve, reject) => {
		const piper = spawnPiper(resources);
		const parts: Buffer[] = [];
		let settled = false;
		const finish = (error?: Error, buffer?: Buffer) => {
			if (settled) {
				return;
			}
			settled = true;
			if (error) {
				reject(error);
			} else {
				resolve(buffer ?? Buffer.concat(parts));
			}
		};

		piper.stdout.on('data', (data: Buffer) => parts.push(data));
		piper.stdout.on('error', () => undefined);
		piper.stdin.on('error', () => undefined);
		piper.on('error', (error) => finish(error));
		piper.on('close', (code) => {
			// null code == killed (stop/pause): resolve with what we have; the caller
			// bails on its own sequence check, so the buffer is discarded.
			if (code === 0 || code === null) {
				finish(undefined, Buffer.concat(parts));
			} else {
				finish(new Error(`Piper process exited with code: ${code}`));
			}
		});

		piper.stdin.write(cleaned);
		piper.stdin.end();
	});
}

/**
 * Plays an already-synthesized PCM buffer through the platform player and resolves
 * when playback ends (or the user stops it). `onAudioStart` fires as playback
 * begins — UIs flip to their "speaking" visuals then. Because the buffer is ready,
 * audio is effectively immediate (no synthesis wait between blocks).
 */
export function playPcmBuffer(
	resources: VoiceResources,
	buffer: Buffer,
	onAudioStart?: () => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!buffer.length) {
			resolve();
			return;
		}

		const playback = getPlaybackCommand(resources.piperPath);
		stoppedByUser = false;

		const player = spawn(playback.command, playback.args);
		trackProcess(player);
		player.stdin.on('error', () => undefined);

		let settled = false;
		const finish = (error?: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			if (error) {
				reject(error);
			} else {
				resolve();
			}
		};

		player.on('error', (error) => finish(error));
		player.on('close', (code) => {
			// null code == killed by stop/pause; treat like a clean end.
			if (code === 0 || code === null) {
				finish();
			} else {
				finish(new Error(`Player process exited with code: ${code}`));
			}
		});

		// The buffer is ready, so audio begins effectively now.
		onAudioStart?.();
		player.stdin.write(buffer);
		player.stdin.end();
	});
}
