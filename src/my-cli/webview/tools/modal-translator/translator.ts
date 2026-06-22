import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import loadingStyles from '../../styles/skeleton/translator-loading.css';
import type { ToolContext } from '../tools';
import type { VoiceProgress, VoiceState } from '../../../shared/voice/voice-types';
import { translateEnTo } from './browser-terminal-translator';
import { renderMarkdownLite } from './markdown-lite';
import { segmentTerminalSelection } from './terminal-text';
import { getCachedTranslation, setCachedTranslation, getCachedParagraph, setCachedParagraph } from './translator-cache';
import { matchesShortcut } from '../../../../shared/keymaps/cli';
import { getStoredPromptLang } from '../modal-prompt/language-select';
import { getPromptLanguage } from '../../../shared/prompt';

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
			element.classList.remove('is-voice-active', 'is-voice-start', 'is-voice-end');
		}
	}
}

function setActiveVoiceChunk(chunks: TranslatorVoiceChunk[], index: number): void {
	clearVoiceHighlights(chunks);
	const chunk = chunks[index];
	if (!chunk) {
		return;
	}

	// Mark the chunk's blocks so CSS can fuse them into one cohesive reading band:
	// every block is active; the first opens the band (rounded top), the last
	// closes it (rounded bottom). A single-block chunk gets both.
	const lastIndex = chunk.elements.length - 1;
	chunk.elements.forEach((element, elementIndex) => {
		element.classList.add('is-voice-active');
		if (elementIndex === 0) {
			element.classList.add('is-voice-start');
		}
		if (elementIndex === lastIndex) {
			element.classList.add('is-voice-end');
		}
	});
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

	// Target language mirrors the prompt modal's chosen source language (the user
	// only picks once): if they write in Spanish, CLI output is translated to
	// Spanish. Until a language is picked, default to English — i.e. don't
	// translate at all (English is short-circuited below). Assuming Spanish for a
	// fresh install would silently mistranslate for everyone who isn't Spanish.
	const targetLang = getStoredPromptLang() ?? 'en';
	const targetInfo = getPromptLanguage(targetLang);
	const targetLabel = targetInfo?.label ?? 'English';

	// Reflect the target in the header direction row: "cli → 🇪🇸 spanish".
	const langToEl = host.querySelector<HTMLElement>('.lang-to');
	if (langToEl && targetInfo) {
		langToEl.textContent = `${targetInfo.flag} ${targetInfo.label.toLowerCase()}`;
	}

	// Translate via the extension host (chunked providers, cache, no CORS —
	// handles long multi-paragraph selections). The direct browser providers
	// remain only as a fallback if the host route is unavailable. English target
	// needs no translation — CLI output is already English.
	const translateSelection = async (text: string): Promise<{ text: string; provider?: string }> => {
		if (targetLang === 'en') {
			return { text };
		}

		if (context.translatePrompt) {
			try {
				const result = await context.translatePrompt({ text, from: 'en', to: targetLang });
				if (result.text.trim()) {
					return { text: result.text, provider: result.provider };
				}
			} catch (err) {
				console.warn('[Translator] Host translation failed, trying browser providers:', err);
			}
		}

		return { text: await translateEnTo(text, targetLang) };
	};

	// Raw text behind whatever is on screen — the Copy button copies this,
	// not the rendered markdown's flattened textContent.
	let copyText = '';
	let resultStatus = statusEl?.textContent || 'ready';
	let activeVoiceChunks: TranslatorVoiceChunk[] = [];

	// Auto-read: when "auto" is on, start reading as soon as a translation is
	// shown (no Listen press). Wired once the voice control is set up below; the
	// per-translation flag stops the same result being read twice.
	let triggerAutoRead: () => void = () => {};
	let autoReadConsumed = false;

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
		// A new translation re-arms auto-read (the previous result was its own).
		autoReadConsumed = false;
		const extracted = extractTextToTranslate(context);
		if (!extracted) {
			if (textEl) {
				textEl.classList.remove('is-rendered');
				textEl.textContent = `Select or copy text in the terminal to translate it to ${targetLabel}.`;
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

		// Already translated this exact selection? Restore it instantly — no
		// skeleton, no host round-trip, no re-translation. (Cache is RAM-only and
		// dies with the panel; see translator-cache.ts.)
		const cached = getCachedTranslation(targetLang, extracted);
		if (cached) {
			copyText = cached.copyText;
			textEl.classList.remove('placeholder');
			revealText(textEl, cached.rendered);
			resultStatus = cached.status;
			setStatus(resultStatus);
			enableResultActions();
			triggerAutoRead();
			return;
		}

		// Every paragraph of this selection already translated as part of an earlier
		// block? Rebuild it from the paragraph cache — no skeleton, no network. Bails
		// (→ normal translation) if any paragraph is missing, including code/tree
		// lines, so it can never show a wrong result; a miss just falls through.
		const reused = reconstructFromParagraphs(targetLang, extracted);
		if (reused) {
			copyText = reused;
			textEl.classList.remove('placeholder');
			revealText(textEl, reused);
			resultStatus = 'translated';
			setStatus(resultStatus);
			enableResultActions();
			triggerAutoRead();
			// Remember the exact selection too, so repeating it is a direct hit.
			setCachedTranslation(targetLang, extracted, { rendered: reused, copyText, status: resultStatus });
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

				const result = await translateSelection(segment.content);
				const value = result.text || segment.content;
				provider ??= result.provider;
				renderedParts.push(value);
				copyParts.push(value);
				// Populate the paragraph cache so a later single-paragraph selection of
				// this block reuses the translation. Only when we actually got one.
				if (result.text.trim()) {
					cacheParagraphPairs(targetLang, segment.content, result.text);
				}
			}

			const renderedMarkdown = renderedParts.join('\n\n');
			copyText = copyParts.join('\n\n');
			revealText(textEl, renderedMarkdown);
			resultStatus = provider ? `translated · ${provider.toLowerCase()}` : 'translated';
			setStatus(resultStatus);
			enableResultActions();
			triggerAutoRead();
			// Remember this exact selection so revisiting it skips the round-trip.
			setCachedTranslation(targetLang, extracted, { rendered: renderedMarkdown, copyText, status: resultStatus });
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
			textEl.textContent = `Select or copy text in the terminal to translate it to ${targetLabel}.`;
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

	// Auto-translate toggle — persisted via localStorage like the prompt modal's
	// toggles ('f1-translator-auto' → '1' on | '0'/missing off; default off keeps
	// today's manual behavior). ON: translate as soon as the panel opens and hide
	// the manual Translate button. OFF: show the button. The toggle itself is
	// always visible, so turning auto off never strands the user without a way back.
	const autoToggle = host.querySelector<HTMLButtonElement>('#autoTranslateToggle');
	const autoStorageKey = 'f1-translator-auto';
	let autoTranslate = localStorage.getItem(autoStorageKey) === '1';

	const applyAutoState = () => {
		autoToggle?.setAttribute('aria-pressed', String(autoTranslate));
		if (translateBtn) {
			translateBtn.hidden = autoTranslate;
		}
	};
	applyAutoState();

	// Opening already in auto mode with source text present → translate now.
	if (autoTranslate && extracted) {
		void performTranslation();
	}

	autoToggle?.addEventListener('click', () => {
		autoTranslate = !autoTranslate;
		try {
			localStorage.setItem(autoStorageKey, autoTranslate ? '1' : '0');
		} catch {
			/* storage unavailable — the toggle still works for this session */
		}
		applyAutoState();
		// Switching it on acts immediately: translate pending text (auto-read fires
		// on completion), or — if a result is already up — read it now. Switching
		// off only restores the manual button (no side effects).
		if (autoTranslate) {
			if (!hasResult && extractTextToTranslate(context)) {
				void performTranslation();
			} else if (hasResult) {
				autoReadConsumed = false;
				triggerAutoRead();
			}
		}
	});

	if (speakBtn && spectrum) {
		let disposeVoiceState: (() => void) | undefined;
		// Whether the voice for the target language is already downloaded. Until the
		// host probe answers we assume it is (no premature download prompt). When
		// false and idle, the Listen button becomes a "Download voice" affordance.
		let voiceReady = true;
		let lastVoiceState: VoiceState = 'idle';
		// Real playback runs in the extension host (Piper TTS, sharing the ATM
		// extension's downloaded engine/voice). The button mirrors broadcast
		// voice.state events: CSS swaps the idle label for the animated bars
		// (and a stop glyph on hover) while actually speaking.
		const applyVoiceState = (state: VoiceState, message?: string, progress?: VoiceProgress) => {
			lastVoiceState = state;
			// Reaching playback means the model is present now (any download just
			// finished) — drop the download affordance for the rest of the session.
			if (state === 'speaking') {
				voiceReady = true;
			}
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

			// Idle + the voice isn't downloaded yet → "Download voice" affordance.
			const needsDownload = !voiceReady && !isSpeaking && !isPaused && !isPreparingVoice;
			speakBtn.classList.toggle('needs-download', needsDownload);

			if (speakIdleLabel) {
				speakIdleLabel.textContent = isPreparingVoice ? 'Preparing'
					: isPaused ? 'Resume'
					: needsDownload ? 'Download voice'
					: 'Listen';
			}
			if (speakIdleIcon) {
				speakIdleIcon.className = isPaused ? 'ti ti-player-play-filled'
					: needsDownload ? 'ti ti-download'
					: 'ti ti-volume-2';
			}

			const label = isPreparingVoice ? 'Preparing voice…'
				: isSpeaking ? 'Pause'
				: isPaused ? 'Resume'
				: needsDownload ? 'Download voice'
				: 'Listen';
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

		// Probe whether this language's voice is downloaded; if not, the Listen
		// button flips to the download affordance (re-render with the same state).
		void context.checkVoiceReady?.(targetLang).then((ready) => {
			voiceReady = ready;
			applyVoiceState(lastVoiceState);
		});

		// Shared by the Listen button and the Space shortcut: resume if paused,
		// pause if speaking, otherwise start reading the current translation. The
		// preparing / no-result guards let the keyboard path respect the same
		// constraints the disabled button already enforces for clicks.
		const toggleSpeak = () => {
			if (isPreparingVoice) {
				return;
			}
			if (isPaused) {
				context.resumeSpeech?.();
				return;
			}
			if (isSpeaking) {
				context.pauseSpeech?.();
				return;
			}
			if (!hasResult || !textEl || !context.speakText) {
				return;
			}
			clearVoiceHighlights(activeVoiceChunks);
			activeVoiceChunks = buildVoiceChunks(textEl);
			const chunks = activeVoiceChunks.map((chunk) => chunk.text);
			const value = chunks.join('\n\n');
			if (value) {
				// Read in the same language shown on screen (the chosen target).
				context.speakText(value, { chunks, lang: targetLang });
			}
		};

		speakBtn.addEventListener('click', toggleSpeak);

		// Auto-read implementation: while "auto" is on, read the current result once
		// it's idle. toggleSpeak triggers the download itself when the voice is
		// missing (auto-download → read), so this stays a single entry point.
		triggerAutoRead = () => {
			if (!autoTranslate || !hasResult || autoReadConsumed) {
				return;
			}
			if (isSpeaking || isPaused || isPreparingVoice) {
				return;
			}
			autoReadConsumed = true;
			toggleSpeak();
		};

		// A translation may have been revealed before this voice setup ran (e.g. a
		// cache hit on auto-open) — catch that result now.
		triggerAutoRead();

		// Space = play/pause while the translator is open. The modal has no text
		// field so Space is free to claim — but only when there's something to play
		// or playback is live; otherwise we leave the default (e.g. scrolling a long
		// translation). preventDefault stops the page scroll and the native button
		// activation, so Space never double-fires when Listen happens to have focus.
		const handleSpaceShortcut = (event: KeyboardEvent) => {
			// Key match lives in the shared registry (src/shared/keymaps/cli.ts:
			// 'toggleVoicePlayback') so this handler and the keymaps modal stay in
			// sync; spaceKey() already rejects modifier combos like Ctrl+Space.
			if (!matchesShortcut(event, 'toggleVoicePlayback') || event.repeat) {
				return;
			}
			if (isPreparingVoice || (!hasResult && !isSpeaking && !isPaused)) {
				return;
			}
			event.preventDefault();
			toggleSpeak();
		};
		document.addEventListener('keydown', handleSpaceShortcut);

		voiceExtraBtn?.addEventListener('click', () => {
			if (isSpeaking || isPaused) {
				context.stopSpeech?.();
			}
		});

		return () => {
			document.removeEventListener('keydown', handleSpaceShortcut);
			disposeVoiceState?.();
			clearVoiceHighlights(activeVoiceChunks);
		};
	}

	return undefined;
}

function extractTextToTranslate(context: ToolContext): string {
	return context.getTerminalSelection?.() || '';
}

// Split prose into trimmed, non-empty paragraphs on blank lines. Shared by the
// populate (after a block translates) and the reuse lookup so their keys line up.
function splitIntoParagraphs(text: string): string[] {
	return text.split(/\n[ \t]*\n+/).map((part) => part.trim()).filter((part) => part.length > 0);
}

// Rebuild a selection purely from cached paragraphs, or undefined if any paragraph
// is missing (incl. code/tree lines, which are never paragraph-cached). Returning
// undefined on the first miss is the safety guard: we only ever serve a result when
// every piece is a known translation, so a partial/altered selection re-translates
// instead of showing something wrong.
function reconstructFromParagraphs(target: string, sourceText: string): string | undefined {
	const paragraphs = splitIntoParagraphs(sourceText);
	if (paragraphs.length === 0) {
		return undefined;
	}

	const translated: string[] = [];
	for (const paragraph of paragraphs) {
		const cached = getCachedParagraph(target, paragraph);
		if (cached === undefined) {
			return undefined;
		}
		translated.push(cached);
	}

	return translated.join('\n\n');
}

// Cache each paragraph of a freshly translated block — but only when the source and
// the translation split into the *same* number of paragraphs. Machine translation
// can merge or split paragraphs; an unequal count means we can't trust the 1:1
// alignment, so we skip (the whole-selection cache still covers the full block).
function cacheParagraphPairs(target: string, source: string, translated: string): void {
	const sourceParagraphs = splitIntoParagraphs(source);
	const translatedParagraphs = splitIntoParagraphs(translated);
	if (sourceParagraphs.length === 0 || sourceParagraphs.length !== translatedParagraphs.length) {
		return;
	}

	for (let i = 0; i < sourceParagraphs.length; i += 1) {
		setCachedParagraph(target, sourceParagraphs[i], translatedParagraphs[i]);
	}
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
