import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';

const stylesId = 'cli-prompt-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = promptStyles;
	document.head.append(style);
};

export const mountPromptPanel = (host: HTMLElement) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = promptHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	// === Tab switching logic + chat area reaction ===
	initPromptTabs(host);

	// Update footer with the correct model for the current active CLI
	updateFooterModel(host);
};

function initPromptTabs(host: HTMLElement) {
	const tabs = host.querySelectorAll<HTMLElement>('.prompt-tab');
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const textareaWrap = host.querySelector<HTMLElement>('.prompt-textarea-wrap');

	if (!tabs.length || !textarea) {
		return;
	}

	// Force lowercase input, with Shift as the only way to write uppercase
	enforceLowercaseInput(textarea);

	const updateChatForTab = (tab: string) => {
		if (!textareaWrap) {
			return;
		}

		textareaWrap.classList.toggle('is-pro', tab === 'enhance');

		if (tab === 'enhance') {
			textarea.placeholder = 'describe what you want to improve or generate…';
		} else {
			textarea.placeholder = 'Ask anything…';
		}
	};

	tabs.forEach((tabEl) => {
		tabEl.addEventListener('click', () => {
			// Switch active states
			tabs.forEach((t) => t.classList.remove('active'));
			tabEl.classList.add('active');

			const tab = tabEl.dataset.tab || 'write';
			updateChatForTab(tab);
		});
	});

	// Initialize with current active tab
	const initialActive = host.querySelector<HTMLElement>('.prompt-tab.active');
	const initialTab = initialActive?.dataset.tab || 'write';
	updateChatForTab(initialTab);

	// Auto-focus the input immediately when the modal opens
	// so the user can start typing without clicking
	requestAnimationFrame(() => {
		textarea.focus();
	});

	// === Skills chips (selectable buttons) ===
	initSkillsChips(host);

	// === Run button enable/disable logic ===
	initRunButton(host, textarea);
}

function enforceLowercaseInput(textarea: HTMLTextAreaElement) {
	// Handle normal typing + Caps Lock
	textarea.addEventListener('keydown', (e) => {
		if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
			if (e.shiftKey) {
				// User is intentionally using Shift → allow uppercase
				return;
			}
			// Force lowercase (this defeats Caps Lock as well)
			e.preventDefault();
			const start = textarea.selectionStart ?? 0;
			const end = textarea.selectionEnd ?? 0;
			const char = e.key.toLowerCase();
			textarea.value = textarea.value.slice(0, start) + char + textarea.value.slice(end);
			const newPos = start + 1;
			textarea.selectionStart = textarea.selectionEnd = newPos;
		}
	});

	// Paste: for simplicity we also force lowercase
	textarea.addEventListener('paste', (e) => {
		e.preventDefault();
		const text = e.clipboardData?.getData('text') || '';
		const lower = text.toLowerCase();
		const start = textarea.selectionStart ?? 0;
		const end = textarea.selectionEnd ?? 0;
		textarea.value = textarea.value.slice(0, start) + lower + textarea.value.slice(end);
		const newPos = start + lower.length;
		textarea.selectionStart = textarea.selectionEnd = newPos;
	});
}

function initSkillsChips(host: HTMLElement) {
	const chips = host.querySelectorAll<HTMLButtonElement>('.prompt-tool-btn');

	chips.forEach((chip) => {
		chip.addEventListener('click', () => {
			// Toggle selection
			chip.classList.toggle('selected');

			// Optional: if you want only one skill active at a time, uncomment below
			// chips.forEach(c => c !== chip && c.classList.remove('selected'));
		});
	});
}

function initRunButton(host: HTMLElement, textarea: HTMLTextAreaElement) {
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	if (!runBtn) {
		return;
	}

	const updateState = () => {
		const hasText = textarea.value.trim().length > 0;
		runBtn.disabled = !hasText;
	};

	// Initial state
	updateState();

	// Update live as user types
	textarea.addEventListener('input', updateState);
}

function updateFooterModel(host: HTMLElement) {
	const labelEl = document.getElementById('cli-terminal-label');
	const label = labelEl?.textContent?.trim() || 'unknown';

	// Make it as simple as possible: "claude", "grok", "kiro", etc.
	const simpleName = label
		.toLowerCase()
		.replace(/\s*(cli|code)\s*$/i, '')   // remove trailing " CLI" or " Code"
		.replace(/\s+/g, '');                // remove any remaining spaces

	const footerInfo = host.querySelector<HTMLElement>('.prompt-footer-info');
	if (footerInfo) {
		footerInfo.innerHTML = `<i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;
	}
}
