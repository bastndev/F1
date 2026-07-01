import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import loadingStyles from '../../styles/skeleton/translator-loading.css';
import type { ToolContext } from '../tools';
import type { VoiceProgress, VoiceState } from '../../../shared/voice/voice-types';
import { translateEnTo } from './browser-terminal-translator';
import { renderMarkdownLite } from './markdown-lite';
import { segmentTerminalSelection, isMarkdownStructuredLine } from './terminal-text';
import { getCachedTranslation, setCachedTranslation, getCachedParagraph, setCachedParagraph } from './translator-cache';
import { matchesShortcut } from '../../../../shared/keymaps/cli';
import { getStoredPromptLang } from '../modal-prompt/language-select';
import { getPromptLanguage } from '../../../shared/prompt';

const stylesId = 'cli-translator-panel-styles';
const maxVoiceChunkChars = 900;
let voiceScrollDebounceTimer: ReturnType<typeof setTimeout> | undefined;
// A voice chunk shorter than this is too small to read on its own. When it falls
// at the very end of an answer it's folded into the previous chunk instead of
// being spoken (and highlighted) as a lonely fragment.
const minVoiceChunkChars = 200;
// Target size for a streamed translation block. Mirrors the voice chunk size
// and the host's long-text threshold: blocks this big translate in one fast
// pass yet are small enough that a long answer arrives in several pieces.
const maxStreamBlockChars = 900;

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

// ── Markdown protection through translation ───────────────────────
// Translation APIs destroy markdown formatting (headings, emoji labels,
// score tables, etc.). This layer detects structured lines and translates
// only their content, preserving markers for renderMarkdownLite.

type MarkdownLine = {
	marker: string;     // everything before the translatable content
	content: string;    // the text the API should translate
};

// Matches a line with a heading prefix: ## Title / ### Subtitle
const headingPattern = /^(#{1,6})\s+(.*)$/;

// Matches a line starting with an emoji followed by content
const emojiPrefixPattern = /^(\p{Emoji_Presentation}+\s*)(.*)/u;

// Matches a bracket label: [end] / [fin] / [start]
const bracketLabelPattern = /^(\[[\w\s]+\]\s*)(.*)$/;

// Matches a blockquote: > text
const blockquotePattern = /^(>\s*)(.*)$/;

// Matches a score line: emoji + label + N/10 pattern
const scoreLinePattern = /^(\p{Emoji_Presentation}+\s*\S+\s+)(\d{1,2}\/10)\s*$/u;

function parseMarkdownLine(line: string): MarkdownLine | null {
	const trimmed = line.trim();
	if (!trimmed || !isMarkdownStructuredLine(trimmed)) {
		return null;
	}

	// Score lines: "🏗️ Architecture 8/10" → protect marker + score
	const scoreMatch = trimmed.match(scoreLinePattern);
	if (scoreMatch) {
		return { marker: scoreMatch[1], content: scoreMatch[2] };
	}

	// Heading: "## Title" → protect "## " prefix
	const headingMatch = trimmed.match(headingPattern);
	if (headingMatch) {
		return { marker: `${headingMatch[1]} `, content: headingMatch[2] };
	}

	// Bracket label: "[end] Health Overview" → protect "[end] "
	const bracketMatch = trimmed.match(bracketLabelPattern);
	if (bracketMatch) {
		return { marker: bracketMatch[1], content: bracketMatch[2] };
	}

	// Emoji prefix: "🔍 Project Understanding" → protect emoji
	const emojiMatch = trimmed.match(emojiPrefixPattern);
	if (emojiMatch) {
		return { marker: emojiMatch[1], content: emojiMatch[2] };
	}

	// Blockquote: "> text" → protect "> "
	const quoteMatch = trimmed.match(blockquotePattern);
	if (quoteMatch) {
		return { marker: quoteMatch[1], content: quoteMatch[2] };
	}

	return null;
}

// True when a string has letters worth translating. Bare scores/counts like
// "8/10" or "[0]" translate to themselves, so we skip the network round-trip.
function hasTranslatableText(text: string): boolean {
	return /\p{L}/u.test(text);
}

// ── Voice chunking ───────────────────────────────────────────────────
// A voice chunk is one reading unit: the blue band highlights it while the host
// reads it aloud. Rather than greedily packing ~900 chars across many sections
// (which made the first read swallow the whole dashboard + several paragraphs),
// chunks follow the answer's STRUCTURE: a run of "openers" (headings, emoji /
// score labels) attaches to the first "body" block that follows it — heading +
// a bit of context — and a second body starts a new chunk. So the first read is
// "title and a little context", and the highlight marks exactly that.

// Openers are short structural lines that introduce what comes next; they ride
// along with the following body instead of ending a chunk. Everything else
// (paragraphs, lists, tables, code, quotes) is a body that closes the unit.
const voiceOpenerSelector = '.md-h, .md-emoji-item, .md-score-item, .md-hr';
const isVoiceOpener = (element: HTMLElement): boolean => element.matches(voiceOpenerSelector);

// Groups rendered blocks into structural units. `add` returns a unit when the
// block it's given starts a new one (so the caller can stream it); `flush`
// yields the final, still-open unit.
function createVoiceUnitAccumulator() {
	let current: TranslatorVoiceChunk | null = null;
	let currentHasBody = false;

	return {
		add(element: HTMLElement): TranslatorVoiceChunk | null {
			const text = normalizeSpeechText(element.textContent || '');
			if (!text) {
				return null; // rules and empty nodes carry no speech
			}
			const isBody = !isVoiceOpener(element);

			// The current unit already holds a body, so this block — opener or
			// body — belongs to the next one.
			if (current && currentHasBody) {
				const completed = current;
				current = { text, elements: [element] };
				currentHasBody = isBody;
				return completed;
			}

			if (current) {
				current.text = `${current.text}\n\n${text}`;
				current.elements.push(element);
				currentHasBody = currentHasBody || isBody;
			} else {
				current = { text, elements: [element] };
				currentHasBody = isBody;
			}
			return null;
		},
		flush(): TranslatorVoiceChunk | null {
			const completed = current;
			current = null;
			currentHasBody = false;
			return completed;
		},
	};
}

// A unit larger than a single chunk (a very long paragraph) is split into
// speakable pieces that all map back to the same element(s) — keeping every
// chunk under the host's split threshold so its progress index stays aligned
// with this list for highlighting.
function unitToVoiceChunks(unit: TranslatorVoiceChunk): TranslatorVoiceChunk[] {
	if (unit.text.length <= maxVoiceChunkChars) {
		return [unit];
	}
	return splitSpeechText(unit.text).map((piece) => ({ text: piece, elements: unit.elements }));
}

function mergeVoiceUnits(first: TranslatorVoiceChunk, second: TranslatorVoiceChunk): TranslatorVoiceChunk {
	return {
		text: `${first.text}\n\n${second.text}`,
		elements: [...first.elements, ...second.elements],
	};
}

// Fold a too-small trailing unit into its predecessor so a little leftover text
// is read together with the block before it instead of on its own.
function mergeTrailingVoiceUnit(units: TranslatorVoiceChunk[]): TranslatorVoiceChunk[] {
	if (units.length < 2) {
		return units;
	}
	const last = units[units.length - 1];
	if (last.text.length >= minVoiceChunkChars) {
		return units;
	}
	const previous = units[units.length - 2];
	return [...units.slice(0, -2), mergeVoiceUnits(previous, last)];
}

function buildVoiceChunks(textEl: HTMLElement): TranslatorVoiceChunk[] {
	const renderedBlocks = Array.from(textEl.children).filter(
		(element): element is HTMLElement =>
			element instanceof HTMLElement && !element.classList.contains('translator-streaming'),
	);
	const sourceBlocks = renderedBlocks.length ? renderedBlocks : [textEl];

	const accumulator = createVoiceUnitAccumulator();
	const units: TranslatorVoiceChunk[] = [];
	for (const element of sourceBlocks) {
		const completed = accumulator.add(element);
		if (completed) {
			units.push(completed);
		}
	}
	const tail = accumulator.flush();
	if (tail) {
		units.push(tail);
	}

	return mergeTrailingVoiceUnit(units).flatMap(unitToVoiceChunks);
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
	const target = chunk.elements[0];
	if (target) {
		// Debounce scrolling so rapid chunk advances don't fight the user's
		// own scrolling through the translation.
		if (voiceScrollDebounceTimer) {
			clearTimeout(voiceScrollDebounceTimer);
		}
		voiceScrollDebounceTimer = setTimeout(() => {
			voiceScrollDebounceTimer = undefined;
			target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}, 80);
	}
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
	let isMounted = true;
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
	const storedLang = getStoredPromptLang();
	const targetLang = storedLang ?? 'en';
	const targetInfo = getPromptLanguage(targetLang);
	const targetLabel = targetInfo?.label ?? 'English';

	// Empty-state copy: with no language chosen yet there's nothing to translate
	// to, so point the user at the prompt's picker instead of saying "translate to
	// English" (which would read as a no-op). Once a language is set, the normal
	// "select text →" hint applies.
	const emptyStateMessage = storedLang
		? `Select or copy text in the terminal to translate it to ${targetLabel}.`
		: 'Pick a language in the prompt (🌐) to translate CLI output.';

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
	// Pending "settle" after a streamed translation finishes growing — cleared
	// if a new translation starts before it fires (see performTranslation).
	let growSettleTimer: ReturnType<typeof setTimeout> | undefined;
	// Generation counter so a newer translation can supersede an older one
	// still in flight (e.g. user clicks Translate twice or toggles auto).
	let translationGeneration = 0;
	// Memoize voice chunks against the rendered HTML so Listen doesn't rebuild
	// the same chunk list every time.
	let voiceChunksSource = '';

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
		// A new translation replaces whatever was being read aloud; stop the old
		// playback so a new answer doesn't talk over the previous one.
		context.stopSpeech?.();
		// Cancel any pending voice scroll from a previous read.
		if (voiceScrollDebounceTimer) {
			clearTimeout(voiceScrollDebounceTimer);
			voiceScrollDebounceTimer = undefined;
		}
		// A new translation re-arms auto-read (the previous result was its own).
		autoReadConsumed = false;
		// Invalidate any cached voice chunks — the rendered text is about to change.
		voiceChunksSource = '';
		// Bump the generation so any previous in-flight translation knows it was
		// superseded and stops touching state/DOM.
		const generation = ++translationGeneration;
		const isCurrentTranslation = () => generation === translationGeneration && isMounted;
		// Cancel a pending grow-settle from a previous run and reset the body to a
		// clean slate (the height lock below takes over).
		if (growSettleTimer) {
			clearTimeout(growSettleTimer);
			growSettleTimer = undefined;
		}
		if (bodyEl) {
			bodyEl.classList.remove('is-streaming-grow');
			bodyEl.style.height = '';
		}
		const extracted = extractTextToTranslate(context);
		if (!extracted) {
			if (textEl) {
				textEl.classList.remove('is-rendered');
				textEl.textContent = emptyStateMessage;
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

		// A newer translation may have started while we were reading context state.
		if (!isCurrentTranslation()) {
			return;
		}

		// Already translated this exact selection? Restore it instantly — no
		// skeleton, no host round-trip, no re-translation. (Cache is RAM-only and
		// dies with the panel; see translator-cache.ts.)
		const cached = getCachedTranslation(targetLang, extracted);
		if (cached) {
			if (!isCurrentTranslation()) {
				return;
			}
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
			if (!isCurrentTranslation()) {
				return;
			}
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

		if (!isCurrentTranslation()) {
			return;
		}

		// Adaptive loading: a short selection (1–2 non-empty lines) gets a
		// minimal inline indicator — just the typing dots sitting where the
		// result will appear, barely taller than the text itself (no skeleton
		// box, no shimmer lines, no height lock). A longer selection gets the
		// full skeleton sized to its rendered height so the modal only grows
		// once real content streams in.
		const sourceLineCount = extracted.split('\n').filter((line) => line.trim()).length;
		const isShortSelection = sourceLineCount <= 2;

		if (translateBtn) {
			translateBtn.disabled = true;
		}
		clearVoiceHighlights(activeVoiceChunks);
		activeVoiceChunks = [];
		modalEl.classList.add('is-translating');
		textEl.classList.remove('placeholder', 'is-rendered');

		if (isShortSelection) {
			// No height lock — the body stays at its natural content height so
			// the loading state is as tall as the typing dots alone.
			textEl.replaceChildren(buildInlineLoading());
			setStatus('translating…');
		} else {
			const measuredHeight = bodyEl?.offsetHeight ?? 0;
			const lockedHeight = Math.max(80, Math.min(220, measuredHeight || 120));
			if (bodyEl) {
				bodyEl.style.height = `${lockedHeight}px`;
			}
			textEl.replaceChildren(buildSkeleton(lockedHeight, sourceLineCount));
			setStatus('translating…');
		}

		// Accumulated result (for the Copy button + the exact-selection cache)
		// and the progressive-stream state. Translated blocks are staged in a
		// small buffer and flushed as a cohesive chunk, so the skeleton stays
		// visible until there is enough content for a smooth, premium reveal
		// rather than content dribbling in one block at a time.
		const renderedParts: string[] = [];
		const copyParts: string[] = [];
		let provider: string | undefined;
		let codeCount = 0;
		let streamStarted = false;

		// Voice pipeline (auto mode): read each finished unit aloud while the rest
		// of the answer is still translating, instead of waiting for the whole
		// thing. A completed unit is held back one step so a small final unit can
		// merge into it (mergeTrailingVoiceUnit) before either is spoken.
		const createVoiceStreamPipeline = () => {
			const accumulator = createVoiceUnitAccumulator();
			let buffered: TranslatorVoiceChunk | null = null;
			let started = false;

			const send = (unit: TranslatorVoiceChunk, final: boolean) => {
				const chunks = unitToVoiceChunks(unit);
				// Highlight list must mirror the host's chunk order, so push as we send.
				activeVoiceChunks.push(...chunks);
				const reset = !started;
				started = true;
				context.appendSpeech?.(chunks.map((chunk) => chunk.text), { final, reset, lang: targetLang });
			};

			return {
				feed(elements: HTMLElement[]) {
					for (const element of elements) {
						const completed = accumulator.add(element);
						if (!completed) {
							continue;
						}
						if (buffered) {
							send(buffered, false);
						}
						buffered = completed;
					}
				},
				finish() {
					const last = accumulator.flush();
					let tail: TranslatorVoiceChunk[];
					if (buffered && last) {
						tail = mergeTrailingVoiceUnit([buffered, last]);
					} else if (buffered) {
						tail = [buffered];
					} else if (last) {
						tail = [last];
					} else {
						tail = [];
					}
					buffered = null;
					if (!tail.length) {
						// Nothing left to send; close the live session if we opened one.
						if (started) {
							context.appendSpeech?.([], { final: true, lang: targetLang });
						}
						return;
					}
					tail.forEach((unit, index) => send(unit, index === tail.length - 1));
				},
			};
		};

		// Stream the reading only in auto mode (and only if the host supports it).
		// reset:true on the first append supersedes any prior playback, so a quick
		// re-translate can't splice a new answer onto the old one.
		const streamVoice = autoTranslate && typeof context.appendSpeech === 'function';
		const voicePipeline = streamVoice ? createVoiceStreamPipeline() : undefined;

		// The body height is animated to fit the content as blocks land, so the
		// modal grows smoothly with the translation instead of sitting skeleton-
		// sized until the very end. maxBodyHeight caps the grow at the panel's
		// spare room; past it the body scrolls (restored when the grow settles).
		let maxBodyHeight = Number.POSITIVE_INFINITY;
		let growScheduled = false;

		const applyBodyHeight = () => {
			if (bodyEl) {
				bodyEl.style.height = `${Math.min(bodyEl.scrollHeight, maxBodyHeight)}px`;
			}
		};

		// Coalesce the per-block height writes into one per frame — several short
		// blocks (scores, labels) can land in the same tick.
		const scheduleGrow = () => {
			if (growScheduled) {
				return;
			}
			growScheduled = true;
			requestAnimationFrame(() => {
				growScheduled = false;
				if (isMounted) {
					applyBodyHeight();
				}
			});
		};

		// First block: drop the skeleton, switch the field to rendered mode, pin a
		// small "more on the way" indicator that subsequent blocks insert in front
		// of, and arm the smooth grow (measuring the panel's spare room first).
		const beginStream = () => {
			streamStarted = true;
			textEl.replaceChildren();
			textEl.classList.remove('placeholder');
			textEl.classList.add('is-rendered');
			textEl.append(buildStreamIndicator());
			if (bodyEl && modalEl) {
				const available = modalEl.parentElement?.clientHeight ?? 0;
				const chrome = modalEl.offsetHeight - bodyEl.offsetHeight;
				maxBodyHeight = available > 0 ? Math.max(0, available - chrome) : Number.POSITIVE_INFINITY;
				bodyEl.style.maxHeight = `${maxBodyHeight}px`;
				bodyEl.classList.add('is-streaming-grow');
			}
		};

		// Instead of revealing every translated block the instant it lands, we stage
		// blocks in a short buffer and flush them as a cohesive chunk. The skeleton
		// stays visible while buffering, then a batch of blocks crossfades in with a
		// staggered reveal — a much cleaner, premium feel than content dribbling in.
		const maxStagedBlocks = 4;
		const stageRevealDelayMs = 420;
		const stagedBlocks: { markdown: string; copy: string }[] = [];
		let stageFlushTimer: ReturnType<typeof setTimeout> | undefined;

		const flushStagedBlocks = () => {
			if (stageFlushTimer) {
				clearTimeout(stageFlushTimer);
				stageFlushTimer = undefined;
			}
			if (!stagedBlocks.length) {
				return;
			}
			if (!isCurrentTranslation()) {
				stagedBlocks.length = 0;
				return;
			}
			if (!streamStarted) {
				beginStream();
			}
			if (!isCurrentTranslation()) {
				stagedBlocks.length = 0;
				return;
			}

			const blocksToEmit = stagedBlocks.splice(0);
			const indicator = textEl.querySelector('.translator-streaming');
			const fragment = document.createDocumentFragment();
			const insertedElements: HTMLElement[] = [];
			let staggerIndex = 0;

			for (const { markdown, copy } of blocksToEmit) {
				renderedParts.push(markdown);
				copyParts.push(copy);
				const template = document.createElement('template');
				template.innerHTML = renderMarkdownLite(markdown);
				for (const node of Array.from(template.content.childNodes)) {
					if (node instanceof HTMLElement) {
						node.classList.add('is-block-in');
						node.style.animationDelay = `${staggerIndex * 45}ms`;
						node.addEventListener('animationend', () => {
							node.classList.remove('is-block-in');
							node.style.animationDelay = '';
						}, { once: true });
						insertedElements.push(node);
						staggerIndex += 1;
					}
					fragment.appendChild(node);
				}
			}
			textEl.insertBefore(fragment, indicator);
			scheduleGrow();
			// Feed the rendered blocks to the voice stream so reading can begin
			// before the rest of the answer finishes translating.
			voicePipeline?.feed(insertedElements);
		};

		const stageBlock = (markdown: string, copy: string) => {
			if (!isCurrentTranslation()) {
				return;
			}
			stagedBlocks.push({ markdown, copy });
			if (stagedBlocks.length >= maxStagedBlocks) {
				flushStagedBlocks();
			} else if (!stageFlushTimer) {
				stageFlushTimer = setTimeout(() => {
					stageFlushTimer = undefined;
					flushStagedBlocks();
				}, stageRevealDelayMs);
			}
		};

		try {
			// Split the selection into translatable prose and verbatim frames
			// (tree diagrams). Box tables arrive as pipe markdown inside prose;
			// trees skip translation entirely and render as monospace blocks.
			const segments = segmentTerminalSelection(extracted);
			if (!segments.length) {
				segments.push({ kind: 'prose', content: extracted });
			}

			for (const segment of segments) {
				if (!isCurrentTranslation()) {
					return;
				}

				if (segment.kind === 'diagram') {
					stageBlock(`\`\`\`tree\n${segment.content}\n\`\`\``, segment.content);
					continue;
				}

				if (segment.kind === 'code') {
					codeCount += 1;
					stageBlock(`[[code-here:${codeCount}]]`, `[code here #${codeCount}]`);
					continue;
				}

				// Prose segment: translate in as few requests as possible while
				// protecting markdown markers. Consecutive plain lines (and the
				// blanks between them) are gathered, then split into voice-sized
				// blocks so the host translates each in one shot (chunking it
				// further by paragraph) and we stream it in as it returns — far
				// fewer, larger round-trips than line-by-line, and a better
				// translation (whole sentences, not hard-wrapped fragments). Only
				// the few structured lines (headings, emoji labels, scores) are
				// translated on their own so their markers can be rebuilt.
				const lines = segment.content.split('\n');
				let plainRun: string[] = [];

				const flushPlainRun = async () => {
					if (!plainRun.length) {
						return;
					}
					const runText = plainRun.join('\n');
					plainRun = [];
					for (const block of splitForStreaming(runText)) {
						if (!isCurrentTranslation()) {
							return;
						}
						const result = await translateSelection(block);
						provider ??= result.provider;
						const value = result.text || block;
						stageBlock(value, value);
						if (value.trim()) {
							cacheParagraphPairs(targetLang, block, value);
						}
					}
				};

				for (const line of lines) {
					if (!isCurrentTranslation()) {
						return;
					}
					const parsed = line.trim() ? parseMarkdownLine(line) : null;
					if (!parsed) {
						// Plain or blank line — batch it into the current block.
						plainRun.push(line);
						continue;
					}

					// Structured line: flush the pending prose first, then translate
					// just its content (keeping the marker). Content with no letters —
					// a bare "8/10" score, "[0]" — would translate to itself, so skip
					// the round-trip entirely.
					await flushPlainRun();
					if (!isCurrentTranslation()) {
						return;
					}
					let translatedContent = parsed.content;
					if (hasTranslatableText(parsed.content)) {
						const result = await translateSelection(parsed.content);
						provider ??= result.provider;
						translatedContent = result.text || parsed.content;
					}
					stageBlock(`${parsed.marker}${translatedContent}`, `${parsed.marker}${translatedContent}`);
				}
				await flushPlainRun();
			}

			if (!isCurrentTranslation()) {
				return;
			}

			// Flush any final staged blocks before settling the UI.
			flushStagedBlocks();

			const renderedMarkdown = renderedParts.join('\n\n');
			copyText = copyParts.join('\n\n');
			if (streamStarted) {
				// Streaming already drew the result; retire the indicator and grow
				// one last time to the final content height.
				textEl.querySelector('.translator-streaming')?.remove();
				applyBodyHeight();
			} else {
				// Nothing emitted (empty translation) — show the plain result.
				revealText(textEl, renderedMarkdown);
			}
			resultStatus = provider ? `translated · ${provider.toLowerCase()}` : 'translated';
			setStatus(resultStatus);
			enableResultActions();
			if (voicePipeline) {
				// Streaming read already started during translation — flush the tail
				// (with the small-final-unit merge) and close the session.
				voicePipeline.finish();
			} else {
				triggerAutoRead();
			}
			// Remember this exact selection so revisiting it skips the round-trip.
			setCachedTranslation(targetLang, extracted, { rendered: renderedMarkdown, copyText, status: resultStatus });
		} catch (err) {
			if (!isCurrentTranslation()) {
				return;
			}
			console.error('[Translator] EN->ES failed:', err);
			// Surface any blocks that were translated but still buffered when the
			// error happened, so the user isn't left with an empty or pure-skeleton
			// view for no reason.
			flushStagedBlocks();
			textEl.querySelector('.translator-streaming')?.remove();
			if (streamStarted && renderedParts.length) {
				// Keep whatever already streamed in — the user can still read and
				// copy the translated portion; only the status flags the failure.
				copyText = copyParts.join('\n\n');
			} else {
				// Failed before anything showed — fall back to the source text so
				// copying/listening still makes sense.
				copyText = extracted;
				revealText(textEl, extracted);
			}
			resultStatus = 'translation failed';
			setStatus(resultStatus);
			enableResultActions();
			// Read whatever did stream in before the failure, then close the session.
			voicePipeline?.finish();
			// Failed attempts may be transient (rate limit, network) — allow retry.
			if (translateBtn) {
				translateBtn.disabled = false;
			}
		} finally {
			// If a newer translation is already running, leave its UI state alone.
			if (generation !== translationGeneration) {
				return;
			}
			if (stageFlushTimer) {
				clearTimeout(stageFlushTimer);
				stageFlushTimer = undefined;
			}
			modalEl.classList.remove('is-translating');
			if (bodyEl) {
				if (streamStarted) {
					// Let the final grow finish animating, then drop the explicit
					// height (now equal to the content, so no jump) and re-enable
					// scrolling for results taller than the panel.
					const body = bodyEl;
					growSettleTimer = setTimeout(() => {
						growSettleTimer = undefined;
						body.style.height = '';
						body.classList.remove('is-streaming-grow');
					}, 380);
				} else if (bodyEl.style.height) {
					// A height was locked (long selection, no streaming). Ease it
					// to the result instead of snapping — so the modal settles
					// smoothly to the final content height.
					const body = bodyEl;
					body.classList.add('is-streaming-grow');
					body.style.height = `${body.scrollHeight}px`;
					growSettleTimer = setTimeout(() => {
						growSettleTimer = undefined;
						body.style.height = '';
						body.classList.remove('is-streaming-grow');
					}, 380);
				}
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
			textEl.textContent = emptyStateMessage;
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
		const rebuildVoiceChunksIfNeeded = () => {
			if (!textEl) {
				return;
			}
			const source = textEl.innerHTML;
			if (activeVoiceChunks.length > 0 && voiceChunksSource === source) {
				return;
			}
			voiceChunksSource = source;
			clearVoiceHighlights(activeVoiceChunks);
			activeVoiceChunks = buildVoiceChunks(textEl);
		};

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
			rebuildVoiceChunksIfNeeded();
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
			isMounted = false;
			document.removeEventListener('keydown', handleSpaceShortcut);
			disposeVoiceState?.();
			clearVoiceHighlights(activeVoiceChunks);
			if (voiceScrollDebounceTimer) {
				clearTimeout(voiceScrollDebounceTimer);
				voiceScrollDebounceTimer = undefined;
			}
		};
	}

	return () => {
		isMounted = false;
	};
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

// Break a run of prose into voice-sized blocks on paragraph boundaries so a
// long translation streams in piece by piece instead of arriving in one slow
// lump. Paragraphs are grouped up to maxStreamBlockChars; a single paragraph
// longer than that is left whole (the host chunks it further internally).
function splitForStreaming(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}
	if (trimmed.length <= maxStreamBlockChars) {
		return [trimmed];
	}

	const paragraphs = trimmed.split(/\n[ \t]*\n+/).map((part) => part.trim()).filter(Boolean);
	const blocks: string[] = [];
	let current = '';

	for (const paragraph of paragraphs) {
		if (!current) {
			current = paragraph;
			continue;
		}
		if (current.length + paragraph.length + 2 > maxStreamBlockChars) {
			blocks.push(current);
			current = paragraph;
		} else {
			current = `${current}\n\n${paragraph}`;
		}
	}
	if (current) {
		blocks.push(current);
	}
	return blocks;
}

// Compact "still translating" affordance pinned below the streamed blocks —
// a shimmer line plus the skeleton's typing dots, so the loading state reads
// as one language whether it's the full skeleton or the streaming tail.
function buildStreamIndicator(): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-streaming';
	wrap.setAttribute('aria-hidden', 'true');

	const line = document.createElement('div');
	line.className = 't-skel-line med';
	wrap.append(line);

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

// Minimal inline loading indicator for short selections — just the typing
// dots (› ···) with no skeleton box, no shimmer lines, no scan beam. Sits
// where the result will appear, barely taller than the text itself, so a
// one-line selection gets a loading state with no empty space and no jump.
function buildInlineLoading(): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-inline-loading';
	wrap.setAttribute('aria-hidden', 'true');

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

function buildSkeleton(availableHeight: number, lineHint?: number): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'translator-skeleton';
	wrap.setAttribute('aria-hidden', 'true');

	// The skeleton sizes to the locked loading box so the scan beam covers it,
	// but the shimmer lines + typing dots pack tightly at the top (see CSS:
	// .t-skel-lines is flex: 0 0 auto) — so a small selection gets a minimal
	// cluster with no gap, not a tall stretched placeholder. The body padding
	// is tightened during translation (10px top/bottom), so subtract 20.
	const contentHeight = Math.max(26, Math.min(200, availableHeight - 20));
	wrap.style.height = `${contentHeight}px`;

	const scan = document.createElement('div');
	scan.className = 't-skel-scan';
	wrap.append(scan);

	const lines = document.createElement('div');
	lines.className = 't-skel-lines';
	wrap.append(lines);

	// Scale the shimmer line count to the source text so a one-line selection
	// gets a minimal skeleton (a single line + the typing dots) and a long
	// selection gets a fuller one. The hint is clamped, then capped by what the
	// box can hold.
	const pattern = ['full', 'full', 'long', 'full', 'med', 'full', 'long'];
	const hinted = lineHint && lineHint > 0 ? Math.min(8, lineHint) : 2;
	const lineCount = Math.min(hinted, Math.max(1, Math.floor((contentHeight - 22) / 16)));

	for (let i = 0; i < lineCount; i += 1) {
		const line = document.createElement('div');
		line.className = `t-skel-line ${pattern[i % pattern.length]}`;
		if (i > 0 && i % 3 === 0) {
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
