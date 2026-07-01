import type { ExtensionContext } from 'vscode';
import {
	ensureVoice,
	isVoiceReady,
	streamSpeech,
	synthesizeSpeech,
	playPcmBuffer,
	stopVoicePlayback,
	isVoiceSpeaking,
} from './host-voice-tts';
import { normalizeVoiceChunks, type ActiveVoiceSession } from './voice-chunks';
import type { VoiceProgress, VoiceState } from '../../shared/voice/voice-types';
import type { InboundWebviewMessage } from '../../shared/protocol';

export type VoicePostMessage = (message: Record<string, unknown>) => Thenable<boolean> | Promise<void>;

export class VoiceController {
	private activeSession?: ActiveVoiceSession;
	private requestSeq = 0;
	/** Set while a streaming session's loop is parked waiting for more chunks. */
	private moreChunks?: () => void;

	constructor(
		private readonly postMessage: VoicePostMessage,
		private readonly getExtensionContext: () => ExtensionContext | undefined,
	) {}

	public dispose() {
		this.requestSeq += 1;
		this.activeSession = undefined;
		stopVoicePlayback();
		this.wakeMoreChunks();
	}

	/** A parked streaming loop awaits this; resolved by append/pause/stop. */
	private waitForMoreChunks(): Promise<void> {
		return new Promise<void>((resolve) => {
			this.moreChunks = resolve;
		});
	}

	/** Release a parked streaming loop (no-op if nothing is parked). */
	private wakeMoreChunks(): void {
		const resolve = this.moreChunks;
		this.moreChunks = undefined;
		resolve?.();
	}

	public async handleSpeak(message: InboundWebviewMessage) {
		const chunks = normalizeVoiceChunks(message);
		if (!chunks.length) {
			return;
		}

		const ctx = this.getExtensionContext();
		if (!ctx) {
			await this.postState('error', 'Voice unavailable: no extension context.');
			return;
		}

		const seq = ++this.requestSeq;
		stopVoicePlayback(false);
		this.wakeMoreChunks();
		const session: ActiveVoiceSession = {
			chunks,
			index: 0,
			state: 'preparing',
			lang: typeof message.lang === 'string' ? message.lang : 'es',
		};
		this.activeSession = session;

		await this.runSession(session, seq);
	}

	/**
	 * Streaming append: queue more chunks onto the live session (starting one if
	 * none is active) so the Translator can feed blocks as they finish translating
	 * instead of waiting for the whole answer. `final: true` signals the last batch.
	 */
	public async handleAppend(message: InboundWebviewMessage) {
		const incoming = normalizeVoiceChunks(message);
		const final = message.final === true;
		const reset = message.reset === true;
		const session = this.activeSession;

		// Extend the live stream — unless the producer asks to reset (a new answer
		// supersedes whatever is still playing from the previous one).
		if (!reset && session && session.streaming) {
			if (incoming.length) {
				session.chunks.push(...incoming);
			}
			if (final) {
				session.complete = true;
			}
			// Wake the loop if it's parked at the end of the previous batch.
			this.wakeMoreChunks();
			return;
		}

		// A bare "final" with nothing to say has no session to start — ignore it.
		if (!incoming.length) {
			return;
		}

		const ctx = this.getExtensionContext();
		if (!ctx) {
			await this.postState('error', 'Voice unavailable: no extension context.');
			return;
		}

		const seq = ++this.requestSeq;
		stopVoicePlayback(false);
		this.wakeMoreChunks();
		const newSession: ActiveVoiceSession = {
			chunks: incoming,
			index: 0,
			state: 'preparing',
			lang: typeof message.lang === 'string' ? message.lang : 'es',
			streaming: true,
			complete: final,
		};
		this.activeSession = newSession;

		await this.runSession(newSession, seq);
	}

	public async handlePause() {
		const session = this.activeSession;
		if (!session || (session.state !== 'preparing' && session.state !== 'speaking')) {
			return;
		}

		this.requestSeq += 1;
		session.state = 'paused';
		stopVoicePlayback();
		this.wakeMoreChunks();
		await this.postState('paused', this.chunkLabel(session), this.progress(session));
	}

	public async handleResume() {
		const session = this.activeSession;
		if (!session || session.state !== 'paused') {
			return;
		}

		const seq = ++this.requestSeq;
		await this.runSession(session, seq);
	}

	public async handleStop() {
		this.requestSeq += 1;
		this.activeSession = undefined;
		stopVoicePlayback();
		this.wakeMoreChunks();
		await this.postState('idle');
	}

	public async handleQueryState() {
		const session = this.activeSession;
		if (session) {
			await this.postState(session.state, this.chunkLabel(session), this.progress(session));
			return;
		}

		await this.postState(isVoiceSpeaking() ? 'speaking' : 'idle');
	}

	public async handleCheckReady(message: InboundWebviewMessage) {
		if (typeof message.id !== 'string') {
			return;
		}
		const lang = typeof message.lang === 'string' ? message.lang : 'es';
		let ready = false;
		try {
			const ctx = this.getExtensionContext();
			ready = ctx ? await isVoiceReady(ctx, lang) : false;
		} catch {
			ready = true;
		}
		await this.postMessage({ type: 'voice.ready', id: message.id, ready });
	}

	private async postState(state: VoiceState, detail?: string, progress?: VoiceProgress) {
		await this.postMessage({ type: 'voice.state', state, message: detail, progress });
	}

	private progress(session: ActiveVoiceSession): VoiceProgress {
		return {
			chunkIndex: Math.min(session.index, Math.max(0, session.chunks.length - 1)),
			chunkCount: session.chunks.length
		};
	}

	private chunkLabel(session: ActiveVoiceSession): string | undefined {
		const p = this.progress(session);
		return p.chunkCount > 1 ? `voice ${p.chunkIndex + 1}/${p.chunkCount}` : undefined;
	}

	private isRunActive(session: ActiveVoiceSession, seq: number): boolean {
		return this.activeSession === session && seq === this.requestSeq;
	}

	private async runSession(session: ActiveVoiceSession, seq: number) {
		const post = async (state: VoiceState) => {
			if (this.isRunActive(session, seq)) {
				await this.postState(state, this.chunkLabel(session), this.progress(session));
			}
		};

		try {
			const ctx = this.getExtensionContext();
			if (!ctx) {
				this.activeSession = undefined;
				await this.postState('error', 'Voice unavailable: no extension context.');
				return;
			}

			session.state = 'preparing';
			await post('preparing');
			session.resources ??= await ensureVoice(ctx, session.lang);
			const resources = session.resources;
			const chunks = session.chunks;

			const startSynth = (text: string) => {
				let ready = false;
				const promise = synthesizeSpeech(resources, text).then((audio) => {
					ready = true;
					return audio;
				});
				void promise.catch(() => undefined);
				return { promise, isReady: () => ready };
			};

			let pending: { promise: Promise<Buffer>; isReady: () => boolean } | undefined;
			let index = session.index;

			for (;;) {
				if (!this.isRunActive(session, seq)) {
					return;
				}

				// No chunk at this position yet. A streaming session parks here
				// until more arrive (or it's told it's complete); a normal session
				// has simply reached the end.
				if (index >= chunks.length) {
					if (!session.streaming || session.complete) {
						break;
					}
					await this.waitForMoreChunks();
					continue;
				}

				session.index = index;
				const nextIndex = index + 1;

				if (!pending) {
					session.state = 'preparing';
					await post('preparing');
					await streamSpeech(resources, chunks[index], () => {
						if (!this.isRunActive(session, seq)) {
							return;
						}
						session.state = 'speaking';
						void post('speaking');
						if (nextIndex < chunks.length && !pending) {
							pending = startSynth(chunks[nextIndex]);
						}
					});
					index = nextIndex;
					continue;
				}

				const current = pending;
				if (!current.isReady()) {
					session.state = 'preparing';
					await post('preparing');
				}

				let audio: Buffer;
				try {
					audio = await current.promise;
				} catch (error) {
					if (!this.isRunActive(session, seq)) {
						return;
					}
					throw error;
				}
				if (!this.isRunActive(session, seq)) {
					return;
				}

				pending = nextIndex < chunks.length ? startSynth(chunks[nextIndex]) : undefined;

				session.state = 'speaking';
				await playPcmBuffer(resources, audio, () => {
					if (this.isRunActive(session, seq)) {
						session.state = 'speaking';
						void post('speaking');
					}
				});
				index = nextIndex;
			}

			if (!this.isRunActive(session, seq)) {
				return;
			}

			this.activeSession = undefined;
			session.state = 'idle';
			await this.postState('idle');
		} catch (error) {
			if (!this.isRunActive(session, seq)) {
				return;
			}

			this.activeSession = undefined;
			session.state = 'error';
			const detail = error instanceof Error ? error.message : 'Voice playback failed.';
			console.error('[f1-voice] Playback error:', error);
			await this.postState('error', detail);
		}
	}
}
