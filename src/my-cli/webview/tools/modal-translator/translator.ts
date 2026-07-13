import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import loadingStyles from '../../styles/skeleton/translator-loading.css';
import type { ToolContext } from '../tools';
import type { VoiceProgress, VoiceState } from '../../../shared/voice/voice-types';
import { translateEnTo } from './browser-terminal-translator';
import { renderMarkdownLite } from './markdown-lite';
import { segmentTerminalSelection, isMarkdownStructuredLine, emojiRunSource, hasTranslatableContent } from './terminal-text';
import { getCachedTranslation, setCachedTranslation, getCachedParagraph, setCachedParagraph } from './translator-cache';
import { buildInlineLoading, buildSkeleton, createStreamRenderer, getGrowSettleMs } from './stream-render';
import { matchesShortcut } from '../../../../shared/keymaps/cli';
import { getStoredPromptLang } from '../modal-prompt/language-select';
import { getPromptLanguage } from '../../../shared/prompt';
import { buildVoiceChunks, clearVoiceHighlights, setActiveVoiceChunk, createVoiceUnitAccumulator, unitToVoiceChunks, mergeTrailingVoiceUnit, listItemsOf, cancelVoiceScroll, type TranslatorVoiceChunk } from './voice-chunks';

const stylesId = 'cli-translator-panel-styles';
// Target size for a streamed translation block. Mirrors the voice chunk size
// and the host's long-text threshold: blocks this big translate in one fast
// pass yet are small enough that a long answer arrives in several pieces.
const maxStreamBlockChars = 900;
// List items are batched into ~4-item / ~400-char groups for translation and
// rendering, so a long list arrives as a few compact <ol>/<ul> blocks (one
// network round-trip each) rather than one item at a time. The voice reading
// band is finer-grained — one item at a time — built in the voice chunking.
const maxListBatchItems = 4;
const maxListBatchChars = 400;

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = `${translatorStyles}\n${loadingStyles}`;
	document.head.append(style);
};

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
const emojiPrefixPattern = new RegExp(`^(${emojiRunSource}\\s*)(.*)`, 'u');

// Matches a bracket label: [end] / [fin] / [start]
const bracketLabelPattern = /^(\[[\w\s]+\]\s*)(.*)$/;

// Matches a blockquote: > text
const blockquotePattern = /^(>\s*)(.*)$/;

// Matches a score line: emoji + label + N/10 pattern. The label may be several
// words ("🧹 Code Quality 8/10") — lazy up to the anchored trailing score.
const scoreLinePattern = new RegExp(`^(${emojiRunSource}\\s*\\S.*?\\s+)(\\d{1,2}\\/10)\\s*$`, 'u');

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

// ── Plan-approval detection ───────────────────────────────────────
// The trailing "shall I start?" an assistant appends when a plan is ready and it's
// waiting for a green light. Detected on the ENGLISH source (CLI output is always
// English — only the panel is translated) so it's target-language-independent, and
// only over the last few non-empty lines so a mid-plan "proceed to step 2" never
// trips it. Conservative by design: a false positive fires "go" into a normal chat.
const approvalWord = 'go';

// Action verbs that read as "begin the substantive work"; one list so the vocab
// grows in a single place. "go" is intentionally excluded here — it's allowed only
// after "ready to __"; "i'll go" would false-match "i'll go through the code".
const beginVerb = 'start|begin|proceed|implement|build|create|apply|wire|ship|generate';

const approvalCuePattern = new RegExp(
	[
		'\\b(?:shall|should|can|may|do you want|would you like)\\s+(?:i|we|me|you)\\b',
		'\\b(?:want|would like)\\s+me\\s+to\\b',
		'\\b(?:let me know|say the word|just say (?:the word|go)|give me the (?:green light|go[- ]?ahead))\\b',
		`\\b(?:ready|good|set|all set)\\s+to\\s+(?:${beginVerb}|go)\\b`,
		'\\b(?:go ahead|green light|shall i proceed)\\b',
		`\\bi(?:'ll| will| can)\\s+(?:${beginVerb})\\b`,
		// Deferral: assistant recommends then hands the call back ("…my pick; your
		// call"). No explicit ask, so the cues above miss it. Strong phrases only so
		// a false positive never fires "go" into normal chat.
		'\\b(?:your call|up to you|your move|you decide|your decision|you choose|your choice)\\b',
		'\\bwhichever\\s+you\\s+(?:prefer|want|like|choose|pick)\\b',
	].join('|'),
	'iu',
);

// Fallback: a trailing question that mentions beginning the work ("…start now?").
const approvalQuestionPattern = /\?["')\]\s]*$/;
const startVerbPattern = /\b(?:start|begin|proceed|implement)\b/i;

function needsApproval(source: string): boolean {
	const text = source.trim();
	if (!text) {
		return false;
	}
	// The ask always sits at the very bottom — scan only the last few non-empty lines.
	const tail = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(-3)
		.join(' ');
	if (!tail) {
		return false;
	}
	return approvalCuePattern.test(tail) || (approvalQuestionPattern.test(tail) && startVerbPattern.test(tail));
}

export const mountTranslatorPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (translatorHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeTranslatorBtn');
	let isAltPressed = false;
	const updateCloseAction = () => {
		if (!closeBtn) {
			return;
		}
		closeBtn.textContent = isAltPressed ? '——' : 'esc';
		closeBtn.title = isAltPressed ? 'Minimize' : 'Close (Esc)';
		closeBtn.setAttribute('aria-label', isAltPressed ? 'Minimize' : 'Close');
	};
	const handleAltDown = (event: KeyboardEvent) => {
		if (event.key === 'Alt') {
			isAltPressed = true;
			updateCloseAction();
		}
	};
	const handleAltUp = (event: KeyboardEvent) => {
		if (event.key === 'Alt') {
			isAltPressed = false;
			updateCloseAction();
		}
	};
	const resetAlt = () => {
		isAltPressed = false;
		updateCloseAction();
	};
	const handleCloseClick = (event: MouseEvent) => {
		if (event.altKey || isAltPressed) {
			context.minimize();
			return;
		}
		context.close();
	};

	closeBtn?.addEventListener('click', handleCloseClick);
	document.addEventListener('keydown', handleAltDown);
	document.addEventListener('keyup', handleAltUp);
	window.addEventListener('blur', resetAlt);

	const disposeTranslator = initializeTranslator(host, context);
	return () => {
		closeBtn?.removeEventListener('click', handleCloseClick);
		document.removeEventListener('keydown', handleAltDown);
		document.removeEventListener('keyup', handleAltUp);
		window.removeEventListener('blur', resetAlt);
		disposeTranslator?.();
	};
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

	// ── Go / approve affordance ───────────────────────────────────────
	// When the selected CLI output is a plan waiting for a green light, reveal a
	// one-press "Go" that types the approval into the CLI and closes the panel —
	// replacing the manual close-then-type-"go". Visibility is driven off the
	// English source, so it's set the moment the panel opens (no translation first).
	const goBtn = host.querySelector<HTMLButtonElement>('#goBtn');
	const updateApprovalAffordance = (source: string) => {
		if (goBtn) {
			goBtn.hidden = !needsApproval(source);
		}
	};
	const activateGo = () => {
		if (!goBtn || goBtn.hidden || !context.sendToActiveSession) {
			return;
		}
		// Exactly what the user types by hand: send the approval word and submit.
		context.sendToActiveSession(approvalWord, { submit: true });
		context.close();
	};
	goBtn?.addEventListener('click', activateGo);

	// Plays the CSS entrance exactly when real content first lands (stream start /
	// revealText), instead of a blind timer that races the network — a cache hit
	// would otherwise wait out a delay that already elapsed, and a slow stream
	// would pop the button in over empty space.
	const markGoReady = () => {
		goBtn?.classList.add('is-ready');
	};

	// Ctrl+Alt+Enter mirrors the button so approval never needs the mouse. Scoped to
	// the open panel; a no-op that passes the event through while the button is hidden.
	const handleApproveShortcut = (event: KeyboardEvent) => {
		if (!matchesShortcut(event, 'approvePlan') || event.repeat) {
			return;
		}
		if (!goBtn || goBtn.hidden) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		activateGo();
	};
	document.addEventListener('keydown', handleApproveShortcut);

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
		cancelVoiceScroll();
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
			// Drop the grow cap from any previous stream — it was measured against
			// the panel size at that moment and would wrongly clip this run.
			bodyEl.style.maxHeight = '';
		}
		const extracted = extractTextToTranslate(context);
		// Re-evaluate the Go affordance against the current selection (also hides it
		// when the selection is cleared/empty).
		updateApprovalAffordance(extracted);
		// New cycle — clear the ready flag so the entrance replays once this run's
		// content actually lands, instead of staying visible from a prior selection.
		goBtn?.classList.remove('is-ready');
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
			markGoReady();
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
			markGoReady();
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

		// Result accumulation and the staged-block reveal live in the per-run
		// stream renderer created below (see stream-render.ts).
		let provider: string | undefined;
		let codeCount = 0;

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
						// Expand a rendered list into its items so each is read (and
						// highlighted) on its own, matching the per-item reading band.
						const voiceElements = element.tagName === 'UL' || element.tagName === 'OL'
							? listItemsOf(element)
							: [element];
						for (const voiceElement of voiceElements) {
							const completed = accumulator.add(voiceElement);
							if (!completed) {
								continue;
							}
							if (buffered) {
								send(buffered, false);
							}
							buffered = completed;
						}
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

		// Staged-block reveal + smooth body grow for this run (stream-render.ts).
		const stream = createStreamRenderer({
			textEl,
			bodyEl,
			modalEl,
			isCurrent: isCurrentTranslation,
			isMounted: () => isMounted,
			// First real content landed — the Go affordance's entrance plays now.
			onStreamStart: markGoReady,
			// Feed the rendered blocks to the voice stream so reading can begin
			// before the rest of the answer finishes translating.
			onBlocksInserted: elements => voicePipeline?.feed(elements),
		});

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
					stream.stageBlock(`\`\`\`tree\n${segment.content}\n\`\`\``, segment.content);
					continue;
				}

				if (segment.kind === 'command') {
					// Shell commands stay verbatim — shown as a command card, never
					// sent to translation (which turns `bun lint` into word soup).
					stream.stageBlock(`\`\`\`cmd\n${segment.content}\n\`\`\``, segment.content);
					continue;
				}

				if (segment.kind === 'code') {
					codeCount += 1;
					stream.stageBlock(`[[code-here:${codeCount}]]`, `[code here #${codeCount}]`);
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
						stream.stageBlock(value, value);
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
					stream.stageBlock(`${parsed.marker}${translatedContent}`, `${parsed.marker}${translatedContent}`);
				}
				await flushPlainRun();
			}

			if (!isCurrentTranslation()) {
				return;
			}

			// Flush any final staged blocks before settling the UI.
			stream.flush();

			const renderedMarkdown = stream.renderedMarkdown();
			copyText = stream.copyText();
			if (stream.hasStarted()) {
				// Streaming already drew the result; retire the indicator and grow
				// one last time to the final content height.
				stream.removeIndicator();
				stream.applyBodyHeight();
			} else {
				// Nothing emitted (empty translation) — show the plain result.
				revealText(textEl, renderedMarkdown);
				markGoReady();
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
			console.error('[Translator] Translation failed:', err);
			// Surface any blocks that were translated but still buffered when the
			// error happened, so the user isn't left with an empty or pure-skeleton
			// view for no reason.
			stream.flush();
			stream.removeIndicator();
			if (stream.hasStarted() && stream.hasRenderedBlocks()) {
				// Keep whatever already streamed in — the user can still read and
				// copy the translated portion; only the status flags the failure.
				copyText = stream.copyText();
			} else {
				// Failed before anything showed — fall back to the source text so
				// copying/listening still makes sense.
				copyText = extracted;
				revealText(textEl, extracted);
				markGoReady();
			}
			resultStatus = 'translation failed';
			setStatus(resultStatus);
			enableResultActions();
			// Read whatever did stream in before the failure, then close the session.
			voicePipeline?.finish();
		} finally {
			// If a newer translation is already running, leave its UI state alone.
			if (generation !== translationGeneration) {
				return;
			}
			stream.cancelPendingFlush();
			// Re-arm the manual button: the terminal selection can change while the
			// panel stays open, and failed attempts may be transient (rate limit,
			// network) — either way another run must stay possible.
			if (translateBtn) {
				translateBtn.disabled = false;
			}
			modalEl.classList.remove('is-translating');
			if (bodyEl) {
				if (stream.hasStarted()) {
					// Let the final grow finish animating, then drop the explicit
					// height (now equal to the content, so no jump) and re-enable
					// scrolling for results taller than the panel.
					const body = bodyEl;
					growSettleTimer = setTimeout(() => {
						growSettleTimer = undefined;
						body.style.height = '';
						body.style.maxHeight = '';
						body.classList.remove('is-streaming-grow');
					}, getGrowSettleMs(body));
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
					}, getGrowSettleMs(body));
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
			// Source text is already on screen (auto-translate off, or before the
			// async translation below overwrites it) — Go can enter now too.
			markGoReady();
		} else {
			textEl.textContent = emptyStateMessage;
			textEl.classList.add('placeholder');
		}
	}
	// Source already reads as an approval ask? Reveal Go immediately — detection is
	// on the source, so it needs no translation first.
	updateApprovalAffordance(extracted);
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
			clearTimeout(growSettleTimer);
			document.removeEventListener('keydown', handleSpaceShortcut);
			document.removeEventListener('keydown', handleApproveShortcut);
			disposeVoiceState?.();
			clearVoiceHighlights(activeVoiceChunks);
			cancelVoiceScroll();
		};
	}

	return () => {
		isMounted = false;
		clearTimeout(growSettleTimer);
		document.removeEventListener('keydown', handleApproveShortcut);
	};
}

function extractTextToTranslate(context: ToolContext): string {
	const text = context.getTerminalSelection?.() || '';
	// A selection with no letters or digits (separator rules, blank space) has
	// nothing to translate — treat it as no selection so the hint shows instead.
	return hasTranslatableContent(text) ? text : '';
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

const orderedItemPattern = /^\d{1,3}[.)]\s+.*/;
const bulletItemPattern = /^[-*•]\s+.*/;

const isListItemLine = (line: string): boolean => {
	const trimmed = line.trim();
	return orderedItemPattern.test(trimmed) || bulletItemPattern.test(trimmed);
};

// Group hard-wrapped lines into whole logical list items: a new item begins at a
// marker line ("1." / "-"), and unmarked continuation lines (terminal wraps) stay
// with the item above them. Batching then works on items, never physical lines,
// so a single item is never split across batches — a mid-item split would strand
// the tail as an un-numbered <p> (markdown-lite only continues a list already
// open in the block), which is the orphaned-paragraph bug this prevents.
function groupListItems(lines: string[]): string[] {
	const items: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (isListItemLine(line) && current.length) {
			items.push(current.join('\n'));
			current = [];
		}
		current.push(line);
	}
	if (current.length) {
		items.push(current.join('\n'));
	}
	return items;
}

function splitListRun(lines: string[]): string[] {
	const batches: string[] = [];
	let batch: string[] = [];
	let batchLen = 0;
	for (const item of groupListItems(lines)) {
		// Flush before adding only when the batch already holds something, so an
		// item longer than the char cap still forms its own batch rather than
		// being dropped onto an empty one and split.
		if (batch.length && (batch.length >= maxListBatchItems || batchLen >= maxListBatchChars)) {
			batches.push(batch.join('\n'));
			batch = [];
			batchLen = 0;
		}
		batch.push(item);
		batchLen += item.length + 1;
	}
	if (batch.length) {
		batches.push(batch.join('\n'));
	}
	return batches;
}

// Break a run of prose into voice-sized blocks on paragraph boundaries so a
// long translation streams in piece by piece instead of arriving in one slow
// lump. List runs (numbered or bulleted) are detected and batched into groups
// of ~4 items / ~400 chars so each batch renders as its own <ol>/<ul> and the
// reading band highlights a compact run instead of the entire list at once.
function splitForStreaming(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) {
		return [];
	}

	const lines = trimmed.split('\n');
	const blocks: string[] = [];
	let proseLines: string[] = [];
	let listLines: string[] = [];
	let prevWasListItem = false;

	const flushProse = () => {
		if (!proseLines.length) {
			return;
		}
		const proseText = proseLines.join('\n');
		proseLines = [];
		const paragraphs = proseText.split(/\n[ \t]*\n+/).map((part) => part.trim()).filter(Boolean);
		let current = '';
		for (const paragraph of paragraphs) {
			if (!current) {
				current = paragraph;
			} else if (current.length + paragraph.length + 2 > maxStreamBlockChars) {
				blocks.push(current);
				current = paragraph;
			} else {
				current = `${current}\n\n${paragraph}`;
			}
		}
		if (current) {
			blocks.push(current);
		}
	};

	const flushListRun = () => {
		if (!listLines.length) {
			return;
		}
		blocks.push(...splitListRun(listLines));
		listLines = [];
	};

	for (const line of lines) {
		if (!line.trim()) {
			flushProse();
			flushListRun();
			prevWasListItem = false;
		} else if (isListItemLine(line)) {
			flushProse();
			listLines.push(line);
			prevWasListItem = true;
		} else if (prevWasListItem) {
			// Lazy continuation of the last list item — stays with the list run.
			listLines.push(line);
		} else {
			flushListRun();
			proseLines.push(line);
			prevWasListItem = false;
		}
	}
	flushProse();
	flushListRun();

	return blocks;
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
