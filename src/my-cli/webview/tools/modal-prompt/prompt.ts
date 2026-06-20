import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';
import {
	processPrompt,
	translatePromptText,
	type ImageAttachment,
	protectImageMarkers,
	restoreImageMarkers,
	type SpellIssue,
	type PasteAttachment,
	buildPasteMarker,
	countLines,
	detectPasteKind,
	expandPasteMarkers,
	protectPasteMarkers,
	restorePasteMarkers,
	stripPromptTokens,
	protectMentions,
	restoreMentions,
	type WorkspaceSkill,
	expandSkillsToken,
	protectSkillTokens,
	restoreSkillTokens,
} from '../../../shared/prompt';
import { mountFileMentionPicker, resolveFileMentionAliases } from './components/file-mention/file-mention';
import type { PromptContext } from './prompt-context';
import { setupUndoHistory } from './textarea-history';
import { enforceLowercaseInput } from './lowercase-input';
import {
	atomicMarkerPattern,
	getImageTypeFromPath,
	getPathBaseName,
	getReferencedImageAttachments,
	handleImageMarkerArrowKey,
	handleImageMarkerDeleteKey,
	setupImagePaste,
	setupPasteCollapse
} from './attachments-ui';
import { updatePromptImageHighlight } from './highlight';
import { initSkillsChips, isClaudeSession } from './skills-chips';
import { updateFooterModel } from './footer-model';
import { initSessionState, showNoSessionMessage } from './session-state';
import { getShortcut, matchesShortcut } from '../../../../shared/keymaps/cli';

export type { PromptContext } from './prompt-context';

const stylesId = 'cli-prompt-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = promptStyles;
	document.head.append(style);
};

// Budget for the *effective* typed text — markers and @mentions are free, and
// large pastes collapse into markers, so this only constrains hand-typed prose.
// Kept well under the host translator's 20k hard cap so a send can never die
// there mid-flight. Warn/danger track ~70% / ~90%.
const promptCharLimit = 5000;
const promptCharWarn = 3500;
const promptCharDanger = 4500;
const routePromptCloseDelayMs = 1200;

const hasRouteMention = (text: string) => /(^|\s)@\S+/.test(text);

// Draft state per CLI session, surviving modal close/Esc (a too-easy accident
// while typing). Lives in module scope: the webview JS context persists while
// the panel is open, and entries are keyed by session id so a draft dies with
// its session and can never resurface in another CLI.
type PromptDraft = {
	text: string;
	imageAttachments: ImageAttachment[];
	nextImageAttachmentId: number;
	pasteAttachments: PasteAttachment[];
	nextPasteAttachmentId: number;
};
const promptDrafts = new Map<string, PromptDraft>();

export const mountPromptPanel = (host: HTMLElement, context: PromptContext = { close: () => {} }) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (promptHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closePromptBtn');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => context.close());
	}

	const hasActiveSession = !!context.getActiveSessionId?.();

	updateFooterModel(host, context, hasActiveSession);
	initSessionState(host, hasActiveSession);
	initPromptTabs(host, context, hasActiveSession);
};

function initPromptTabs(host: HTMLElement, context: PromptContext, hasActiveSession: boolean) {
	const tabs = host.querySelectorAll<HTMLElement>('.prompt-tab');
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const textareaWrap = host.querySelector<HTMLElement>('.prompt-textarea-wrap');
	const highlight = host.querySelector<HTMLElement>('.prompt-textarea-highlight');

	if (!tabs.length || !textarea) {
		return;
	}

	// When there is no active session we keep everything disabled
	if (!hasActiveSession) {
		textarea.disabled = true;
		return;
	}

	// Force lowercase input, with Shift as the only way to write uppercase
	enforceLowercaseInput(textarea);

	// @ file mention picker
	// We pass the wrap as the "anchor" for position calculations (getBoundingClientRect).
	// Internally the picker now portals the dropdown to the outer #cli-tools-modal
	// (using position:absolute relative to it) so the list can float freely upwards
	// in the full dialog area without being height-limited by the input box or card.
	if (context.requestWorkspaceFiles) {
		const textareaWrapEl = host.querySelector<HTMLElement>('.prompt-textarea-wrap');
		if (textareaWrapEl) {
			mountFileMentionPicker(
				textarea,
				textareaWrapEl,
				() => context.requestWorkspaceFiles!()
			);
		}
	}

	// Restore the draft for this session, if the modal was closed mid-typing.
	const draftKey = context.getActiveSessionId?.();
	const savedDraft = draftKey ? promptDrafts.get(draftKey) : undefined;

	// Image attachments state (survives modal close via the session draft)
	const imageAttachments: ImageAttachment[] = savedDraft?.imageAttachments ?? [];
	let nextImageAttachmentId = savedDraft?.nextImageAttachmentId ?? 1;

	// Collapsed-paste state — large pasted blocks live here verbatim while the
	// textarea only shows their [Code/Text #N +X lines] marker.
	const pasteAttachments: PasteAttachment[] = savedDraft?.pasteAttachments ?? [];
	let nextPasteAttachmentId = savedDraft?.nextPasteAttachmentId ?? 1;
	let sendInFlight = false;

	if (savedDraft?.text) {
		textarea.value = savedDraft.text;
	}

	const saveDraft = () => {
		if (!draftKey) {
			return;
		}
		promptDrafts.set(draftKey, {
			text: textarea.value,
			imageAttachments,
			nextImageAttachmentId,
			pasteAttachments,
			nextPasteAttachmentId,
		});
	};
	textarea.addEventListener('input', saveDraft);

	// Custom undo/redo: programmatic value writes (lowercase enforcement,
	// marker insertion) wipe the browser's native undo stack, so Ctrl+Z needs
	// its own history.
	setupUndoHistory(textarea);

	const registerPasteAttachment = (content: string): string => {
		const id = nextPasteAttachmentId++;
		const kind = detectPasteKind(content);
		const marker = buildPasteMarker(kind, id, countLines(content));
		pasteAttachments.push({ id, marker, kind, content });
		return marker;
	};

	// Translate toggle — on by default, persisted to localStorage across sessions.
	// localStorage key: 'f1-translate-auto' → '1' (on) | '0' (off). Missing key = on.
	const translateState = { enabled: localStorage.getItem('f1-translate-auto') !== '0' };
	let setTranslating: (active: boolean) => void = () => {};

	// Strict-accents toggle — OFF by default (missing tildes ignored). When ON,
	// the host re-flags accent omissions. Persisted across IDE restarts.
	// localStorage key: 'f1-spellcheck-strict' → '1' (on) | '0'/missing (off).
	const strictState = { enabled: localStorage.getItem('f1-spellcheck-strict') === '1' };
	// Assigned once runSpellcheck/renderHighlight exist; re-marks on toggle.
	let rerunSpellcheck: () => void = () => {};

	const registerPathImageAttachment = (path: string): string => {
		const id = nextImageAttachmentId++;
		const marker = `[Image #${id}]`;
		imageAttachments.push({
			id,
			marker,
			source: 'path',
			path,
			type: getImageTypeFromPath(path),
			name: getPathBaseName(path),
		});
		return marker;
	};

	const registerClipboardImageAttachment = (file: File): string => {
		const id = nextImageAttachmentId++;
		const marker = `[Image #${id}]`;
		const attachment: ImageAttachment = {
			id,
			marker,
			source: 'clipboard',
			type: file.type || 'image/png',
			name: file.name || `Image ${id}`,
			size: file.size,
		};
		imageAttachments.push(attachment);

		const reader = new FileReader();
		reader.addEventListener('load', () => {
			if (typeof reader.result === 'string') {
				attachment.dataUrl = reader.result;
			}
		});
		reader.readAsDataURL(file);

		return marker;
	};

	// Setup paste that supports images/screenshots + paths (must run before or combined with lowercase)
	setupImagePaste(textarea, registerPathImageAttachment, registerClipboardImageAttachment);

	// Large text/code pastes collapse into an atomic marker instead of flooding
	// the textarea (the other paste handlers skip these via shouldCollapsePaste).
	setupPasteCollapse(textarea, registerPasteAttachment);

	// Atomic delete and traversal for [Image #N] markers
	textarea.addEventListener('keydown', (e) => {
		if (handleImageMarkerDeleteKey(textarea, e)) {return;}
		if (handleImageMarkerArrowKey(textarea, e)) {return;}
	});

	// The real send that handles optional auto-translate + image resolution before processPrompt.
	// Lives inside init so it closes over translateState / setTranslating / imageAttachments.
	async function doPerformSendWithImages(
		hostEl: HTMLElement,
		ta: HTMLTextAreaElement,
		ctx: PromptContext,
		currentAttachments: ImageAttachment[]
	) {
		if (sendInFlight) {
			return;
		}

		if (!ctx.sendToActiveSession) {
			showNoSessionMessage(hostEl);
			return;
		}

		sendInFlight = true;
		const runBtn = hostEl.querySelector<HTMLButtonElement>('#runBtn');
		const savedRunBtnHtml = runBtn?.innerHTML;
		const restoreRunButton = () => {
			if (!runBtn || savedRunBtnHtml === undefined) {
				return;
			}

			runBtn.classList.remove('is-translating');
			runBtn.innerHTML = savedRunBtnHtml;
			const trimmed = ta.value.trim();
			runBtn.disabled = !(trimmed.length >= 6 || trimmed.includes(' ')) || !ctx.getActiveSessionId?.();
		};

		let textToSend = ta.value;

		// Auto-translate (ES → EN) when the toggle is active.
		// The textarea keeps the original text; the CLI receives the translation.
		if (translateState.enabled && ctx.translatePrompt) {
			setTranslating(true);
			if (runBtn) {
				runBtn.classList.add('is-translating');
				runBtn.disabled = true;
				runBtn.innerHTML = '<i class="ti ti-sparkles" aria-hidden="true"></i><span>Translating…</span>';
			}
			try {
				// Image markers, paste markers, skill tokens AND @mention routes
				// must survive translation untouched — they also shrink the payload
				// the translator has to process, so requests are faster and safer.
				const { text: imageProtected, markers } = protectImageMarkers(textToSend);
				const { text: pasteProtected, markers: pasteMarkers } = protectPasteMarkers(imageProtected);
				const { text: skillProtected, tokens: skillTokens } = protectSkillTokens(pasteProtected);
				const { text: protectedText, mentions } = protectMentions(skillProtected);
				const result = await translatePromptText(protectedText, ctx);
				const translated = result.text
					? restoreImageMarkers(restorePasteMarkers(restoreSkillTokens(restoreMentions(result.text, mentions), skillTokens), pasteMarkers), markers)
					: '';
				if (translated && translated !== textToSend.trim()) {
					textToSend = translated;
				}
			} catch (err) {
				console.error('[Prompt] Auto-translate failed:', err);
			} finally {
				setTranslating(false);
				restoreRunButton();
			}
		}

		const referenced = getReferencedImageAttachments(textToSend, currentAttachments);

		if (referenced.length > 0 && ctx.preparePromptWithAttachments) {
			try {
				textToSend = await ctx.preparePromptWithAttachments(textToSend, referenced);
			} catch (err) {
				console.error('[Prompt] Failed to prepare image attachments:', err);
			}
		}

		// The [Skills #N] aggregate token expands into explicit instructions
		// with each SKILL.md route resolved for the active CLI (.claude/skills
		// for Claude, .agents/skills for the rest). Done post-translation —
		// the generated text is already English — and before paste expansion.
		textToSend = expandSkillsToken(textToSend, selectedSkills, isClaudeSession());

		// Collapsed pastes leave the textarea as markers; the CLI gets the
		// original verbatim content (never lowercased, never translated).
		textToSend = expandPasteMarkers(textToSend, pasteAttachments);

		// The textarea can show compact @~/ aliases; restore the actual
		// workspace-relative @path right before sending to the CLI.
		textToSend = resolveFileMentionAliases(textToSend);
		const shouldDelayClose = hasRouteMention(textToSend);
		if (shouldDelayClose && runBtn) {
			runBtn.classList.add('is-translating');
			runBtn.disabled = true;
			runBtn.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true"></i><span>Sending…</span>';
		}

		const result = processPrompt(textToSend, {
			close: shouldDelayClose ? () => window.setTimeout(ctx.close, routePromptCloseDelayMs) : ctx.close,
			sendToActiveSession: ctx.sendToActiveSession,
			getActiveSessionId: ctx.getActiveSessionId,
		});

		if (result.status === 'no-session') {
			sendInFlight = false;
			restoreRunButton();
			showNoSessionMessage(hostEl);
		}

		if (result.status === 'empty') {
			sendInFlight = false;
			restoreRunButton();
		}

		// Sent successfully — the draft has served its purpose.
		if (result.status === 'sent' && draftKey) {
			promptDrafts.delete(draftKey);
		}
	}

	// Single tab — set placeholder once
	if (textareaWrap) {
		textareaWrap.classList.remove('is-pro');
	}
	textarea.placeholder = 'Ask anything…';

	requestAnimationFrame(() => {
		textarea.focus();
	});

	// Ordered selection of skills — updated as the user toggles chips. The
	// textarea holds only the aggregate [Skills #N] count token; the actual
	// WorkspaceSkill objects live here and drive the send-time expansion.
	let selectedSkills: WorkspaceSkill[] = [];

	if (hasActiveSession) {
		initSkillsChips(host, context, textarea, (selection) => {
			selectedSkills = selection;
		});
		const tools = initToolbarActions(
			host,
			() => translateState.enabled,
			(val) => {
				translateState.enabled = val;
				try { localStorage.setItem('f1-translate-auto', val ? '1' : '0'); } catch { /* storage unavailable */ }
			}
		);
		setTranslating = tools.setTranslating;

		initStrictToggle(
			host,
			() => strictState.enabled,
			(val) => {
				strictState.enabled = val;
				try { localStorage.setItem('f1-spellcheck-strict', val ? '1' : '0'); } catch { /* storage unavailable */ }
				rerunSpellcheck();
			}
		);
	}

	const performSendNow = async () => {
		await doPerformSendWithImages(host, textarea, context, imageAttachments);
	};

	initRunButton(host, textarea, context, performSendNow);
	initSendShortcut(textarea, context, performSendNow);

	if (hasActiveSession) {
		updateCharCount(host, textarea);
	}

	const adjustHeight = () => {
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	};

	// Live spell-marking state. Misspelled-word ranges come from the host (cspell trie).
	// Ranges are offset-based, so they go stale the moment the text changes — we clear
	// them on input and recompute ~400ms after the user pauses typing.
	let spellIssues: SpellIssue[] = [];
	let spellcheckTimer: number | undefined;
	let spellcheckToken = 0;

	const renderHighlight = () => {
		if (highlight && textareaWrap) {
			updatePromptImageHighlight(textareaWrap, textarea, highlight, spellIssues);
		}
	};

	const runSpellcheck = () => {
		if (!context.requestSpellcheck) {
			return;
		}

		const token = ++spellcheckToken;
		const text = textarea.value;
		if (!text.trim()) {
			return;
		}

		void context.requestSpellcheck(text, strictState.enabled).then((issues) => {
			// Drop stale responses and any result whose offsets no longer match the text.
			if (token !== spellcheckToken || textarea.value !== text) {
				return;
			}
			spellIssues = issues;
			renderHighlight();
		});
	};

	// Toggling strict changes verdicts for already-typed text: clear stale marks
	// immediately, then recompute under the new mode.
	rerunSpellcheck = () => {
		spellIssues = [];
		renderHighlight();
		runSpellcheck();
	};

	const scheduleSpellcheck = () => {
		window.clearTimeout(spellcheckTimer);
		spellcheckTimer = window.setTimeout(runSpellcheck, 400);
	};

	const onInputForHighlight = () => {
		adjustHeight();
		if (highlight && textareaWrap) {
			// use raf to ensure update happens after value commit and to help layer paint
			requestAnimationFrame(renderHighlight);
		}
		scheduleSpellcheck();
	};

	textarea.addEventListener('input', onInputForHighlight);

	// scroll sync for the highlight overlay (so long text + markers stay aligned)
	textarea.addEventListener('scroll', () => {
		if (highlight) {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		}
	});

	const forceCaretOutOfMarkers = () => {
		if (textarea.selectionStart !== textarea.selectionEnd) {return;}
		const caret = textarea.selectionStart ?? 0;
		for (const match of textarea.value.matchAll(atomicMarkerPattern)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			if (caret > start && caret < end) {
				const newCaret = (caret - start) < (end - caret) ? start : end;
				textarea.setSelectionRange(newCaret, newCaret);
				break;
			}
		}
	};

	// selectionchange: update highlight so .selected spans get the blue bg when user selects text
	const onSelectionChange = () => {
		if (document.activeElement === textarea && highlight && textareaWrap) {
			forceCaretOutOfMarkers();
			renderHighlight();
		}
	};
	document.addEventListener('selectionchange', onSelectionChange);

	// Initial adjustment + first highlight render
	requestAnimationFrame(() => {
		adjustHeight();
		renderHighlight();
	});
}

function initToolbarActions(
	host: HTMLElement,
	getEnabled: () => boolean,
	setEnabled: (val: boolean) => void
): { setTranslating: (active: boolean) => void } {
	const toggleBtn = host.querySelector<HTMLButtonElement>('#translateToggle');

	if (!toggleBtn) {
		return { setTranslating: () => {} };
	}

	// Sync visual state from persisted preference (aria-pressed="true" is the HTML default,
	// but we still set it explicitly so it reflects localStorage on every mount).
	toggleBtn.setAttribute('aria-pressed', getEnabled() ? 'true' : 'false');

	toggleBtn.addEventListener('click', () => {
		const next = !getEnabled();
		setEnabled(next);
		toggleBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
	});

	return {
		setTranslating: (active: boolean) => {
			toggleBtn.classList.toggle('is-translating', active);
		},
	};
}

function initStrictToggle(
	host: HTMLElement,
	getEnabled: () => boolean,
	setEnabled: (val: boolean) => void
) {
	const toggleBtn = host.querySelector<HTMLButtonElement>('#strictToggle');
	if (!toggleBtn) {
		return;
	}

	// Reflect the persisted preference on every mount.
	toggleBtn.setAttribute('aria-pressed', getEnabled() ? 'true' : 'false');

	toggleBtn.addEventListener('click', () => {
		const next = !getEnabled();
		setEnabled(next);
		toggleBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
	});
}

function initRunButton(
	host: HTMLElement,
	textarea: HTMLTextAreaElement,
	context: PromptContext,
	performSendImpl: () => Promise<void>
) {
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	const runHint = host.querySelector<HTMLElement>('.prompt-run-hint');
	if (!runBtn) {
		return;
	}

	if (runHint) {
		runHint.textContent = getShortcut('sendPrompt')?.description ?? 'Ctrl/Alt + Enter';
	}

	const updateState = () => {
		const text = textarea.value.trim();
		const hasSession = !!context.getActiveSessionId?.();
		// Activate only after a real word: 6+ chars OR first space (second word started)
		const hasEnoughText = text.length >= 6 || text.includes(' ');
		// Limit applies to the effective (typed) length — markers/@routes are free.
		const overLimit = stripPromptTokens(textarea.value).length > promptCharLimit;
		runBtn.disabled = !hasEnoughText || !hasSession || overLimit;
	};

	// Initial state
	updateState();

	// Update live as user types
	textarea.addEventListener('input', () => {
		updateState();
		updateCharCount(host, textarea);
	});

	// Actual send action — delegates to the processor (future home of autocorrect + translate)
	// Now also resolves image attachments so paths appear in the CLI when Enter is pressed.
	runBtn.addEventListener('click', async () => {
		await performSendImpl();
	});
}

function initSendShortcut(textarea: HTMLTextAreaElement, context: PromptContext, performSendImpl: () => Promise<void>) {
	textarea.addEventListener('keydown', (e) => {
		if (!matchesShortcut(e, 'sendPrompt')) {
			return;
		}

		e.preventDefault();
		void performSendImpl();
	});
}

function updateCharCount(host: HTMLElement, textarea: HTMLTextAreaElement) {
	const counter = host.querySelector<HTMLElement>('#charCount');
	if (!counter) {
		return;
	}

	// Tokens (images, pastes, @routes) don't spend prompt budget — they resolve
	// outside the textarea and never go through translation.
	const current = stripPromptTokens(textarea.value).length;
	counter.textContent = `${current}/${promptCharLimit}`;

	// Remove previous states
	counter.classList.remove('warn', 'danger');

	if (current >= promptCharDanger) {
		// red + shake
		counter.classList.add('danger');
	} else if (current >= promptCharWarn) {
		// yellow warning
		counter.classList.add('warn');
	}
}
