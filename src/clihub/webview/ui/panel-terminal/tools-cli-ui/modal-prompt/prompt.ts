import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';
import { runFullAutocorrect } from '../../../../core/tools-cli-core/autocorrect';
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
} from '../../../../core/tools-cli-core/prompt';

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
	sendToActiveSession?: (text: string) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
};

export const mountPromptPanel = (host: HTMLElement, context: PromptContext = { close: () => {} }) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = promptHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	const hasActiveSession = !!context.getActiveSessionId?.();

	initSessionState(host, hasActiveSession);
	initPromptTabs(host, context, hasActiveSession);
	updateFooterModel(host);
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

	// Image attachments state (lives while this modal instance is mounted)
	let imageAttachments: ImageAttachment[] = [];
	let nextImageAttachmentId = 1;

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

	// Atomic delete for [Image #N] markers (Backspace/Delete removes whole token)
	textarea.addEventListener('keydown', (e) => {
		handleImageMarkerDeleteKey(textarea, e);
	});

	// The real send that handles image resolution before calling processPrompt.
	// This must live inside init so it closes over the live imageAttachments array.
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

		const referenced = getReferencedImageAttachments(textToSend, currentAttachments);

		if (referenced.length > 0 && ctx.preparePromptWithAttachments) {
			try {
				// This goes to host (via terminal.ts) which saves any clipboard images to disk
				// and returns text where [Image #N] markers have been replaced by real paths.
				textToSend = await ctx.preparePromptWithAttachments(textToSend, referenced);
			} catch (err) {
				console.error('[Prompt] Failed to prepare image attachments:', err);
				// fallthrough with original text (markers will be visible, paths not resolved)
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
		initToolbarActions(host, textarea, context);
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

	const onInputForHighlight = () => {
		adjustHeight();
		if (highlight && textareaWrap) {
			// use raf to ensure update happens after value commit and to help layer paint
			requestAnimationFrame(() => {
				updatePromptImageHighlight(textareaWrap, textarea, highlight);
			});
		}
	};

	textarea.addEventListener('input', onInputForHighlight);

	// scroll sync for the highlight overlay (so long text + markers stay aligned)
	textarea.addEventListener('scroll', () => {
		if (highlight) {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		}
	});

	// selectionchange: update highlight so .selected spans get the blue bg when user selects text
	const onSelectionChange = () => {
		if (document.activeElement === textarea && highlight && textareaWrap) {
			updatePromptImageHighlight(textareaWrap, textarea, highlight);
		}
	};
	document.addEventListener('selectionchange', onSelectionChange);

	// Initial adjustment + first highlight render
	requestAnimationFrame(() => {
		adjustHeight();
		if (highlight && textareaWrap) {
			updatePromptImageHighlight(textareaWrap, textarea, highlight);
		}
	});
}

function enforceLowercaseInput(textarea: HTMLTextAreaElement) {
	textarea.addEventListener('keydown', (e) => {
		if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
			if (e.shiftKey || e.ctrlKey || e.metaKey) {
				// User is intentionally using Shift → allow uppercase
				// or using Ctrl/Meta for shortcuts like Ctrl+V (paste image), Ctrl+C, etc.
				// Do not insert the letter (e.g. "v" from Ctrl+V)
				return;
			}
			// Force lowercase (this defeats Caps Lock as well)
			e.preventDefault();
			const start = textarea.selectionStart ?? 0;
			const end = textarea.selectionEnd ?? 0;
			const char = e.key.toLowerCase();
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

function initToolbarActions(host: HTMLElement, textarea: HTMLTextAreaElement, context: PromptContext) {
	const fixBtn = host.querySelector<HTMLButtonElement>('#fixSpellingBtn');
	const translateBtn = host.querySelector<HTMLButtonElement>('#translateBtn');

	if (fixBtn) {
		const originalHtml = fixBtn.innerHTML;
		fixBtn.addEventListener('click', async () => {
			const text = textarea.value;
			if (!text.trim()) {return;}

			fixBtn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Corrigiendo...';
			fixBtn.disabled = true;

			try {
				// Protect image markers so autocorrect doesn't touch [Image #N]
				const { text: protectedText, markers } = protectImageMarkers(text);
				const result = await runFullAutocorrect(protectedText);
				const corrected = restoreImageMarkers(result.correctedText, markers);

				if (corrected !== text) {
					textarea.value = corrected;
					textarea.dispatchEvent(new Event('input'));

					const total = result.typoCorrections + result.languageToolCorrections;
					fixBtn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> ${total} correcciones`;
					fixBtn.style.color = '#5DCAA5';
				} else {
					fixBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Sin cambios';
				}
			} catch (err) {
				console.error('Error en corrección:', err);
				fixBtn.innerHTML = '<i class="ti ti-alert-triangle" aria-hidden="true"></i> Error';
			} finally {
				fixBtn.disabled = false;

				setTimeout(() => {
					fixBtn.innerHTML = originalHtml;
					fixBtn.style.color = '';
					fixBtn.style.borderColor = '';
				}, 2000);
			}
		});
	}

	if (translateBtn) {
		const originalHtml = translateBtn.innerHTML;
		translateBtn.addEventListener('click', async () => {
			const text = textarea.value;
			if (!text.trim()) {return;}

			translateBtn.innerHTML = '<i class="ti ti-loader" aria-hidden="true"></i> Translating...';
			translateBtn.disabled = true;

			try {
				// Protect markers before sending to prompt translation (ES→EN)
				const { text: protectedText, markers } = protectImageMarkers(text);
				const result = await translatePromptText(protectedText, context);
				const translated = result.text ? restoreImageMarkers(result.text, markers) : '';

				if (translated && translated !== text.trim()) {
					textarea.value = translated;
					textarea.dispatchEvent(new Event('input'));
					translateBtn.innerHTML = `<i class="ti ti-check" aria-hidden="true"></i> ${result.provider || 'Translated'}`;
					translateBtn.style.color = '#5DCAA5';
				} else {
					translateBtn.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i> Sin cambios';
				}
			} catch (err) {
				console.error('Error en traducción:', err);
				translateBtn.innerHTML = '<i class="ti ti-alert-triangle" aria-hidden="true"></i> Error';
			} finally {
				translateBtn.disabled = false;

				setTimeout(() => {
					translateBtn.innerHTML = originalHtml;
					translateBtn.style.color = '';
					translateBtn.style.borderColor = '';
				}, 2200);
			}
		});
	}
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
		const hasText = textarea.value.trim().length > 0;
		const hasSession = !!context.getActiveSessionId?.();
		runBtn.disabled = !hasText || !hasSession;
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
	const max = 1000;
	counter.textContent = `${current}/${max}`;
}

function initSessionState(host: HTMLElement, hasActiveSession: boolean) {
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

function updateFooterModel(host: HTMLElement) {
	const labelEl = document.getElementById('cli-terminal-label');
	const label = labelEl?.textContent?.trim() || 'unknown';

	// Make it as simple as possible: "claude", "grok", "kiro", etc.
	const simpleName = label
		.toLowerCase()
		.replace(/\s*(cli|code)\s*$/i, '')   // remove trailing " CLI" or " Code"
		.replace(/\s+/g, '');                // remove any remaining spaces

	const footerInfo = host.querySelector<HTMLElement>('.prompt-footer-info');
	if (footerInfo) {
		footerInfo.innerHTML = `<i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;
	}
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
	if (event.altKey || event.ctrlKey || event.metaKey) {
		return false;
	}
	if (textarea.selectionStart !== textarea.selectionEnd) {
		return false;
	}

	const caret = textarea.selectionStart ?? 0;
	const range = findImageMarkerDeleteRange(textarea.value, caret, event.key as 'Backspace' | 'Delete');
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
	key: 'Backspace' | 'Delete'
): { start: number; end: number } | undefined {
	for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
		const start = match.index ?? 0;
		const end = start + match[0].length;
		const inside = caret > start && caret < end;
		const backAfter = key === 'Backspace' && caret === end;
		const delBefore = key === 'Delete' && caret === start;
		if (inside || backAfter || delBefore) {
			return { start, end };
		}
	}
	return undefined;
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

		insertTextAtSelection(textarea, insertValue);
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
  highlight: HTMLElement
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

  highlight.replaceChildren(...buildPromptHighlightNodes(textarea.value, selStart, selEnd));

  // keep scroll in sync
  highlight.scrollTop = textarea.scrollTop;
  highlight.scrollLeft = textarea.scrollLeft;
}

function buildPromptHighlightNodes(text: string, selStart: number = -1, selEnd: number = -1): Node[] {
  if (!text) {
    return [];
  }

  const nodes: Node[] = [];
  let lastIndex = 0;

  const hasSel = selStart >= 0 && selEnd > selStart;

  const markerMatches = Array.from(text.matchAll(/\[Image #(\d+)\]/g));

  for (const match of markerMatches) {
    const mStart = match.index ?? 0;
    const mEnd = mStart + match[0].length;

    // plain text before this marker
    if (mStart > lastIndex) {
      appendSegment(nodes, text, lastIndex, mStart, selStart, selEnd, hasSel, false);
    }

    // the marker token
    appendSegment(nodes, text, mStart, mEnd, selStart, selEnd, hasSel, true);

    lastIndex = mEnd;
  }

  // trailing plain text
  if (lastIndex < text.length) {
    appendSegment(nodes, text, lastIndex, text.length, selStart, selEnd, hasSel, false);
  }

  return nodes;
}

function appendSegment(
  nodes: Node[],
  fullText: string,
  from: number,
  to: number,
  selStart: number,
  selEnd: number,
  hasSel: boolean,
  isMarker: boolean
) {
  if (from >= to) {
    return;
  }

  const segmentText = fullText.slice(from, to);

  if (!hasSel || to <= selStart || from >= selEnd) {
    // no selection overlap
    if (isMarker) {
      const span = document.createElement('span');
      span.className = 'prompt-image-marker';
      span.textContent = segmentText;
      nodes.push(span);
    } else {
      const span = document.createElement('span');
      span.className = 'plain';
      span.textContent = segmentText;
      nodes.push(span);
    }
    return;
  }

  // overlaps selection: split into before / selected / after
  const selFrom = Math.max(from, selStart);
  const selTo = Math.min(to, selEnd);

  if (from < selFrom) {
    const before = fullText.slice(from, selFrom);
    if (isMarker) {
      const span = document.createElement('span');
      span.className = 'prompt-image-marker';
      span.textContent = before;
      nodes.push(span);
    } else {
      const span = document.createElement('span');
      span.className = 'plain';
      span.textContent = before;
      nodes.push(span);
    }
  }

  if (selFrom < selTo) {
    const selectedText = fullText.slice(selFrom, selTo);
    const selSpan = document.createElement('span');
    selSpan.className = 'selected';
    if (isMarker) {
      // wrap marker content so badge can be overridden by .selected
      const markerSpan = document.createElement('span');
      markerSpan.className = 'prompt-image-marker';
      markerSpan.textContent = selectedText;
      selSpan.appendChild(markerSpan);
    } else {
      const plainSel = document.createElement('span');
      plainSel.className = 'plain';
      plainSel.textContent = selectedText;
      selSpan.appendChild(plainSel);
    }
    nodes.push(selSpan);
  }

  if (selTo < to) {
    const after = fullText.slice(selTo, to);
    if (isMarker) {
      const span = document.createElement('span');
      span.className = 'prompt-image-marker';
      span.textContent = after;
      nodes.push(span);
    } else {
      const span = document.createElement('span');
      span.className = 'plain';
      span.textContent = after;
      nodes.push(span);
    }
  }
}
