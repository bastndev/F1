import fileMentionCss from './file-mention.css';
import type { FileMentionEntry, FileMentionRequest } from '../../../../../../core/tools-cli-core/prompt/file-mention';

const stylesId = 'cli-file-mention-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) { return; }
	const s = document.createElement('style');
	s.id = stylesId;
	s.textContent = fileMentionCss;
	document.head.append(s);
};

export function mountFileMentionPicker(
	textarea: HTMLTextAreaElement,
	container: HTMLElement,
	requestFiles: FileMentionRequest
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

	const renderItems = (items: FileMentionEntry[], filter: string) => {
		if (!dropdown) { return; }
		const list = dropdown.querySelector<HTMLElement>('.fm-list');
		if (!list) { return; }

		// Relevance-first sort: name starts-with query > name contains query > path contains query.
		// Within each tier: directories before files, then alphabetical.
		const lc = filter.toLowerCase();

		/** 0 = name starts with query (best), 1 = name contains query, 2 = only path matches */
		const relevance = (e: FileMentionEntry): number => {
			const nameLc = e.name.toLowerCase();
			if (nameLc.startsWith(lc)) { return 0; }
			if (nameLc.includes(lc))   { return 1; }
			return 2;
		};

		const filtered = items
			.filter(e => {
				const haystack = `${e.name} ${e.path}`.toLowerCase();
				return haystack.includes(lc);
			})
			.sort((a, b) => {
				const ra = relevance(a);
				const rb = relevance(b);
				if (ra !== rb) { return ra - rb; }
				// Within same relevance tier: directories first, then alphabetical
				if (a.isDirectory !== b.isDirectory) { return a.isDirectory ? -1 : 1; }
				return a.name.localeCompare(b.name);
			});

		entries = filtered;
		activeIndex = 0;

		if (filtered.length === 0) {
			list.innerHTML = `<div class="fm-empty">No files found</div>`;
			return;
		}

		list.innerHTML = '';
		filtered.forEach((entry, i) => {
			const item = document.createElement('div');
			item.className = 'fm-item' + (i === 0 ? ' active' : '');
			item.dataset.index = String(i);

			const iconClass = entry.isDirectory ? 'folder' : 'file';
			const icon = entry.isDirectory ? '📁' : '📄';
			// show relative path without the filename (parent dir)
			const dir = entry.path.includes('/')
				? entry.path.slice(0, entry.path.lastIndexOf('/')) || '.'
				: '.';

			item.innerHTML = `
				<span class="fm-icon ${iconClass}">${icon}</span>
				<span class="fm-name">${entry.name}</span>
				<span class="fm-path">${dir}</span>
			`;

			item.addEventListener('mousedown', (e) => {
				e.preventDefault();
				selectEntry(entry);
			});

			list.appendChild(item);
		});
	};

	const updateActive = () => {
		if (!dropdown) { return; }
		dropdown.querySelectorAll('.fm-item').forEach((el, i) => {
			el.classList.toggle('active', i === activeIndex);
			if (i === activeIndex) {
				(el as HTMLElement).scrollIntoView({ block: 'nearest' });
			}
		});
	};

	const selectEntry = (entry: FileMentionEntry) => {
		// Replace "@query" in textarea with "@path " (trailing space for natural flow)
		const before = textarea.value.slice(0, mentionStart);
		const after = textarea.value.slice(mentionStart + 1 + currentQuery.length);
		const insert = `@${entry.path} `;
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
		dropdown?.remove();
		dropdown = null;
		mentionStart = -1;
		currentQuery = '';
		document.removeEventListener('click', onOutsideClick);
		// Note: we intentionally keep cachedEntries for the rest of the prompt session
	};

	const onOutsideClick = (e: MouseEvent) => {
		if (dropdown && !dropdown.contains(e.target as Node) && e.target !== textarea) {
			closeDropdown();
		}
	};

	const openDropdown = async (query: string) => {
		const isFirstCreation = !dropdown;

		if (isFirstCreation) {
			dropdown = document.createElement('div');
			dropdown.className = 'fm-dropdown';

			dropdown.innerHTML = `
				<div class="fm-list"></div>
			`;
		}

		if (!cachedEntries) {
			// First time for this prompt panel instance: fetch from host (expensive findFiles)
			cachedEntries = await requestFiles(query);
		}

		renderItems(cachedEntries!, query);

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
	 * deletes everything between '@' and the caret, leaving '@' so
	 * the user can type a new path without closing the modal.
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

		// Delete from the char right after '@' up to the original caret
		// (includes the trailing space when present) → leaves a clean '@'
		e.preventDefault();
		e.stopPropagation();
		const newValue = value.slice(0, atPos + 1) + value.slice(caret);
		textarea.value = newValue;
		const newPos = atPos + 1;
		textarea.setSelectionRange(newPos, newPos);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	};

	textarea.addEventListener('keydown', (e) => {
		// Ctrl+Backspace on an @mention → erase the path, keep '@'
		// Must run BEFORE the dropdown guard so it works even when dropdown is closed.
		if (handleMentionCtrlBackspace(e)) { return; }

		if (!dropdown) { return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, entries.length - 1); updateActive(); }
		if (e.key === 'ArrowUp')   { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); updateActive(); }
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { /* let send shortcut handle */ return; }
		if (e.key === 'Enter')  { e.preventDefault(); if (entries[activeIndex]) { selectEntry(entries[activeIndex]); } }
		if (e.key === 'Escape') { e.stopPropagation(); closeDropdown(); }
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
			if (dropdown) { closeDropdown(); }
			return;
		}

		mentionStart = atPos;
		currentQuery = value.slice(atPos + 1, caret);
		void openDropdown(currentQuery);
	});
}
