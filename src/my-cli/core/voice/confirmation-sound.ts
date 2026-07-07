/**
 * Host-side playback of the needs-input confirmation cue (confirmation.wav).
 * Lives in the extension host for the same reason as finish-sound: the webview
 * is torn down whenever the F1 panel is hidden, and the cue matters most when
 * the user is elsewhere (another panel, another app). Ring policy — edge
 * detection, cooldown, reminders — is owned by the session manager.
 */
import * as fs from 'fs';
import * as path from 'path';
import { playWavFile } from './finish-sound';

// __dirname is dist/ at runtime; esbuild's copyWebviewAssets ships the wav at
// dist/my-cli/webview/assets/sound (same file the webview served via URI).
const wavPath = path.join(__dirname, 'my-cli', 'webview', 'assets', 'sound', 'confirmation.wav');

export function playConfirmationSound(): void {
	if (!fs.existsSync(wavPath)) {
		return;
	}
	playWavFile(wavPath);
}
