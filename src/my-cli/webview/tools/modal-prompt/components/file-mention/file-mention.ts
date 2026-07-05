import fileMentionCss from './file-mention.css';
import type { FileMentionEntry, FileMentionRequest } from '../../../../../shared/prompt/file-mention';
import { fuzzyMatch } from '../../../../../shared/prompt/fuzzy-match';
import { matchesShortcut } from '../../../../../../shared/keymaps/cli';

const stylesId = 'cli-file-mention-styles';
const mentionAliasMap = new Map<string, string>();
const maxVisibleItems = 40;

const ensureStyles = () => {
	if (document.getElementById(stylesId)) { return; }
	const s = document.createElement('style');
	s.id = stylesId;
	s.textContent = fileMentionCss;
	document.head.append(s);
};

export function resolveFileMentionAliases(text: string): string {
	return text.replace(/(?<=^|\s)@\S+/g, (mention) => {
		const realPath = mentionAliasMap.get(mention);
		if (realPath) {
			return `@${realPath}`;
		}

		if (mention.startsWith('@~/')) {
			return `@${mention.slice(3)}`;
		}

		return mention;
	});
}

const getEntryDisplayPath = (entry: FileMentionEntry) => entry.displayPath || entry.path;

const getEntryRealPath = (entry: FileMentionEntry) => {
	return entry.isDirectory && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path;
};

const getEntryInsertPath = (entry: FileMentionEntry) => {
	const displayPath = getEntryDisplayPath(entry);
	return entry.isDirectory && !displayPath.endsWith('/') ? `${displayPath}/` : displayPath;
};

const registerMentionAlias = (entry: FileMentionEntry) => {
	mentionAliasMap.set(`@${getEntryInsertPath(entry)}`, getEntryRealPath(entry));
};

export function mountFileMentionPicker(
	textarea: HTMLTextAreaElement,
	container: HTMLElement,
	requestFiles: FileMentionRequest,
	signal?: AbortSignal
) {
	ensureStyles();

	let dropdown: HTMLElement | null = null;
	let entries: FileMentionEntry[] = [];
	let activeIndex = 0;
	let mentionStart = -1; // position of "@" in textarea
	let currentQuery = '';

	// Cache full workspace list for the lifetime of this prompt panel mount.
	// Avoids hammering the host with findFiles on every keystroke after "@".
	let cachedEntries: FileMentionEntry[] | null = null;
	let entriesInFlight: Promise<FileMentionEntry[]> | null = null;
	let filterTimer: number | undefined;

	// One host round-trip at a time: reuse the in-flight fetch so typing "@" during the
	// mount warm-up can't kick off a second findFiles.
	const ensureEntries = (): Promise<FileMentionEntry[]> => {
		if (cachedEntries) { return Promise.resolve(cachedEntries); }
		if (!entriesInFlight) {
			entriesInFlight = requestFiles('')
				.then((files) => {
					cachedEntries = files;
					files.forEach(registerMentionAlias);
					return files;
				})
				.finally(() => { entriesInFlight = null; });
		}
		return entriesInFlight;
	};

	// Warm the cache on mount so the first "@" opens instantly.
	void ensureEntries();

	// Portal target: we append the dropdown here (instead of the small textarea wrap)
	// so it can float freely in the upper area of the whole modal without being
	// height-clipped by the input box or .prompt-modal card.
	// We use #cli-tools-modal (the full overlay) when available for maximum freedom.
	const portal = (container.closest('#cli-tools-modal') ||
	                container.closest('.prompt-modal') ||
	                document.body) as HTMLElement;

	// ── helpers ──────────────────────────────────────────────────────

	/**
	 * Position the dropdown "above" the textarea using the portal as containing block.
	 * This allows the picker to have full height freedom in the upper part of the
	 * dialog (it is no longer constrained to the height of .prompt-textarea-wrap
	 * or the prompt card itself).
	 */
	const positionDropdown = () => {
		if (!dropdown) { return; }

		const taRect = textarea.getBoundingClientRect();
		const portalRect = portal.getBoundingClientRect();

		// Measure after content is rendered so we have the real list height.
		const h = dropdown.offsetHeight || 220;

		// Place the *bottom* of the dropdown a few px above the top of the textarea,
		// relative to the portal (so it can live high up in the modal overlay).
		const left = taRect.left - portalRect.left;
		const top = taRect.top - portalRect.top - h - 6;

		// Clamp left so the dropdown doesn't overflow the right edge of the portal
		// (helps when the input is near the right of the card and 320px width would
		// otherwise hang too far "de costado").
		let finalLeft = left;
		const dropdownWidth = dropdown.offsetWidth || 320;
		const maxLeft = Math.max(0, portalRect.width - dropdownWidth - 12);
		if (finalLeft > maxLeft) {
			finalLeft = maxLeft;
		}

		Object.assign(dropdown.style, {
			position: 'absolute',
			left: `${finalLeft}px`,
			top: `${top}px`,
			// Clear legacy bottom positioning from previous implementation
			bottom: '',
		});
	};

	/**
	 * Wrap the matched characters of a name in highlight tags so the user
	 * sees *why* an entry surfaced (e.g. "test-pro" lighting up inside
	 * "test-del-projecto.ts"). Built with text nodes — names come from the
	 * filesystem and must never be parsed as HTML.
	 */
	const buildNameSpan = (name: string, positions: number[]): HTMLSpanElement => {
		const span = document.createElement('span');
		span.className = 'fm-name';

		let cursor = 0;
		for (let i = 0; i < positions.length; ) {
			// Coalesce consecutive positions into one highlight run.
			let runEnd = i;
			while (runEnd + 1 < positions.length && positions[runEnd + 1] === positions[runEnd] + 1) {
				runEnd++;
			}
			const start = positions[i];
			const end = positions[runEnd] + 1;

			if (start > cursor) {
				span.append(name.slice(cursor, start));
			}
			const mark = document.createElement('b');
			mark.className = 'fm-match';
			mark.textContent = name.slice(start, end);
			span.append(mark);

			cursor = end;
			i = runEnd + 1;
		}
		if (cursor < name.length) {
			span.append(name.slice(cursor));
		}

		return span;
	};

	const renderItems = (items: FileMentionEntry[], filter: string) => {
		if (!dropdown) { return; }
		const list = dropdown.querySelector<HTMLElement>('.fm-list');
		if (!list) { return; }

		// Fuzzy subsequence ranking (quick-open style): "test-pro" matches
		// "test-del-projecto.ts". Entries split into tiers — name matches (tier 1)
		// always outrank path-only matches (tier 0). Within each tier, folders come
		// before files (the explorer "folders first" rule), then by relevance, then
		// alphabetical. Grouping by tier first is what keeps a weakly path-matched
		// folder from leapfrogging a strong file name match.
		const query = filter.trim();
		const allowVscode = query.startsWith('.');

		type ScoredEntry = { entry: FileMentionEntry; score: number; namePositions: number[]; tier: number };

		const scoreEntry = (entry: FileMentionEntry): ScoredEntry | undefined => {
			if (!allowVscode && isVscodePath(entry.path)) {
				return undefined;
			}
			if (!query) {
				return { entry, score: 0, namePositions: [], tier: 0 };
			}
			const nameMatch = fuzzyMatch(query, entry.name);
			if (nameMatch) {
				return { entry, score: nameMatch.score, namePositions: nameMatch.positions, tier: 1 };
			}
			const displayPathMatch = entry.displayPath ? fuzzyMatch(query, entry.displayPath) : undefined;
			if (displayPathMatch) {
				return { entry, score: displayPathMatch.score, namePositions: [], tier: 0 };
			}
			const pathMatch = fuzzyMatch(query, entry.path);
			if (pathMatch) {
				return { entry, score: pathMatch.score, namePositions: [], tier: 0 };
			}
			return undefined;
		};

		const scored = items
			.map(scoreEntry)
			.filter((s): s is ScoredEntry => s !== undefined)
			.sort((a, b) => {
				// 1) Name matches above path-only matches.
				if (a.tier !== b.tier) { return b.tier - a.tier; }
				// 2) Within a tier, folders before files.
				if (a.entry.isDirectory !== b.entry.isDirectory) { return a.entry.isDirectory ? -1 : 1; }
				// 3) Then by fuzzy relevance, then alphabetical.
				if (a.score !== b.score) { return b.score - a.score; }
				return a.entry.name.localeCompare(b.entry.name);
			});

		const visible = scored.slice(0, maxVisibleItems);
		entries = visible.map((s) => s.entry);
		activeIndex = 0;

		if (visible.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'fm-empty';
			empty.textContent = 'No files found';
			list.replaceChildren(empty);
			return;
		}

		// Build every row off-DOM, then swap it in with a single mutation.
		const frag = document.createDocumentFragment();
		visible.forEach(({ entry, namePositions }, i) => {
			const item = document.createElement('div');
			item.className = 'fm-item' + (i === 0 ? ' active' : '');
			item.dataset.index = String(i);
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', i === 0 ? 'true' : 'false');

			const iconEl = document.createElement('span');
			iconEl.className = `fm-icon ${entry.isDirectory ? 'folder' : 'file'}`;
			iconEl.textContent = entry.isDirectory ? '📁' : '📄';
			iconEl.setAttribute('aria-hidden', 'true'); // decorative emoji

			// Show the real parent path for disambiguation; the inserted token
			// stays compact via displayPath.
			const dir = entry.path.includes('/')
				? entry.path.slice(0, entry.path.lastIndexOf('/')) || '.'
				: '.';
			const pathEl = document.createElement('span');
			pathEl.className = 'fm-path';
			pathEl.textContent = dir;

			item.append(iconEl, buildNameSpan(entry.name, namePositions), pathEl);

			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				selectEntry(entry);
			});

			frag.appendChild(item);
		});
		list.replaceChildren(frag);
	};

	const isVscodePath = (entryPath: string): boolean => {
		return entryPath === '.vscode' || entryPath.startsWith('.vscode/');
	};

	const updateActive = () => {
		if (!dropdown) { return; }
		dropdown.querySelectorAll('.fm-item').forEach((el, i) => {
			const isActive = i === activeIndex;
			el.classList.toggle('active', isActive);
			el.setAttribute('aria-selected', isActive ? 'true' : 'false');
			if (isActive) {
				(el as HTMLElement).scrollIntoView({ block: 'nearest' });
			}
		});
	};

	const selectEntry = (entry: FileMentionEntry) => {
		// Replace "@query" in textarea with a compact "@~/name " alias.
		// The real workspace-relative path is kept in mentionAliasMap and restored
		// just before sending to the CLI.
		const before = textarea.value.slice(0, mentionStart);
		const after = textarea.value.slice(mentionStart + 1 + currentQuery.length);
		const insertPath = getEntryInsertPath(entry);
		const insert = `@${insertPath} `;
		registerMentionAlias(entry);
		const newValue = before + insert + after;
		const pos = before.length + insert.length;

		// Close first to avoid re-triggering the input handler during dispatch
		closeDropdown();

		textarea.value = newValue;
		textarea.setSelectionRange(pos, pos);
		textarea.focus();
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
	};

	const closeDropdown = () => {
		window.clearTimeout(filterTimer);
		dropdown?.remove();
		dropdown = null;
		mentionStart = -1;
		currentQuery = '';
		document.removeEventListener('click', onOutsideClick);
		// Drop the cache so the *next* "@" trigger refetches from the host. This
		// is what makes folders/files created while the prompt stays open show up:
		// delete the whole "@path", type "@" again → fresh findFiles. During a
		// single open session (typing/filtering after "@") the cache still serves
		// every keystroke, so we never re-hit the host mid-query.
		cachedEntries = null;
	};

	const onOutsideClick = (e: MouseEvent) => {
		if (dropdown && !dropdown.contains(e.target as Node) && e.target !== textarea) {
			closeDropdown();
		}
	};

	// Close the dropdown (its document click listener with it) if the prompt
	// panel unmounts while it is open — the portal outlives the textarea.
	signal?.addEventListener('abort', () => closeDropdown());

	const openDropdown = async (query: string) => {
		const isFirstCreation = !dropdown;

		if (isFirstCreation) {
			dropdown = document.createElement('div');
			dropdown.className = 'fm-dropdown';

			dropdown.innerHTML = `
				<div class="fm-list" role="listbox" aria-label="File and folder suggestions"></div>
			`;
		}

		const available = cachedEntries ?? await ensureEntries();

		renderItems(available, query);

		if (isFirstCreation && dropdown) {
			// Append *after* we have real content (and thus real height).
			// No empty unpositioned box flashes during the initial fetch.
			// Append to portal so the tall list can live freely above the prompt card.
			portal.appendChild(dropdown);
			document.addEventListener('click', onOutsideClick);
		}

		// Always (re)position after render because:
		// - list height depends on filter results
		// - textarea may have grown
		// This uses the portal for absolute coords so the picker is not clipped
		// by the small .prompt-textarea-wrap or the modal card height.
		positionDropdown();
	};

	// ── Textarea listeners ───────────────────────────────────────────

	/**
	 * Ctrl+Backspace while the caret is right after an @mention:
	 * deletes the whole token — '@' included — in one press (the
	 * trailing space too, when present), leaving no orphan '@'.
	 * Returns true if it handled the event (caller should return early).
	 */
	const handleMentionCtrlBackspace = (e: KeyboardEvent): boolean => {
		if (!e.ctrlKey || e.key !== 'Backspace') { return false; }

		const caret = textarea.selectionStart ?? 0;
		const selEnd = textarea.selectionEnd ?? 0;

		// Only act when nothing is selected and caret is not at the very start
		if (caret !== selEnd || caret === 0) { return false; }

		const value = textarea.value;

		// selectEntry appends a trailing space after the path ("@path ").
		// If the caret is sitting right after that space, skip it before scanning
		// so the backwards walk reaches '@' in one Ctrl+Backspace press.
		// We also extend the delete range to consume that trailing space.
		let scanFrom = caret;
		if (scanFrom > 0 && value[scanFrom - 1] === ' ') {
			scanFrom -= 1;
		}

		// Scan backwards looking for a bare '@' trigger.
		// Stop at any whitespace that isn't the one space we already skipped.
		let atPos = -1;
		for (let i = scanFrom - 1; i >= 0; i--) {
			const ch = value[i];
			if (ch === '@') {
				// Valid trigger: at start-of-string OR preceded by whitespace
				if (i === 0 || /\s/.test(value[i - 1])) {
					atPos = i;
				}
				break;
			}
			if (/\s/.test(ch)) { break; } // left the token, stop
		}

		if (atPos === -1) { return false; }

		// Delete the whole mention — '@' included — from its start up to the
		// original caret (the trailing space too, when present) in one press.
		e.preventDefault();
		e.stopPropagation();
		const newValue = value.slice(0, atPos) + value.slice(caret);
		textarea.value = newValue;
		const newPos = atPos;
		textarea.setSelectionRange(newPos, newPos);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	};

	textarea.addEventListener('keydown', (e) => {
		// Ctrl+Backspace on an @mention → erase the path, keep '@'
		// Must run BEFORE the dropdown guard so it works even when dropdown is closed.
		if (handleMentionCtrlBackspace(e)) { return; }

		if (!dropdown) { return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); if (entries.length) { activeIndex = (activeIndex + 1) % entries.length; updateActive(); } }
		if (e.key === 'ArrowUp')   { e.preventDefault(); if (entries.length) { activeIndex = (activeIndex + entries.length - 1) % entries.length; updateActive(); } }
		if (matchesShortcut(e, 'sendPrompt')) { /* let send shortcut handle */ return; }
		if (e.key === 'Enter')  { e.preventDefault(); if (entries[activeIndex]) { selectEntry(entries[activeIndex]); } }
		if (e.key === 'Escape') {
			e.stopPropagation();
			// Clean up only an accidental, bare "@": caret right after it, nothing
			// typed yet, no selection. Any query or surrounding text is left intact.
			const at = mentionStart;
			const isBareTrigger =
				at >= 0 &&
				textarea.value[at] === '@' &&
				textarea.selectionStart === at + 1 &&
				textarea.selectionStart === textarea.selectionEnd;
			closeDropdown();
			if (isBareTrigger) {
				const value = textarea.value;
				textarea.value = value.slice(0, at) + value.slice(at + 1);
				textarea.setSelectionRange(at, at);
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			}
		}
		if (e.key === 'Tab')    { e.preventDefault(); if (entries[activeIndex]) { selectEntry(entries[activeIndex]); } }
	});

	textarea.addEventListener('input', () => {
		const value = textarea.value;
		const caret = textarea.selectionStart ?? 0;

		// Scan backwards from caret to find an "@" not preceded by word char
		let atPos = -1;
		for (let i = caret - 1; i >= 0; i--) {
			const ch = value[i];
			if (ch === '@') {
				// valid trigger: at start or preceded by whitespace
				if (i === 0 || /\s/.test(value[i - 1])) {
					atPos = i;
				}
				break;
			}
			// If we hit a space before "@", stop
			if (/\s/.test(ch)) { break; }
		}

		if (atPos === -1) {
			window.clearTimeout(filterTimer);
			if (dropdown) { closeDropdown(); }
			return;
		}

		mentionStart = atPos;
		currentQuery = value.slice(atPos + 1, caret);
		window.clearTimeout(filterTimer);
		filterTimer = window.setTimeout(() => {
			void openDropdown(currentQuery);
		}, 50);
	});
}
