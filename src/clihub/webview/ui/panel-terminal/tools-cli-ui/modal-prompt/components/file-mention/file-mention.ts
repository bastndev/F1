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

	// ── helpers ──────────────────────────────────────────────────────

	const getDropdownPosition = () => {
		const rect = textarea.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		return {
			bottom: containerRect.bottom - rect.top,
			left: 0,
		};
	};

	const positionDropdown = () => {
		if (!dropdown) { return; }
		const pos = getDropdownPosition();
		Object.assign(dropdown.style, {
			position: 'absolute',
			bottom: pos.bottom + 'px',
			left: pos.left + 'px',
		});
	};

	const renderItems = (items: FileMentionEntry[], filter: string) => {
		if (!dropdown) { return; }
		const list = dropdown.querySelector<HTMLElement>('.fm-list');
		if (!list) { return; }

		// folders first, then files; filtered by name OR path (better discoverability)
		const lc = filter.toLowerCase();
		const filtered = items
			.filter(e => {
				const haystack = `${e.name} ${e.path}`.toLowerCase();
				return haystack.includes(lc);
			})
			.sort((a, b) => {
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
		if (!dropdown) {
			dropdown = document.createElement('div');
			dropdown.className = 'fm-dropdown';

			dropdown.innerHTML = `
				<div class="fm-list"></div>
			`;

			container.appendChild(dropdown);
			document.addEventListener('click', onOutsideClick);
		}

		// Always refresh position (textarea can grow with multiline content)
		positionDropdown();

		if (!cachedEntries) {
			// First time for this prompt panel instance: fetch from host (expensive findFiles)
			cachedEntries = await requestFiles(query);
		}

		renderItems(cachedEntries!, query);
	};

	// ── Textarea listeners ───────────────────────────────────────────

	textarea.addEventListener('keydown', (e) => {
		if (!dropdown) { return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, entries.length - 1); updateActive(); }
		if (e.key === 'ArrowUp')   { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); updateActive(); }
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { /* let send shortcut handle */ return; }
		if (e.key === 'Enter')  { e.preventDefault(); if (entries[activeIndex]) { selectEntry(entries[activeIndex]); } }
		if (e.key === 'Escape') { closeDropdown(); }
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
