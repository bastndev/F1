import fileMentionCss from './file-mention.css';

export type FileMentionEntry = {
	name: string;
	path: string;
	isDirectory: boolean;
};

export type FileMentionRequest = (query: string) => Promise<FileMentionEntry[]>;

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

	// ── helpers ──────────────────────────────────────────────────────

	const getDropdownPosition = () => {
		const rect = textarea.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		return {
			bottom: containerRect.bottom - rect.top,
			left: 0,
		};
	};

	const renderItems = (items: FileMentionEntry[], filter: string) => {
		if (!dropdown) { return; }
		const list = dropdown.querySelector<HTMLElement>('.fm-list');
		if (!list) { return; }

		// folders first, then files; both filtered by query
		const lc = filter.toLowerCase();
		const filtered = items
			.filter(e => e.name.toLowerCase().includes(lc))
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
			// show relative path without the filename
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
		// Replace "@query" in textarea with the file path
		const before = textarea.value.slice(0, mentionStart);
		const after  = textarea.value.slice(mentionStart + 1 + currentQuery.length);
		const insert = `@${entry.path}`;
		textarea.value = before + insert + after;
		const pos = before.length + insert.length;
		textarea.setSelectionRange(pos, pos);
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		closeDropdown();
		textarea.focus();
	};

	const closeDropdown = () => {
		dropdown?.remove();
		dropdown = null;
		mentionStart = -1;
		currentQuery = '';
		document.removeEventListener('click', onOutsideClick);
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

			const pos = getDropdownPosition();
			Object.assign(dropdown.style, {
				position: 'absolute',
				bottom: pos.bottom + 'px',
				left: pos.left + 'px',
			});

			dropdown.innerHTML = `
				<div class="fm-list"></div>
			`;

			container.appendChild(dropdown);
			document.addEventListener('click', onOutsideClick);
		}

		// Load file list from host
		const allEntries = await requestFiles(query);
		renderItems(allEntries, query);
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
