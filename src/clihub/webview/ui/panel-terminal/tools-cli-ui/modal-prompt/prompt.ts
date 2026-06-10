import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';
import {
	processPrompt,
	translatePromptText,
	type PromptTranslateRequest,
	type PromptTranslateResult,
	type ImageAttachment,
	isImageAttachment,
	collectImageMarkerIds,
	protectImageMarkers,
	restoreImageMarkers,
	type FileMentionEntry,
	type SpellIssue,
} from '../../../../core/tools-cli-core/prompt';
import { mountFileMentionPicker } from './components/file-mention/file-mention';

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

// Image paste support (screenshots from clipboard + pasted image paths) — adapted for our prompt chat.
// When Execute is pressed the resolved image paths are substituted so they appear in the CLI input.
const imagePathPattern =
	/(?:"([^"\r\n]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?))"|'([^'\r\n]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?))'|((?:~|\/)[^\r\n\t"'<>]*?\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?)))/gi;

type PromptContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveModelName?: () => string | undefined;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestSpellcheck?: (text: string, strict: boolean) => Promise<SpellIssue[]>;
};

export const mountPromptPanel = (host: HTMLElement, context: PromptContext = { close: () => {} }) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = promptHtml.trim();
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

	// Image attachments state (lives while this modal instance is mounted)
	let imageAttachments: ImageAttachment[] = [];
	let nextImageAttachmentId = 1;

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
		if (!ctx.sendToActiveSession) {
			showNoSessionMessage(hostEl);
			return;
		}

		let textToSend = ta.value;

		// Auto-translate (ES → EN) when the toggle is active.
		// The textarea keeps the original text; the CLI receives the translation.
		if (translateState.enabled && ctx.translatePrompt) {
			const runBtn = hostEl.querySelector<HTMLButtonElement>('#runBtn');
			const savedBtnHtml = runBtn?.innerHTML;
			setTranslating(true);
			if (runBtn) {
				runBtn.classList.add('is-translating');
				runBtn.disabled = true;
				runBtn.innerHTML = '<i class="ti ti-sparkles" aria-hidden="true"></i><span>Translating…</span>';
			}
			try {
				const { text: protectedText, markers } = protectImageMarkers(textToSend);
				const result = await translatePromptText(protectedText, ctx);
				const translated = result.text ? restoreImageMarkers(result.text, markers) : '';
				if (translated && translated !== textToSend.trim()) {
					textToSend = translated;
				}
			} catch (err) {
				console.error('[Prompt] Auto-translate failed:', err);
			} finally {
				setTranslating(false);
				if (runBtn && savedBtnHtml !== undefined) {
					runBtn.innerHTML = savedBtnHtml;
					const trimmed = ta.value.trim();
					runBtn.disabled = !(trimmed.length >= 6 || trimmed.includes(' ')) || !ctx.getActiveSessionId?.();
				}
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

		const result = processPrompt(textToSend, {
			close: ctx.close,
			sendToActiveSession: ctx.sendToActiveSession,
			getActiveSessionId: ctx.getActiveSessionId,
		});

		if (result.status === 'no-session') {
			showNoSessionMessage(hostEl);
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

	if (hasActiveSession) {
		initSkillsChips(host);
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
		for (const match of textarea.value.matchAll(/\[Image #(\d+)\]/g)) {
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

function enforceLowercaseInput(textarea: HTMLTextAreaElement) {
	textarea.addEventListener('keydown', (e) => {
		if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
			if (e.ctrlKey || e.metaKey) {
				return; // keyboard shortcuts (Ctrl+C, Ctrl+V, etc.) — let browser handle
			}
			e.preventDefault();
			const start = textarea.selectionStart ?? 0;
			const end = textarea.selectionEnd ?? 0;
			let char: string;
			if (e.shiftKey) {
				char = e.key.toUpperCase();
			} else {
				// Auto-capitalize first character; force lowercase elsewhere (defeats Caps Lock)
				const isFirstChar = start === 0 && textarea.value.slice(0, start) === '' && textarea.value.slice(end).trimStart() === textarea.value.slice(end);
				char = isFirstChar ? e.key.toUpperCase() : e.key.toLowerCase();
			}
			textarea.value = textarea.value.slice(0, start) + char + textarea.value.slice(end);
			const newPos = start + 1;
			textarea.selectionStart = textarea.selectionEnd = newPos;
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
		}
	});

	textarea.addEventListener('paste', (e) => {
		const clipboard = e.clipboardData;
		if (!clipboard) {
			return;
		}
		// If the paste contains real image files or looks like image paths, let the image paste handler deal with it.
		const hasImageFile = Array.from(clipboard.items).some(
			(it) => it.kind === 'file' && it.type.startsWith('image/')
		);
		const pastedForCheck = clipboard.getData('text/plain') || '';
		imagePathPattern.lastIndex = 0;
		const looksLikeImagePath = imagePathPattern.test(pastedForCheck);
		if (hasImageFile || looksLikeImagePath) {
			// Do not lowercase or prevent here — the dedicated image paste listener will handle and prevent.
			return;
		}

		e.preventDefault();
		const text = pastedForCheck;
		const lower = text.toLowerCase();
		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? 0;
		textarea.value = textarea.value.slice(0, start) + lower + textarea.value.slice(end);
		const newPos = start + lower.length;
		textarea.selectionStart = textarea.selectionEnd = newPos;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

function initSkillsChips(host: HTMLElement) {
	const chips = host.querySelectorAll<HTMLButtonElement>('.prompt-tool-btn');

	chips.forEach((chip) => {
		chip.addEventListener('click', () => {
					chip.classList.toggle('selected');

			// Optional: if you want only one skill active at a time, uncomment below
			// chips.forEach(c => c !== chip && c.classList.remove('selected'));
		});
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
	if (!runBtn) {
		return;
	}

	const updateState = () => {
		const text = textarea.value.trim();
		const hasSession = !!context.getActiveSessionId?.();
		// Activate only after a real word: 6+ chars OR first space (second word started)
		const hasEnoughText = text.length >= 6 || text.includes(' ');
		runBtn.disabled = !hasEnoughText || !hasSession;
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
		const isSendShortcut =
			(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ||
			(e.key === 'Enter' && e.ctrlKey);

		if (!isSendShortcut) {
			return;
		}

		e.preventDefault();
		void performSendImpl();
	});
}

// performSend moved inside initPromptTabs as doPerformSendWithImages so it can close over the per-mount imageAttachments state.

function updateCharCount(host: HTMLElement, textarea: HTMLTextAreaElement) {
	const counter = host.querySelector<HTMLElement>('#charCount');
	if (!counter) {
		return;
	}

	const current = textarea.value.length;
	const max = 1500;
	counter.textContent = `${current}/${max}`;

	// Remove previous states
	counter.classList.remove('warn', 'danger');

	if (current >= 1350) {
		// >90% — red + shake
		counter.classList.add('danger');
	} else if (current >= 1050) {
		// >70% — yellow warning
		counter.classList.add('warn');
	}
}

function initSessionState(host: HTMLElement, hasActiveSession: boolean) {
	// Update session dot state
	const dot = host.querySelector<HTMLElement>('#sessionDot');
	if (dot && !hasActiveSession) {
		dot.classList.add('offline');
	}

	if (hasActiveSession) {
		return;
	}

	const body = host.querySelector<HTMLElement>('.prompt-body');
	if (!body) {
		return;
	}

	// Disable interactive elements
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	const chips = host.querySelectorAll<HTMLButtonElement>('.prompt-tool-btn');

	if (textarea) {
		textarea.disabled = true;
	}
	if (runBtn) {
		runBtn.disabled = true;
	}
	chips.forEach((chip) => (chip.disabled = true));

	// Inject a clear "no session" state
	const state = document.createElement('div');
	state.className = 'prompt-no-session';
	state.innerHTML = `
		<div class="prompt-no-session-icon">⌘</div>
		<div class="prompt-no-session-title">No hay sesión CLI activa</div>
		<div class="prompt-no-session-subtitle">
			Abre una sesión desde el panel izquierdo para usar Prompt
		</div>
	`;

	// Hide the normal interactive content but keep the structure
	const skills = host.querySelector<HTMLElement>('.prompt-skills');
	if (skills) {
		skills.style.display = 'none';
	}

	body.appendChild(state);
}

function showNoSessionMessage(host: HTMLElement) {
	const body = host.querySelector<HTMLElement>('.prompt-body');
	if (!body) {
		return;
	}

	let msg = body.querySelector<HTMLElement>('.prompt-no-session-temp');
	if (!msg) {
		msg = document.createElement('div');
		msg.className = 'prompt-no-session-temp';
		msg.textContent = 'Necesitas una sesión CLI activa para enviar prompts.';
		body.appendChild(msg);
		setTimeout(() => msg?.remove(), 2200);
	}
}

// Exact public model strings for Claude Code. The in-CLI "/model" menu only
// exposes aliases (default/fable/opus/haiku) — passing the full string via
// "/model <id>" unlocks specific versions the menu hides.
const claudeModels: Array<{ id: string; label: string }> = [
	{ id: 'claude-fable-5', label: 'fable 5' },
	{ id: 'claude-opus-4-8', label: 'opus 4.8' },
	{ id: 'claude-opus-4-7', label: 'opus 4.7' },
	{ id: 'claude-opus-4-6', label: 'opus 4.6' },
	{ id: 'claude-sonnet-4-6', label: 'sonnet 4.6' },
];

function updateFooterModel(host: HTMLElement, context: PromptContext, hasActiveSession: boolean) {
	const labelEl = document.getElementById('cli-terminal-label');
	const label = labelEl?.textContent?.trim() || 'unknown';

	// Make it as simple as possible: "claude", "grok", "kiro", etc.
	const simpleName = label
		.toLowerCase()
		.replace(/\s+(cli|code)\s*$/i, '')   // remove trailing " CLI" or " Code" (standalone only)
		.replace(/\s+/g, '');                // remove any remaining spaces

	const footerInfo = host.querySelector<HTMLElement>('.prompt-footer-info');
	if (!footerInfo) {
		return;
	}

	footerInfo.innerHTML = `<span class="prompt-session-dot" id="sessionDot"></span><i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;

	const modelName = context.getActiveModelName?.();

	// Claude gets a model switcher (the full version list the /model menu
	// hides); every other CLI keeps the read-only detected-model chip.
	if (simpleName === 'claude' && hasActiveSession && context.sendToActiveSession) {
		footerInfo.append(buildClaudeModelSwitcher(context, modelName));
		return;
	}

	// Detected model (best-effort, only when confidently scraped from the
	// session output). textContent — the value originates in terminal output.
	if (modelName) {
		const modelEl = document.createElement('span');
		modelEl.className = 'prompt-footer-model';
		modelEl.textContent = modelName;
		footerInfo.append(modelEl);
	}
}

function buildClaudeModelSwitcher(context: PromptContext, detectedModel?: string): HTMLElement {
	const wrap = document.createElement('span');
	wrap.className = 'prompt-model-switch';

	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.setAttribute('aria-haspopup', 'listbox');
	button.setAttribute('aria-expanded', 'false');
	button.title = 'Switch model (sends /model with the exact model string)';

	const buttonLabel = document.createElement('span');
	buttonLabel.textContent = detectedModel ?? 'model';
	const caret = document.createElement('span');
	caret.className = 'prompt-model-caret';
	caret.textContent = '▼';
	caret.setAttribute('aria-hidden', 'true');
	button.append(buttonLabel, caret);

	const menu = document.createElement('div');
	menu.className = 'prompt-model-menu';
	menu.setAttribute('role', 'listbox');

	const closeMenu = () => {
		menu.classList.remove('open');
		button.setAttribute('aria-expanded', 'false');
		document.removeEventListener('click', onOutsideClick, true);
	};

	const onOutsideClick = (event: MouseEvent) => {
		if (!wrap.contains(event.target as Node)) {
			closeMenu();
		}
	};

	for (const model of claudeModels) {
		const item = document.createElement('button');
		item.className = 'prompt-model-item';
		item.setAttribute('role', 'option');
		if (detectedModel && model.label === detectedModel) {
			item.classList.add('active');
		}

		const name = document.createElement('span');
		name.className = 'prompt-model-item-name';
		name.textContent = model.label;
		const id = document.createElement('code');
		id.className = 'prompt-model-item-id';
		id.textContent = model.id;
		item.append(name, id);

		item.addEventListener('click', () => {
			// Switch silently: the user never types it; Claude just confirms in
			// the terminal. Keep the modal open so they can continue prompting.
			context.sendToActiveSession?.(`/model ${model.id}`, { paste: true, submit: true });
			buttonLabel.textContent = model.label;
			menu.querySelectorAll('.prompt-model-item.active').forEach((el) => el.classList.remove('active'));
			item.classList.add('active');
			closeMenu();
		});

		menu.append(item);
	}

	button.addEventListener('click', () => {
		const isOpen = menu.classList.toggle('open');
		button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		if (isOpen) {
			document.addEventListener('click', onOutsideClick, true);
		} else {
			document.removeEventListener('click', onOutsideClick, true);
		}
	});

	wrap.append(button, menu);
	return wrap;
}

// --- Image attachments helpers (paste screenshots + paths, atomic markers, referenced collection) ---

function replaceImagePathsWithMarkers(text: string, register: (path: string) => string): string {
	if (!text) {
		return text;
	}
	return text.replace(imagePathPattern, (match, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) => {
		const p = (doubleQuoted ?? singleQuoted ?? unquoted ?? match).trim();
		return register(p);
	});
}

function getReferencedImageAttachments(text: string, attachments: ImageAttachment[]): ImageAttachment[] {
	const ids = collectImageMarkerIds(text);
	return attachments.filter((a) => ids.has(a.id) && isImageAttachment(a));
}

function insertTextAtSelection(textarea: HTMLTextAreaElement, text: string) {
	const start = textarea.selectionStart ?? textarea.value.length;
	const end = textarea.selectionEnd ?? textarea.value.length;
	const before = textarea.value.slice(0, start);
	const after = textarea.value.slice(end);
	const toInsert = addSmartSpacing(before, text, after);

	textarea.value = before + toInsert + after;
	const pos = before.length + toInsert.length;
	textarea.setSelectionRange(pos, pos);
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function addSmartSpacing(before: string, text: string, after: string): string {
	let value = text;
	if (before && !/\s$/.test(before) && value && !/^[\s,.;:!?)]/.test(value)) {
		value = ' ' + value;
	}
	if (after && !/^\s/.test(after) && value && !/[\s([¿¡]$/.test(value)) {
		value = value + ' ';
	}
	return value;
}

function handleImageMarkerDeleteKey(textarea: HTMLTextAreaElement, event: KeyboardEvent): boolean {
	if (event.key !== 'Backspace' && event.key !== 'Delete') {
		return false;
	}
	// We deliberately allow Ctrl/Alt/Meta modifiers here so that Ctrl+Backspace 
	// also cleanly deletes the entire image block instead of just a part of it.
	if (textarea.selectionStart !== textarea.selectionEnd) {
		return false;
	}

	const caret = textarea.selectionStart ?? 0;
	const range = findImageMarkerDeleteRange(textarea.value, caret, event);
	if (!range) {
		return false;
	}

	event.preventDefault();
	textarea.value = textarea.value.slice(0, range.start) + textarea.value.slice(range.end);
	textarea.setSelectionRange(range.start, range.start);
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function findImageMarkerDeleteRange(
	text: string,
	caret: number,
	event: KeyboardEvent
): { start: number; end: number } | undefined {
	const isBack = event.key === 'Backspace';
	const isDel = event.key === 'Delete';
	const isWordMod = event.ctrlKey || event.altKey;

	for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		
		const inside = caret > start && caret < end;
		const backAfter = isBack && caret === end;
		const backAfterSpace = isBack && isWordMod && caret === end + 1 && text[end] === ' ';
		const delBefore = isDel && caret === start;
		const delBeforeSpace = isDel && isWordMod && caret === start - 1 && text[start - 1] === ' ';
		
		if (inside || backAfter || backAfterSpace || delBefore || delBeforeSpace) {
			const finalStart = delBeforeSpace ? start - 1 : start;
			const finalEnd = backAfterSpace ? end + 1 : end;
			return { start: finalStart, end: finalEnd };
		}
	}
	return undefined;
}

function handleImageMarkerArrowKey(textarea: HTMLTextAreaElement, event: KeyboardEvent): boolean {
	if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
		return false;
	}
	// Allow Ctrl/Meta for word jumping behavior, but still intercept if we hit/are inside a marker
	if (event.shiftKey || event.metaKey) {
		return false;
	}
	if (textarea.selectionStart !== textarea.selectionEnd) {
		return false;
	}

	const caret = textarea.selectionStart ?? 0;
	const isWordMod = event.ctrlKey || event.altKey;
	
	for (const match of textarea.value.matchAll(/\[Image #(\d+)\]/g)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		
		const inside = caret > start && caret < end;
		const movingLeftInto = event.key === 'ArrowLeft' && caret === end;
		const movingRightInto = event.key === 'ArrowRight' && caret === start;
		const movingLeftFromSpace = event.key === 'ArrowLeft' && isWordMod && caret === end + 1 && textarea.value[end] === ' ';
		const movingRightFromSpace = event.key === 'ArrowRight' && isWordMod && caret === start - 1 && textarea.value[start - 1] === ' ';
		
		if (inside || movingLeftInto || movingRightInto || movingLeftFromSpace || movingRightFromSpace) {
			event.preventDefault();
			let newCaret;
			if (movingLeftFromSpace) {newCaret = start;}
			else if (movingRightFromSpace) {newCaret = end;}
			else {newCaret = event.key === 'ArrowLeft' ? start : end;}
			
			textarea.setSelectionRange(newCaret, newCaret);
			return true;
		}
	}
	
	return false;
}

function getImageTypeFromPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase();
	if (!ext) {
		return 'image/*';
	}
	if (ext === 'jpg') {
		return 'image/jpeg';
	}
	if (ext === 'svg') {
		return 'image/svg+xml';
	}
	if (ext === 'tif') {
		return 'image/tiff';
	}
	return `image/${ext}`;
}

function getPathBaseName(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function setupImagePaste(
	textarea: HTMLTextAreaElement,
	registerPath: (path: string) => string,
	registerClipboard: (file: File) => string
) {
	textarea.addEventListener('paste', (event: ClipboardEvent) => {
		const clipboardData = event.clipboardData;
		if (!clipboardData) {
			return;
		}

		const pastedText = clipboardData.getData('text/plain');
		const imageFiles = Array.from(clipboardData.items)
			.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);

		const textWithMarkers = replaceImagePathsWithMarkers(pastedText, registerPath);
		const hasImagePath = textWithMarkers !== pastedText;

		if (!hasImagePath && imageFiles.length === 0) {
			return;
		}

		event.preventDefault();

		const imageMarkers = imageFiles.map(registerClipboard);
		const insertValue = [textWithMarkers, ...imageMarkers]
			.filter((part) => part && part.trim().length > 0)
			.join(textWithMarkers && imageMarkers.length ? ' ' : '');

		// Add a trailing space when the insert ends with an image marker so the
		// cursor lands right after the token ready to type — same as @path mentions.
		const insertWithSpacing = insertValue.endsWith(']') ? insertValue + ' ' : insertValue;
		insertTextAtSelection(textarea, insertWithSpacing);
	});
}

/* === Visual highlighting for [Image #N] markers inside the prompt textarea ===
   Overlay technique so we can give [Image #1] a distinct bg + small rounded border.
   We also mirror the user's text selection into the overlay so the standard blue
   selection background appears correctly when selecting text (including over markers).
   The real textarea is transparent (text + bg) so the overlay content shows, but
   caret is still rendered by the textarea on top (using caret-color).
*/
function updatePromptImageHighlight(
  wrap: HTMLElement,
  textarea: HTMLTextAreaElement,
  highlight: HTMLElement,
  spellIssues: SpellIssue[] = []
) {
  if (!wrap || !textarea || !highlight) {
    return;
  }

  let selStart = -1;
  let selEnd = -1;
  if (document.activeElement === textarea) {
    selStart = textarea.selectionStart ?? -1;
    selEnd = textarea.selectionEnd ?? -1;
  }

  highlight.replaceChildren(...buildPromptHighlightNodes(textarea.value, selStart, selEnd, spellIssues));

  // keep scroll in sync
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
}

type TokenKind = 'image' | 'mention' | 'mention-folder' | 'misspelled' | 'plain';

function buildPromptHighlightNodes(text: string, selStart: number = -1, selEnd: number = -1, spellIssues: SpellIssue[] = []): Node[] {
  if (!text) {
    return [];
  }

  const nodes: Node[] = [];
  let lastIndex = 0;
  const hasSel = selStart >= 0 && selEnd > selStart;

  // Collect all special tokens (image markers + @file mentions + misspelled words) sorted by position.
  type Token = { start: number; end: number; kind: TokenKind };
  const tokens: Token[] = [];

  for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
    tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind: 'image' });
  }
  // @mention: '@' followed by any non-whitespace chars, must be preceded by whitespace or start of string
  for (const match of text.matchAll(/(?<=^|\s)@\S+/g)) {
    const kind: TokenKind = match[0].endsWith('/') ? 'mention-folder' : 'mention';
    tokens.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length, kind });
  }
  // Misspelled words flagged by the host spell-checker.
  for (const issue of spellIssues) {
    if (issue.offset >= 0 && issue.length > 0 && issue.offset + issue.length <= text.length) {
      tokens.push({ start: issue.offset, end: issue.offset + issue.length, kind: 'misspelled' });
    }
  }
  // Image/mention tokens take priority over misspelled ones when ranges collide.
  const tokenPriority: Record<TokenKind, number> = { image: 0, mention: 0, 'mention-folder': 0, misspelled: 1, plain: 2 };
  tokens.sort((a, b) => a.start - b.start || tokenPriority[a.kind] - tokenPriority[b.kind]);

  for (const token of tokens) {
    // Guard against overlapping tokens (should not happen in practice)
    if (token.start < lastIndex) { continue; }

    // plain text before this token
    if (token.start > lastIndex) {
      appendSegment(nodes, text, lastIndex, token.start, selStart, selEnd, hasSel, 'plain');
    }
    // the token itself
    appendSegment(nodes, text, token.start, token.end, selStart, selEnd, hasSel, token.kind);
    lastIndex = token.end;
  }

  // trailing plain text
  if (lastIndex < text.length) {
    appendSegment(nodes, text, lastIndex, text.length, selStart, selEnd, hasSel, 'plain');
  }

  // A trailing newline in a pre-wrap div doesn't create a visual new line 
  // unless there's an element after it. Mirroring requires appending a <br>.
  if (text.endsWith('\n')) {
    nodes.push(document.createElement('br'));
  }

  return nodes;
}

/** Append one text segment to the node list, honouring selection overlap. */
function appendSegment(
  nodes: Node[],
  fullText: string,
  from: number,
  to: number,
  selStart: number,
  selEnd: number,
  hasSel: boolean,
  kind: TokenKind
) {
  if (from >= to) { return; }

  const cssClass = kind === 'image' ? 'prompt-image-marker'
                 : kind === 'mention' ? 'prompt-mention'
                 : kind === 'mention-folder' ? 'prompt-mention-folder'
                 : kind === 'misspelled' ? 'prompt-misspelled'
                 : 'plain';

  const makeSpan = (content: string, cls: string): HTMLSpanElement => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = content;
    return s;
  };

  const segmentText = fullText.slice(from, to);

  if (!hasSel || to <= selStart || from >= selEnd) {
    // No selection overlap — simple case
    nodes.push(makeSpan(segmentText, cssClass));
    return;
  }

  // Overlaps selection: split into before / selected / after
  const selFrom = Math.max(from, selStart);
  const selTo   = Math.min(to,   selEnd);

  if (from < selFrom) {
    nodes.push(makeSpan(fullText.slice(from, selFrom), cssClass));
  }

  if (selFrom < selTo) {
    const selSpan = document.createElement('span');
    selSpan.className = 'selected';
    // Nest the token span inside .selected so the badge/colour can be overridden
    selSpan.appendChild(makeSpan(fullText.slice(selFrom, selTo), cssClass));
    nodes.push(selSpan);
  }

  if (selTo < to) {
    nodes.push(makeSpan(fullText.slice(selTo, to), cssClass));
  }
}
