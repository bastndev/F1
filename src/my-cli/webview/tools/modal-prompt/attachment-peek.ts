/**
 * Peek UI for atomic attachment markers in the prompt textarea:
 *   • Click a collapsed-paste marker ([Code #N +X lines] / [Text …]) → popover
 *     with the verbatim content, editable in place, plus Copy / Remove.
 *   • Hover an [Image #N] marker → thumbnail (clipboard images carry a data
 *     URL; path images show their path).
 *
 * Hit-testing uses the highlight overlay's marker spans — they mirror the
 * textarea layout exactly (same trick as spell-suggest). Plain clicks only:
 * Alt/Ctrl-modified clicks belong to the spell-fix handler.
 */
import { buildPasteMarker, countLines, type ImageAttachment, type PasteAttachment } from '../../../shared/prompt';

interface AttachmentPeekOptions {
	textarea: HTMLTextAreaElement;
	/** The overlay that paints the marker spans (may be absent). */
	highlight: HTMLElement | null;
	/** Live arrays owned by the composer — mutated in place on edit/remove. */
	pasteAttachments: PasteAttachment[];
	imageAttachments: ImageAttachment[];
}

const pasteMarkerSelector = '.prompt-paste-code, .prompt-paste-text';

export function initAttachmentPeek({ textarea, highlight, pasteAttachments, imageAttachments }: AttachmentPeekOptions) {
	if (!highlight) {
		return;
	}

	const spanUnder = (selector: string, x: number, y: number): HTMLElement | undefined => {
		for (const span of Array.from(highlight.querySelectorAll<HTMLElement>(selector))) {
			for (const rect of Array.from(span.getClientRects())) {
				if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
					return span;
				}
			}
		}
		return undefined;
	};

	// ── Image thumbnail on hover ─────────────────────────────────────
	let thumb: HTMLElement | null = null;
	let thumbId = -1;

	// The textarea's own mouseleave can't fire once the modal unmounts it, so a
	// document-level watcher reaps a thumbnail orphaned by a mid-hover close.
	const onDocMoveWhileThumb = () => {
		if (!textarea.isConnected) {
			hideThumb();
		}
	};

	const hideThumb = () => {
		thumb?.remove();
		thumb = null;
		thumbId = -1;
		document.removeEventListener('mousemove', onDocMoveWhileThumb);
	};

	const showThumb = (attachment: ImageAttachment, rect: DOMRect) => {
		if (thumbId === attachment.id) {
			return;
		}
		hideThumb();

		thumb = document.createElement('div');
		thumb.className = 'prompt-peek-thumb';

		if (attachment.dataUrl) {
			const img = document.createElement('img');
			img.src = attachment.dataUrl;
			img.alt = attachment.name ?? '';
			thumb.append(img);
		}

		const caption = document.createElement('div');
		caption.className = 'prompt-peek-thumb-name';
		caption.textContent = attachment.source === 'path'
			? attachment.path ?? attachment.name ?? ''
			: attachment.name ?? '';
		thumb.append(caption);

		document.body.append(thumb);
		positionFixedAbove(thumb, rect);
		thumbId = attachment.id;
		document.addEventListener('mousemove', onDocMoveWhileThumb);
	};

	// Pointer cursor over any peekable marker, mirroring spell-suggest's guard
	// pattern (write the style only on state change).
	let pointerActive = false;
	const setPointer = (on: boolean) => {
		if (on === pointerActive) {
			return;
		}
		pointerActive = on;
		textarea.style.cursor = on ? 'pointer' : '';
	};

	textarea.addEventListener('mousemove', (event) => {
		// Modified hover belongs to the spell-fix pointer.
		if (event.altKey || event.ctrlKey) {
			hideThumb();
			return;
		}

		const imageSpan = spanUnder('.prompt-image-marker', event.clientX, event.clientY);
		if (imageSpan) {
			const id = Number(/\[Image #(\d+)\]/.exec(imageSpan.textContent ?? '')?.[1]);
			const attachment = imageAttachments.find((a) => a.id === id);
			if (attachment) {
				showThumb(attachment, imageSpan.getClientRects()[0] ?? imageSpan.getBoundingClientRect());
				setPointer(true);
				return;
			}
		}

		hideThumb();
		setPointer(!!spanUnder(pasteMarkerSelector, event.clientX, event.clientY));
	});

	textarea.addEventListener('mouseleave', () => {
		hideThumb();
		setPointer(false);
	});

	// ── Collapsed-paste peek popover ─────────────────────────────────
	let popover: HTMLElement | null = null;
	let dismissPopover: (applyEdits: boolean) => void = () => {};

	const removeMarkerFromTextarea = (marker: string) => {
		const value = textarea.value;
		const at = value.indexOf(marker);
		if (at === -1) {
			return;
		}
		let end = at + marker.length;
		if (value[end] === ' ') {
			end++;
		}
		textarea.value = value.slice(0, at) + value.slice(end);
		textarea.setSelectionRange(at, at);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	};

	const openPastePopover = (attachment: PasteAttachment, anchor: DOMRect) => {
		dismissPopover(true);

		const originalContent = attachment.content;

		popover = document.createElement('div');
		popover.className = 'prompt-peek-popover';

		const header = document.createElement('div');
		header.className = 'prompt-peek-header';
		const title = document.createElement('span');
		title.textContent = `${attachment.kind === 'code' ? 'Code' : 'Text'} #${attachment.id} · ${countLines(attachment.content)} lines`;
		const hint = document.createElement('span');
		hint.className = 'prompt-peek-hint';
		hint.textContent = 'esc to close';
		header.append(title, hint);

		const editor = document.createElement('textarea');
		editor.className = 'prompt-peek-editor';
		editor.value = attachment.content;
		editor.spellcheck = false;

		const actions = document.createElement('div');
		actions.className = 'prompt-peek-actions';

		const copyBtn = document.createElement('button');
		copyBtn.type = 'button';
		copyBtn.className = 'prompt-peek-btn';
		copyBtn.textContent = 'Copy';
		copyBtn.addEventListener('click', () => {
			navigator.clipboard.writeText(editor.value).then(
				() => {
					copyBtn.textContent = 'Copied';
					window.setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
				},
				() => {
					copyBtn.textContent = 'Copy failed';
					window.setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
				}
			);
		});

		const removeBtn = document.createElement('button');
		removeBtn.type = 'button';
		removeBtn.className = 'prompt-peek-btn danger';
		removeBtn.textContent = 'Remove';
		removeBtn.addEventListener('click', () => {
			const marker = attachment.marker;
			const idx = pasteAttachments.findIndex((a) => a.id === attachment.id);
			if (idx >= 0) {
				pasteAttachments.splice(idx, 1);
			}
			dismissPopover(false);
			removeMarkerFromTextarea(marker);
			textarea.focus();
		});

		actions.append(copyBtn, removeBtn);
		popover.append(header, editor, actions);

		// Edits are applied on close: content lives in the attachment, and the
		// marker's line count is rewritten in the textarea when it changed.
		const applyEdits = () => {
			const newContent = editor.value;
			if (newContent === originalContent) {
				return;
			}
			attachment.content = newContent;
			const newMarker = buildPasteMarker(attachment.kind, attachment.id, countLines(newContent));
			if (newMarker !== attachment.marker && textarea.value.includes(attachment.marker)) {
				textarea.value = textarea.value.replace(attachment.marker, newMarker);
				attachment.marker = newMarker;
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			} else {
				attachment.marker = newMarker;
			}
		};

		const onOutsideMousedown = (event: MouseEvent) => {
			if (popover && !popover.contains(event.target as Node)) {
				dismissPopover(true);
			}
		};

		dismissPopover = (apply: boolean) => {
			if (!popover) {
				return;
			}
			if (apply) {
				applyEdits();
			}
			popover.remove();
			popover = null;
			document.removeEventListener('mousedown', onOutsideMousedown, true);
			dismissPopover = () => {};
		};

		// Esc closes the popover only — never the whole prompt modal.
		popover.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.stopPropagation();
				dismissPopover(true);
				textarea.focus();
			}
		});

		document.addEventListener('mousedown', onOutsideMousedown, true);
		document.body.append(popover);
		positionFixedAbove(popover, anchor);
		editor.focus();
	};

	textarea.addEventListener('click', (event) => {
		// Modified clicks belong to the spell-fix handler.
		if (event.altKey || event.ctrlKey || event.metaKey) {
			return;
		}
		const span = spanUnder(pasteMarkerSelector, event.clientX, event.clientY);
		if (!span) {
			return;
		}
		const id = Number(/\[(?:Code|Text) #(\d+)/.exec(span.textContent ?? '')?.[1]);
		const attachment = pasteAttachments.find((a) => a.id === id);
		if (!attachment) {
			return;
		}
		hideThumb();
		openPastePopover(attachment, span.getClientRects()[0] ?? span.getBoundingClientRect());
	});
}

/** Place a fixed-position element above the anchor rect, clamped to the viewport
 *  (falls back to below when there is no room on top). */
function positionFixedAbove(el: HTMLElement, anchor: DOMRect) {
	const width = el.offsetWidth;
	const height = el.offsetHeight;

	let left = anchor.left + anchor.width / 2 - width / 2;
	left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));

	let top = anchor.top - height - 8;
	if (top < 8) {
		top = Math.min(anchor.bottom + 8, window.innerHeight - height - 8);
	}

	el.style.left = `${left}px`;
	el.style.top = `${top}px`;
}
