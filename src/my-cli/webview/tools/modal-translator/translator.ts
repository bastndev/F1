import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import loadingStyles from '../../styles/skeleton/translator-loading.css';
import type { ToolContext } from '../tools';
import type { VoiceProgress, VoiceState } from '../../../shared/voice/voice-types';
import { translateEnToSpanish } from './browser-terminal-translator';
import { renderMarkdownLite } from './markdown-lite';
import { segmentTerminalSelection } from './terminal-text';

const stylesId = 'cli-translator-panel-styles';
const maxVoiceChunkChars = 900;

type TranslatorVoiceChunk = {
	text: string;
	elements: HTMLElement[];
};

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = `${translatorStyles}\n${loadingStyles}`;
	document.head.append(style);
};

function normalizeSpeechText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function splitLongSpeechSegment(segment: string): string[] {
	const chunks: string[] = [];
	let current = '';

	for (const part of segment.match(/\s+|\S+/g) ?? []) {
		if (part.length > maxVoiceChunkChars) {
			if (current.trim()) {
				chunks.push(current.trim());
			}
			current = '';
			for (let index = 0; index < part.length; index += maxVoiceChunkChars) {
				chunks.push(part.slice(index, index + maxVoiceChunkChars));
			}
			continue;
		}

		if (current && current.length + part.length > maxVoiceChunkChars) {
			chunks.push(current.trim());
			current = part.trimStart();
			continue;
		}

		current += part;
	}

	if (current.trim()) {
		chunks.push(current.trim());
	}

	return chunks;
}

function splitSpeechText(text: string): string[] {
	const clean = normalizeSpeechText(text);
	if (!clean) {
		return [];
	}
	if (clean.length <= maxVoiceChunkChars) {
		return [clean];
	}

	const chunks: string[] = [];
	let current = '';
	const flush = () => {
		if (current.trim()) {
			chunks.push(current.trim());
			current = '';
		}
	};

	const sentences = clean.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [clean];
	for (const sentence of sentences) {
		const piece = sentence.trim();
		if (!piece) {
			continue;
		}
		if (piece.length > maxVoiceChunkChars) {
			flush();
			chunks.push(...splitLongSpeechSegment(piece));
			continue;
		}

		const next = current ? `${current} ${piece}` : piece;
		if (next.length > maxVoiceChunkChars) {
			flush();
			current = piece;
		} else {
			current = next;
		}
	}

	flush();
	return chunks;
}

function buildVoiceChunks(textEl: HTMLElement): TranslatorVoiceChunk[] {
	const renderedBlocks = Array.from(textEl.children)
		.filter((element): element is HTMLElement => element instanceof HTMLElement);
	const sourceBlocks = renderedBlocks.length ? renderedBlocks : [textEl];
	const chunks: TranslatorVoiceChunk[] = [];
	let currentText = '';
	let currentElements: HTMLElement[] = [];

	const flush = () => {
		if (currentText.trim()) {
			chunks.push({ text: currentText.trim(), elements: currentElements });
		}
		currentText = '';
		currentElements = [];
	};

	for (const element of sourceBlocks) {
		const text = normalizeSpeechText(element.textContent || '');
		if (!text) {
			continue;
		}

		if (text.length > maxVoiceChunkChars) {
			flush();
			for (const piece of splitSpeechText(text)) {
				chunks.push({ text: piece, elements: [element] });
			}
			continue;
		}

		const next = currentText ? `${currentText}\n\n${text}` : text;
		if (next.length > maxVoiceChunkChars) {
			flush();
			currentText = text;
			currentElements = [element];
		} else {
			currentText = next;
			currentElements.push(element);
		}
	}

	flush();
	return chunks;
}

function clearVoiceHighlights(chunks: TranslatorVoiceChunk[]): void {
	for (const chunk of chunks) {
		for (const element of chunk.elements) {
			element.classList.remove('is-voice-active');
		}
	}
}

function setActiveVoiceChunk(chunks: TranslatorVoiceChunk[], index: number): void {
	clearVoiceHighlights(chunks);
	const chunk = chunks[index];
	if (!chunk) {
		return;
	}

	for (const element of chunk.elements) {
		element.classList.add('is-voice-active');
	}
	chunk.elements[0]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export const mountTranslatorPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (translatorHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeTranslatorBtn');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => context.close());
	}

	return initializeTranslator(host, context);
};

function initializeTranslator(host: HTMLElement, context: ToolContext) {
	const speakBtn = host.querySelector<HTMLButtonElement>('#speakBtn');
	const voiceControl = host.querySelector<HTMLElement>('#voiceControl');
	const voiceExtraBtn = host.querySelector<HTMLButtonElement>('#voiceExtraBtn');
	const speakIdleIcon = host.querySelector<HTMLElement>('#speakBtn .speak-idle i');
	const speakIdleLabel = host.querySelector<HTMLElement>('#speakBtn .speak-idle span');
	const spectrum = host.querySelector<HTMLElement>('#audioSpectrum');
	const copyBtn = host.querySelector<HTMLButtonElement>('#copyBtn');
	const translateBtn = host.querySelector<HTMLButtonElement>('#translateBtn');
	const textEl = host.querySelector<HTMLElement>('#translatedText');
	const modelEl = host.querySelector<HTMLElement>('#modelName');
	const modalEl = host.querySelector<HTMLElement>('.translator-modal');
	const bodyEl = host.querySelector<HTMLElement>('.translator-body');
	const statusEl = host.querySelector<HTMLElement>('.translator-status');

	const setStatus = (status: string) => {
		if (statusEl) {
			statusEl.textContent = status;
		}
	};

	// Translate via the extension host (chunked providers, cache, no CORS —
	// handles long multi-paragraph selections). The direct browser providers
	// remain only as a fallback if the host route is unavailable.
	const translateToSpanish = async (text: string): Promise<{ text: string; provider?: string }> => {
		if (context.translatePrompt) {
			try {
				const result = await context.translatePrompt({ text, from: 'en', to: 'es' });
				if (result.text.trim()) {
					return { text: result.text, provider: result.provider };
				}
			} catch (err) {
				console.warn('[Translator] Host translation failed, trying browser providers:', err);
			}
		}

		return { text: await translateEnToSpanish(text) };
	};

	// Raw text behind whatever is on screen — the Copy button copies this,
	// not the rendered markdown's flattened textContent.
	let copyText = '';
	let resultStatus = statusEl?.textContent || 'ready';
	let activeVoiceChunks: TranslatorVoiceChunk[] = [];

	// Listen starts disabled (gray) and only lights up — softly, via the button
	// transition — once there is a translation result to read aloud. hasResult also
	// keeps voice.state resyncs from re-enabling Listen early. Copy is independent:
	// it enables whenever the panel holds real text (English source or Spanish
	// result), so the user can copy before and after translating.
	let hasResult = false;
	const enableResultActions = () => {
		hasResult = true;
		if (copyBtn) {
			copyBtn.disabled = false;
		}
		if (speakBtn) {
			speakBtn.disabled = false;
		}
	};

	const performTranslation = async () => {
		const extracted = extractTextToTranslate(context);
		if (!extracted) {
			if (textEl) {
				textEl.classList.remove('is-rendered');
				textEl.textContent = 'Select or copy text in the terminal to translate it to Spanish.';
				textEl.classList.add('placeholder');
			}
			// Nothing real on screen — only the hint — so there's nothing to copy.
			if (copyBtn) {
				copyBtn.disabled = true;
			}
			resultStatus = 'ready';
			setStatus(resultStatus);
			return;
		}

		if (!textEl || !modalEl) {
			return;
		}

		// Freeze the body at its current height so swapping the text for the
		// skeleton doesn't collapse the modal and snap it back on completion.
		const lockedHeight = bodyEl?.offsetHeight ?? 0;
		if (bodyEl) {
			bodyEl.style.height = `${lockedHeight}px`;
		}

		if (translateBtn) {
			translateBtn.disabled = true;
		}
		clearVoiceHighlights(activeVoiceChunks);
		activeVoiceChunks = [];
		modalEl.classList.add('is-translating');
		textEl.classList.remove('placeholder', 'is-rendered');
		textEl.replaceChildren(buildSkeleton(lockedHeight));
		setStatus('translating…');

		try {
			// Split the selection into translatable prose and verbatim frames
			// (tree diagrams). Box tables arrive as pipe markdown inside prose;
			// trees skip translation entirely and render as monospace blocks.
			const segments = segmentTerminalSelection(extracted);
			if (!segments.length) {
				segments.push({ kind: 'prose', content: extracted });
			}

			const renderedParts: string[] = [];
			const copyParts: string[] = [];
			let provider: string | undefined;
			let codeCount = 0;

			for (const segment of segments) {
				if (segment.kind === 'diagram') {
					renderedParts.push(`\`\`\`tree\n${segment.content}\n\`\`\``);
					copyParts.push(segment.content);
					continue;
				}

				if (segment.kind === 'code') {
					// Code never goes to translation. It collapses into a numbered
					// "code here" placeholder — kept in English so a future voice
					// feature can read it without translation tricks.
					codeCount += 1;
					renderedParts.push(`[[code-here:${codeCount}]]`);
					copyParts.push(`[code here #${codeCount}]`);
					continue;
				}

				const result = await translateToSpanish(segment.content);
				const value = result.text || segment.content;
				provider ??= result.provider;
				renderedParts.push(value);
				copyParts.push(value);
			}

			copyText = copyParts.join('\n\n');
			revealText(textEl, renderedParts.join('\n\n'));
			resultStatus = provider ? `translated · ${provider.toLowerCase()}` : 'translated';
			setStatus(resultStatus);
			enableResultActions();
		} catch (err) {
			console.error('[Translator] EN->ES failed:', err);
			copyText = extracted;
			revealText(textEl, extracted);
			resultStatus = 'translation failed';
			setStatus(resultStatus);
			// The original text is on screen — copying/listening still makes sense.
			enableResultActions();
			// Failed attempts may be transient (rate limit, network) — allow retry.
			if (translateBtn) {
				translateBtn.disabled = false;
			}
		} finally {
			modalEl.classList.remove('is-translating');
			if (bodyEl) {
				bodyEl.style.height = '';
			}
		}
	};

	const labelEl = document.getElementById('cli-terminal-label');
	if (modelEl && labelEl) {
		const label = labelEl.textContent?.trim() || 'CLI';
		modelEl.textContent = label.toLowerCase().replace(/\s+(cli|code)\s*$/i, '');
	}

	let isSpeaking = false;
	let isPaused = false;
	let isPreparingVoice = false;
	const extracted = extractTextToTranslate(context);
	if (textEl) {
		if (extracted) {
			copyText = extracted;
			textEl.textContent = extracted;
			textEl.classList.add('placeholder');
		} else {
			textEl.textContent = 'Select or copy text in the terminal to translate it to Spanish.';
			textEl.classList.add('placeholder');
		}
	}
	// Copy works on whatever the panel holds — the English source now, the Spanish
	// result after translating — so enable it as soon as there is real text (not the
	// "select text" hint). Listen stays gated to a finished result.
	if (copyBtn) {
		copyBtn.disabled = !extracted;
	}

	if (copyBtn && textEl) {
		copyBtn.addEventListener('click', async () => {
			const text = copyText || textEl.textContent || '';
			if (!text) {
				return;
			}

			try {
				await navigator.clipboard.writeText(text);
				const originalHtml = copyBtn.innerHTML;
				copyBtn.classList.add('copied');
				copyBtn.innerHTML =
					`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
					`stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
					`class="icon icon-tabler icons-tabler-outline icon-tabler-check" aria-hidden="true">` +
					`<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M5 12l5 5l10 -10" /></svg>`;
				setTimeout(() => {
					copyBtn.innerHTML = originalHtml;
					copyBtn.classList.remove('copied');
				}, 1400);
			} catch {
				console.log('Clipboard not available');
			}
		});
	}

	if (translateBtn) {
		translateBtn.addEventListener('click', () => {
			performTranslation();
		});
	}

	if (speakBtn && spectrum) {
		let disposeVoiceState: (() => void) | undefined;
		// Real playback runs in the extension host (Piper TTS, sharing the ATM
		// extension's downloaded engine/voice). The button mirrors broadcast
		// voice.state events: CSS swaps the idle label for the animated bars
		// (and a stop glyph on hover) while actually speaking.
		const applyVoiceState = (state: VoiceState, message?: string, progress?: VoiceProgress) => {
			isSpeaking = state === 'speaking';
			isPaused = state === 'paused';
			isPreparingVoice = state === 'preparing';
			speakBtn.classList.toggle('speaking', isSpeaking);
			speakBtn.classList.toggle('is-paused', isPaused);
			speakBtn.classList.toggle('is-preparing', isPreparingVoice);
			voiceControl?.classList.toggle('is-speaking', isSpeaking);
			voiceControl?.classList.toggle('is-paused', isPaused);
			voiceControl?.classList.toggle('is-preparing', isPreparingVoice);
			// Stay disabled until something was translated, except while a
			// playback from a previous open is running (so it can be controlled).
			speakBtn.disabled = isPreparingVoice || (!hasResult && !isSpeaking && !isPaused);

			if (speakIdleLabel) {
				speakIdleLabel.textContent = isPreparingVoice ? 'Preparing' : isPaused ? 'Resume' : 'Listen';
			}
			if (speakIdleIcon) {
				speakIdleIcon.className = isPaused ? 'ti ti-player-play-filled' : 'ti ti-volume-2';
			}

			const label = isPreparingVoice ? 'Preparing voice…' : isSpeaking ? 'Pause' : isPaused ? 'Resume' : 'Listen';
			speakBtn.title = label;
			speakBtn.setAttribute('aria-label', label);

			if (voiceExtraBtn) {
				voiceExtraBtn.disabled = !(isSpeaking || isPaused);
				voiceExtraBtn.title = 'Stop voice';
				voiceExtraBtn.setAttribute('aria-label', 'Stop voice');
			}

			if ((isPreparingVoice || isSpeaking || isPaused) && progress) {
				setActiveVoiceChunk(activeVoiceChunks, progress.chunkIndex);
				if (progress.chunkCount > 1) {
					const progressLabel = `voice ${progress.chunkIndex + 1}/${progress.chunkCount}`;
					setStatus(isPaused ? `paused · ${progressLabel}` : progressLabel);
				}
			}
			if (isPaused && !progress) {
				setStatus('paused');
			}
			if (state === 'idle') {
				clearVoiceHighlights(activeVoiceChunks);
				setStatus(resultStatus);
			}
			if (state === 'error') {
				clearVoiceHighlights(activeVoiceChunks);
				setStatus(message ? `voice · ${message.toLowerCase()}` : 'voice error');
			}
		};

		disposeVoiceState = context.onVoiceState?.(applyVoiceState);
		// Playback may still be running from a previous open — resync.
		context.queryVoiceState?.();

		speakBtn.addEventListener('click', () => {
			if (isPaused) {
				context.resumeSpeech?.();
				return;
			}

			if (isSpeaking) {
				context.pauseSpeech?.();
				return;
			}

			if (textEl && context.speakText) {
				clearVoiceHighlights(activeVoiceChunks);
				activeVoiceChunks = buildVoiceChunks(textEl);
				const chunks = activeVoiceChunks.map((chunk) => chunk.text);
				const value = chunks.join('\n\n');
				if (value) {
					context.speakText(value, { chunks });
				}
			}
		});

		voiceExtraBtn?.addEventListener('click', () => {
			if (isSpeaking || isPaused) {
				context.stopSpeech?.();
			}
		});

		return () => {
			disposeVoiceState?.();
			clearVoiceHighlights(activeVoiceChunks);
		};
	}

	return undefined;
}

function extractTextToTranslate(context: ToolContext): string {
	return context.getTerminalSelection?.() || '';
}

function buildSkeleton(availableHeight: number): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-skeleton';
	wrap.setAttribute('aria-hidden', 'true');

	// The body is height-locked while loading; size the skeleton to fill it
	// edge to edge (minus the body's 16px vertical padding). Overflow clips.
	const contentHeight = Math.max(66, availableHeight - 32);
	wrap.style.height = `${contentHeight}px`;

	const scan = document.createElement('div');
	scan.className = 't-skel-scan';
	wrap.append(scan);

	const lines = document.createElement('div');
	lines.className = 't-skel-lines';
	wrap.append(lines);

	// One line per ~22px of field (13px font × 1.7 line-height), reserving
	// room for the typing row. Width pattern mimics prose; every 4th line
	// starts a new "paragraph".
	const pattern = ['full', 'long', 'full', 'med', 'long', 'short', 'full', 'long', 'med', 'full', 'short'];
	const lineCount = Math.min(60, Math.max(3, Math.floor((contentHeight - 30) / 22)));

	for (let i = 0; i < lineCount; i += 1) {
		const line = document.createElement('div');
		line.className = `t-skel-line ${pattern[i % pattern.length]}`;
		if (i > 0 && i % 4 === 0) {
			line.classList.add('t-skel-gap');
		}
		lines.append(line);
	}

	const typing = document.createElement('div');
	typing.className = 't-skel-typing';

	const sym = document.createElement('span');
	sym.className = 't-skel-sym';
	sym.textContent = '›';
	typing.append(sym);

	const dots = document.createElement('span');
	dots.className = 't-skel-dots';
	for (let i = 0; i < 3; i += 1) {
		const dot = document.createElement('span');
		dot.className = 't-skel-dot';
		dots.append(dot);
	}
	typing.append(dots);
	wrap.append(typing);

	return wrap;
}

function revealText(textEl: HTMLElement, value: string): void {
	// CLI answers are usually markdown — render headings, lists, and code
	// instead of showing raw markers. renderMarkdownLite escapes all input.
	textEl.innerHTML = renderMarkdownLite(value);
	textEl.classList.add('is-rendered');
	textEl.classList.remove('is-revealing');
	// Restart the animation even if a previous reveal is still applied.
	void textEl.offsetWidth;
	textEl.classList.add('is-revealing');
	textEl.addEventListener('animationend', () => {
		textEl.classList.remove('is-revealing');
	}, { once: true });
}
