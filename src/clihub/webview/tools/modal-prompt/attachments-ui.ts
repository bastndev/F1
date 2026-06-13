/**
 * Textarea-side attachment handling: pasted screenshots and image paths
 * become atomic [Image #N] markers, large text/code pastes collapse into
 * [Code/Text #N +X lines] markers, and delete/arrow keys treat every marker
 * as a single unit. The verbatim paste contents and image data live with the
 * caller; this module only manages the markers inside the textarea.
 */
import {
	collectImageMarkerIds,
	isImageAttachment,
	shouldCollapsePaste,
	skillsTokenPattern,
	type ImageAttachment
} from '../../../shared/prompt';

// Image paste support (screenshots from clipboard + pasted image paths) — adapted for our prompt chat.
// When Execute is pressed the resolved image paths are substituted so they appear in the CLI input.
export const imagePathPattern =
	/(?:"([^"\r\n]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?))"|'([^'\r\n]+\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?))'|((?:~|\/)[^\r\n\t"'<>]*?\.(?:png|jpe?g|gif|webp|bmp|svg|tiff?)))/gi;

// Every atomic token in the textarea: [Image #N], [Code #N +X lines],
// [Text #N +X lines], [Skill #name]. Used by delete/arrow/caret handling so
// all marker types behave as single units.
export const atomicMarkerPattern = new RegExp(
	String.raw`\[(?:Image|Code|Text) #\d+[^\]]*\]|${skillsTokenPattern.source}`,
	'g'
);

export function replaceImagePathsWithMarkers(text: string, register: (path: string) => string): string {
	if (!text) {
		return text;
	}
	return text.replace(imagePathPattern, (match, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) => {
		const p = (doubleQuoted ?? singleQuoted ?? unquoted ?? match).trim();
		return register(p);
	});
}

export function getReferencedImageAttachments(text: string, attachments: ImageAttachment[]): ImageAttachment[] {
	const ids = collectImageMarkerIds(text);
	return attachments.filter((a) => ids.has(a.id) && isImageAttachment(a));
}

export function insertTextAtSelection(textarea: HTMLTextAreaElement, text: string) {
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

export function handleImageMarkerDeleteKey(textarea: HTMLTextAreaElement, event: KeyboardEvent): boolean {
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

	for (const match of text.matchAll(atomicMarkerPattern)) {
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

export function handleImageMarkerArrowKey(textarea: HTMLTextAreaElement, event: KeyboardEvent): boolean {
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

	for (const match of textarea.value.matchAll(atomicMarkerPattern)) {
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

export function getImageTypeFromPath(path: string): string {
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

export function getPathBaseName(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function setupImagePaste(
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

		// Large text-only pastes belong to the collapse handler, even when they
		// happen to contain image paths somewhere inside.
		if (imageFiles.length === 0 && shouldCollapsePaste(pastedText)) {
			return;
		}

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

export function setupPasteCollapse(textarea: HTMLTextAreaElement, registerPaste: (content: string) => string) {
	textarea.addEventListener('paste', (event: ClipboardEvent) => {
		const clipboardData = event.clipboardData;
		if (!clipboardData) {
			return;
		}

		// Real image files are the image handler's job.
		const hasImageFile = Array.from(clipboardData.items).some(
			(item) => item.kind === 'file' && item.type.startsWith('image/')
		);
		if (hasImageFile) {
			return;
		}

		const pastedText = clipboardData.getData('text/plain');
		if (!shouldCollapsePaste(pastedText)) {
			return;
		}

		event.preventDefault();
		const marker = registerPaste(pastedText);
		// Trailing space so the cursor lands ready to keep typing, like @mentions.
		insertTextAtSelection(textarea, marker + ' ');
	});
}
