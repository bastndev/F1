/**
 * Forces lowercase typing in the prompt textarea, with Shift as the only way
 * to write uppercase (defeats Caps Lock) and auto-capitalization of the very
 * first character. Pastes keep their original casing — an UPPERCASE block
 * pasted in stays uppercase — and image-paste / paste-collapse content is left
 * untouched for its dedicated handlers.
 */
import { shouldCollapsePaste } from '../../../shared/prompt';
import { getLeadingSkillTokenGuardEnd, imagePathPattern } from './attachments-ui';

const isSentenceStartAfterPrefix = (value: string, start: number, end: number) => {
	const before = value.slice(0, start);
	const after = value.slice(end);
	const noWordAfterSelection = after.trimStart() === after;
	const isAbsoluteStart = start === 0 && before === '';
	const isAfterLeadingSkillToken = /^(?:\/skills #\d+|\/skill(?!s))\s+$/.test(before);

	return noWordAfterSelection && (isAbsoluteStart || isAfterLeadingSkillToken);
};

export function enforceLowercaseInput(textarea: HTMLTextAreaElement) {
	textarea.addEventListener('keydown', (e) => {
		if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
			if (e.ctrlKey || e.metaKey) {
				return; // keyboard shortcuts (Ctrl+C, Ctrl+V, etc.) — let browser handle
			}
			e.preventDefault();
			const guardEnd = getLeadingSkillTokenGuardEnd(textarea.value);
			const start = Math.max(textarea.selectionStart ?? 0, guardEnd);
			const end = Math.max(textarea.selectionEnd ?? 0, guardEnd);
			let char: string;
			if (e.shiftKey) {
				char = e.key.toUpperCase();
			} else {
				// Auto-capitalize the first user-written character; a leading
				// /skill token is only a prefix and should not force lowercase.
				const isFirstChar = isSentenceStartAfterPrefix(textarea.value, start, end);
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
		// Pasted text keeps its original casing — only typed characters are forced
		// lowercase. So an UPPERCASE block dropped into the prompt stays as-is.
		const text = pastedForCheck;
		const guardEnd = getLeadingSkillTokenGuardEnd(textarea.value);
		const start = Math.max(textarea.selectionStart ?? 0, guardEnd);
		const end = Math.max(textarea.selectionEnd ?? 0, guardEnd);
		textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
		const newPos = start + text.length;
		textarea.selectionStart = textarea.selectionEnd = newPos;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	});
}
