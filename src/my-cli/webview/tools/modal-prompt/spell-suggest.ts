/**
 * Alt/Ctrl-click spell fixing for the prompt textarea.
 *
 * A misspelled word carries its top correction (computed host-side during the
 * spellcheck pass; for Spanish the personal-typo fix is placed first). So:
 *   • Alt or Ctrl + Left-click on a red word  → replace it in place with that
 *     correction (instant, no round-trip). If there is none → a small
 *     "No suggestions" note.
 *   • Alt or Ctrl + hover over a red word     → the cursor turns into a pointer
 *     so the word reads as actionable.
 *
 * Hit-testing the click uses the textarea's native caret (a modified click
 * still positions the caret, so selectionStart tells us which issue was hit).
 * Hover uses the overlay's `.prompt-misspelled` rects, which mirror the textarea
 * layout exactly, so the textarea can stay on top for normal editing.
 */
import type { SpellIssue } from '../../../shared/prompt';

interface SpellSuggestOptions {
	textarea: HTMLTextAreaElement;
	/** The highlight overlay that paints the squiggles (may be absent). */
	highlight: HTMLElement | null;
	/** Current misspelled ranges (with their corrections). */
	getSpellIssues: () => SpellIssue[];
	/** Re-mark the text after a fix is applied. */
	onApplied: () => void;
}

export function initSpellSuggest({ textarea, highlight, getSpellIssues, onApplied }: SpellSuggestOptions) {
	// ── Alt or Ctrl + click → apply the top correction for the clicked word ──
	textarea.addEventListener('click', (event) => {
		if (!event.altKey && !event.ctrlKey) {
			return;
		}

		const pos = textarea.selectionStart ?? -1;
		if (pos < 0) {
			return;
		}

		const issue = getSpellIssues().find((i) => pos >= i.offset && pos <= i.offset + i.length);
		if (!issue) {
			return;
		}

		const fix = issue.suggestions?.[0];
		if (!fix) {
			showNote(event.clientX, event.clientY, 'No suggestions');
			return;
		}

		applyFix(textarea, issue, fix, onApplied);
	});

	// ── Alt or Ctrl + hover → pointer cursor over a red word ──
	let pointerActive = false;
	const setPointer = (on: boolean) => {
		if (on === pointerActive) {
			return;
		}
		pointerActive = on;
		textarea.style.cursor = on ? 'pointer' : '';
	};

	textarea.addEventListener('mousemove', (event) => {
		if (!(event.altKey || event.ctrlKey) || !highlight) {
			setPointer(false);
			return;
		}
		setPointer(isOverMisspelled(highlight, event.clientX, event.clientY));
	});

	textarea.addEventListener('mouseleave', () => setPointer(false));
	window.addEventListener('keyup', (event) => {
		if (event.key === 'Alt' || event.key === 'Control') {
			setPointer(false);
		}
	});
	window.addEventListener('blur', () => setPointer(false));
}

function applyFix(
	textarea: HTMLTextAreaElement,
	issue: SpellIssue,
	fix: string,
	onApplied: () => void
) {
	const { offset, length, word } = issue;

	// Guard against stale offsets (text edited since the last spellcheck).
	if (textarea.value.slice(offset, offset + length) !== word) {
		return;
	}

	const replacement = matchLeadingCase(word, fix);
	textarea.value = textarea.value.slice(0, offset) + replacement + textarea.value.slice(offset + length);

	const caret = offset + replacement.length;
	textarea.setSelectionRange(caret, caret);
	textarea.focus();
	// Drives draft save, char count, undo snapshot and a fresh highlight pass.
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	// Clear the now-fixed mark immediately and re-check the rest.
	onApplied();
}

/** Carry the original word's leading capital onto a lowercase dictionary fix. */
function matchLeadingCase(original: string, fix: string): string {
	const first = original.charAt(0);
	if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
		return fix.charAt(0).toUpperCase() + fix.slice(1);
	}
	return fix;
}

function isOverMisspelled(highlight: HTMLElement, x: number, y: number): boolean {
	for (const span of Array.from(highlight.querySelectorAll('.prompt-misspelled'))) {
		for (const rect of Array.from(span.getClientRects())) {
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				return true;
			}
		}
	}
	return false;
}

let noteEl: HTMLElement | null = null;
let noteTimer: number | undefined;

function showNote(x: number, y: number, text: string) {
	noteEl?.remove();
	window.clearTimeout(noteTimer);

	noteEl = document.createElement('div');
	noteEl.className = 'prompt-spell-note';
	noteEl.textContent = text;
	noteEl.style.left = `${x}px`;
	noteEl.style.top = `${y}px`;
	document.body.appendChild(noteEl);

	noteTimer = window.setTimeout(() => {
		noteEl?.remove();
		noteEl = null;
	}, 1500);
}
