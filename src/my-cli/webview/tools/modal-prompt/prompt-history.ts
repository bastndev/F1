/**
 * Shell-style recall of previously sent prompts. ArrowUp in an empty textarea
 * restores the most recent one; repeated ArrowUp walks older entries and
 * ArrowDown walks back (past the newest → empty box again). Any edit exits
 * browsing, so the arrows go back to moving the caret.
 *
 * Entries persist per CLI in localStorage ('f1-prompt-history-<slug>', newest
 * first, capped). Atomic markers are stripped on save — their attachments die
 * with the send, so a recalled [Image #2] could never resolve — while
 * @mentions survive verbatim (their aliases re-register on every mount).
 */
import { atomicMarkerPattern } from './attachments-ui';

const maxEntries = 20;

const storageKey = (slug: string) => `f1-prompt-history-${slug || 'cli'}`;

const loadHistory = (slug: string): string[] => {
	try {
		const raw = localStorage.getItem(storageKey(slug));
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
	} catch {
		return [];
	}
};

export const recordSentPrompt = (slug: string, rawText: string) => {
	const cleaned = rawText
		.replace(atomicMarkerPattern, '')
		.replace(/[^\S\n]{2,}/g, ' ')
		.trim();
	if (!cleaned) {
		return;
	}

	const entries = loadHistory(slug);
	// Re-sending an older entry moves it to the front instead of duplicating.
	const existing = entries.indexOf(cleaned);
	if (existing >= 0) {
		entries.splice(existing, 1);
	}
	entries.unshift(cleaned);

	try {
		localStorage.setItem(storageKey(slug), JSON.stringify(entries.slice(0, maxEntries)));
	} catch {
		/* storage unavailable */
	}
};

export function initPromptHistory(textarea: HTMLTextAreaElement, getSlug: () => string) {
	// Snapshot of the history taken when browsing starts; index -1 = not browsing.
	let entries: string[] = [];
	let index = -1;
	let restoring = false;

	const restore = (value: string) => {
		restoring = true;
		textarea.value = value;
		textarea.setSelectionRange(value.length, value.length);
		// Drives draft save, char count, highlight and run-button state.
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		restoring = false;
	};

	textarea.addEventListener('keydown', (e) => {
		// The file-mention dropdown owns ArrowUp/Down while open (it registers
		// first and preventDefaults) — defer to it and to any other handler
		// that already claimed the key.
		if (e.defaultPrevented) {
			return;
		}
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
			return;
		}

		if (e.key === 'ArrowUp') {
			if (index === -1) {
				// Only an empty box starts browsing — never steal the caret
				// from a prompt being written.
				if (textarea.value.trim() !== '') {
					return;
				}
				entries = loadHistory(getSlug());
				if (!entries.length) {
					return;
				}
				index = 0;
			} else if (index >= entries.length - 1) {
				e.preventDefault();
				return;
			} else {
				index++;
			}
			e.preventDefault();
			restore(entries[index]);
			return;
		}

		if (e.key === 'ArrowDown' && index >= 0) {
			e.preventDefault();
			if (index === 0) {
				index = -1;
				restore('');
			} else {
				index--;
				restore(entries[index]);
			}
		}
	});

	textarea.addEventListener('input', () => {
		if (!restoring) {
			index = -1;
		}
	});
}
