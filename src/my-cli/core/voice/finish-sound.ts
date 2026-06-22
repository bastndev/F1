/**
 * "Voice Finish" — a short spoken cue played when a CLI finishes responding.
 *
 * Runs entirely in the extension host (not the webview) on purpose: the My CLI
 * webview is torn down whenever you leave the F1 panel, so a webview-side sound
 * would never fire while you're working elsewhere — which is exactly when the
 * cue is useful. The host process stays alive and owns the output stream, so it
 * can both detect the finish (see session-manager) and play the sound here.
 *
 * The cue is a per-language WAV (es/pt/zh/ru/en) shipped under
 * dist/my-cli/shared/voice/wav (copied there by esbuild — .vscodeignore drops
 * the src copy). Playback reuses the platform players the TTS engine already
 * relies on (afplay / aplay / PowerShell SoundPlayer); failures are swallowed
 * so a box without audio tooling never breaks the CLI.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// __dirname is dist/ at runtime (same anchor getPtyHostPath uses), so the WAVs
// resolve to dist/my-cli/shared/voice/wav where the build copies them.
const wavDir = path.join(__dirname, 'my-cli', 'shared', 'voice', 'wav');
const fallbackLang = 'en';

// Guard against a double-fire (e.g. a settle followed immediately by an exit
// line) stacking two overlapping clips.
const minGapMs = 500;
let lastPlayedAt = 0;

const resolveWavPath = (lang: string): string | undefined => {
	const code = /^[a-z]{2}$/.test(lang) ? lang : fallbackLang;
	const candidate = path.join(wavDir, `${code}.wav`);
	if (fs.existsSync(candidate)) {
		return candidate;
	}
	const fallback = path.join(wavDir, `${fallbackLang}.wav`);
	return fs.existsSync(fallback) ? fallback : undefined;
};

const getPlayerCommand = (wavPath: string): { command: string; args: string[] } | undefined => {
	switch (process.platform) {
		case 'darwin':
			return { command: 'afplay', args: [wavPath] };
		case 'linux':
			// aplay reads the WAV header itself; -q keeps it quiet on stderr. Same
			// dependency the Piper playback path already assumes on Linux.
			return { command: 'aplay', args: ['-q', wavPath] };
		case 'win32':
			// SoundPlayer needs PlaySync so the process lives long enough to play.
			// Single-quotes are escaped by doubling for PowerShell string literals.
			return {
				command: 'powershell',
				args: [
					'-NoProfile',
					'-Command',
					`(New-Object Media.SoundPlayer '${wavPath.replace(/'/g, "''")}').PlaySync()`,
				],
			};
		default:
			return undefined;
	}
};

/**
 * Play the finish cue for `lang`. Best-effort and non-blocking: unknown
 * languages fall back to English, a missing file or absent player is ignored.
 */
export function playFinishSound(lang: string): void {
	const now = Date.now();
	if (now - lastPlayedAt < minGapMs) {
		return;
	}

	const wavPath = resolveWavPath(lang);
	if (!wavPath) {
		return;
	}

	const player = getPlayerCommand(wavPath);
	if (!player) {
		return;
	}

	lastPlayedAt = now;
	try {
		const proc = spawn(player.command, player.args, { stdio: 'ignore', windowsHide: true });
		proc.on('error', () => {
			/* no audio tooling on this box — silently skip */
		});
		proc.unref();
	} catch {
		/* spawn unavailable — ignore */
	}
}
