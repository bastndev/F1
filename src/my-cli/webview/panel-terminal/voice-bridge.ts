/**
 * Voice playback bridge for the terminal panel. Playback runs in the extension
 * host (Piper TTS, shared with the ATM extension); the webview fires commands
 * and mirrors broadcast voice.state — including the "now playing" pill in the
 * always-visible CLI header bar. Extracted from terminal.ts as a
 * createVoiceBridge(deps) factory (mirrors createUsageTracker); the message
 * loop feeds broadcast state in via notifyState.
 */
import type { ToolId } from '../tools/tools';
import type { VoiceProgress, VoiceState } from '../../shared/voice/voice-types';
import type { WebviewToHostMessage } from '../../shared/protocol';

export interface VoiceBridgeDeps {
	post(message: WebviewToHostMessage): void;
	/** Which tool modal is open right now — the header pill hides while the voice modals own the controls. */
	getOpenTool(): ToolId | null;
}

export type VoiceBridge = ReturnType<typeof createVoiceBridge>;

export const createVoiceBridge = (deps: VoiceBridgeDeps) => {
	let voiceStateListener: ((state: VoiceState, message?: string, progress?: VoiceProgress) => void) | undefined;

	const speakText = (text: string, options?: { chunks?: string[]; lang?: string }) => {
		deps.post({ type: 'voice.speak', text, chunks: options?.chunks, lang: options?.lang });
	};

	// Streaming companion to speakText: queue more chunks onto the running voice
	// session (the Translator feeds blocks as they finish translating). `final`
	// marks the last batch so the host can wind the session down.
	const appendSpeech = (chunks: string[], options?: { final?: boolean; lang?: string; reset?: boolean }) => {
		deps.post({ type: 'voice.append', chunks, lang: options?.lang, final: options?.final, reset: options?.reset });
	};

	const stopSpeech = () => {
		deps.post({ type: 'voice.stop' });
	};

	const pauseSpeech = () => {
		deps.post({ type: 'voice.pause' });
	};

	const resumeSpeech = () => {
		deps.post({ type: 'voice.resume' });
	};

	const queryVoiceState = () => {
		deps.post({ type: 'voice.query' });
	};

	const onVoiceState = (listener: (state: VoiceState, message?: string, progress?: VoiceProgress) => void) => {
		voiceStateListener = listener;
		return () => {
			if (voiceStateListener === listener) {
				voiceStateListener = undefined;
			}
		};
	};

	// "Now playing" voice control mirrored into the always-visible CLI header bar, so
	// a read-aloud can be paused/stopped without an open modal. Fed straight from the
	// broadcast voice.state (via notifyState below) — independent of the modal pills,
	// which register through onVoiceState above. Same visual/logic as the prompt pill.
	const headerVoice = (() => {
		const pill = document.getElementById('cli-voice-pill');
		const toggleBtn = document.getElementById('cli-voice-toggle') as HTMLButtonElement | null;
		const stopBtn = document.getElementById('cli-voice-stop') as HTMLButtonElement | null;
		if (!pill || !toggleBtn || !stopBtn) {
			return undefined;
		}

		let state: VoiceState = 'idle';
		const apply = (next?: VoiceState) => {
			if (next) {state = next;}
			const openTool = deps.getOpenTool();
			// Show the pill when voice is active but voice modals (translator/prompt) are closed
			const active = state !== 'idle' && openTool !== 'translate' && openTool !== 'prompt';
			pill.hidden = !active;
			pill.setAttribute('aria-hidden', active ? 'false' : 'true');
			pill.classList.toggle('is-speaking', state === 'speaking');
			pill.classList.toggle('is-paused', state === 'paused');
			pill.classList.toggle('is-preparing', state === 'preparing');
			toggleBtn.disabled = state === 'preparing';
			const label = state === 'preparing' ? 'Preparing voice…' : state === 'paused' ? 'Resume voice' : 'Pause voice';
			toggleBtn.title = label;
			toggleBtn.setAttribute('aria-label', label);
		};

		toggleBtn.addEventListener('click', () => {
			if (state === 'speaking') {
				pauseSpeech();
			} else if (state === 'paused') {
				resumeSpeech();
			}
		});
		stopBtn.addEventListener('click', () => {
			if (state === 'speaking' || state === 'paused') {
				stopSpeech();
			}
		});

		return { apply };
	})();

	// Sync now in case a read is already playing when this webview (re)builds — there's
	// no retainContextWhenHidden, so a panel switch remounts us mid-read.
	if (headerVoice) {
		queryVoiceState();
	}

	/** Broadcast voice.state from the host: fan out to the modal listener + header pill. */
	const notifyState = (state: VoiceState, message?: string, progress?: VoiceProgress) => {
		voiceStateListener?.(state, message, progress);
		headerVoice?.apply(state);
	};

	/** Re-evaluate the header pill's visibility (e.g. after a tool modal opens/closes). */
	const applyHeader = () => {
		headerVoice?.apply();
	};

	return {
		speakText,
		appendSpeech,
		stopSpeech,
		pauseSpeech,
		resumeSpeech,
		queryVoiceState,
		onVoiceState,
		notifyState,
		applyHeader
	};
};
