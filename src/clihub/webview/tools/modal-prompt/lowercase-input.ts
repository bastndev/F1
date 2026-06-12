/**
 * Forces lowercase typing in the prompt textarea, with Shift as the only way
 * to write uppercase (defeats Caps Lock) and auto-capitalization of the very
 * first character. Pastes are lowercased too — unless they belong to the
 * image-paste or paste-collapse handlers, which must see them untouched.
 */
import { shouldCollapsePaste } from '../../../shared/prompt';
import { imagePathPattern } from './attachments-ui';

export function enforceLowercaseInput(textarea: HTMLTextAreaElement) {
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
		if (hasImageFile || looksLikeImagePath || shouldCollapsePaste(pastedForCheck)) {
			// Do not lowercase or prevent here — the dedicated image/collapse paste listeners handle these.
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
