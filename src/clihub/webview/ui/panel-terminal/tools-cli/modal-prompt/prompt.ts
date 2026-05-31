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

type PromptContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	sendToActiveSession?: (text: string) => void;
};

export const mountPromptPanel = (host: HTMLElement, context: any = { close: () => {} }) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = promptHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	const hasActiveSession = !!context.getActiveSessionId?.();

	// === Session state handling (no session → disabled state) ===
	initSessionState(host, hasActiveSession);

	// === Tab switching logic + chat area reaction ===
	initPromptTabs(host, context, hasActiveSession);

	// Update footer with the correct model for the current active CLI
	updateFooterModel(host);
};

function initPromptTabs(host: HTMLElement, context: any, hasActiveSession: boolean) {
	const tabs = host.querySelectorAll<HTMLElement>('.prompt-tab');
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const textareaWrap = host.querySelector<HTMLElement>('.prompt-textarea-wrap');

	if (!tabs.length || !textarea) {
		return;
	}

	// When there is no active session we keep everything disabled
	if (!hasActiveSession) {
		textarea.disabled = true;
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
	requestAnimationFrame(() => {
		textarea.focus();
	});

	// === Skills chips (selectable buttons) ===
	if (hasActiveSession) {
		initSkillsChips(host);
	}

	// === Run button + send logic ===
	initRunButton(host, textarea, context);

	// === Ctrl+Enter / Cmd+Enter support ===
	initSendShortcut(textarea, context);

	// Initial char count (only when interactive)
	if (hasActiveSession) {
		updateCharCount(host, textarea);
	}
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

function initRunButton(host: HTMLElement, textarea: HTMLTextAreaElement, context: any) {
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	if (!runBtn) {
		return;
	}

	const updateState = () => {
		const hasText = textarea.value.trim().length > 0;
		const hasSession = !!context.getActiveSessionId?.();
		runBtn.disabled = !hasText || !hasSession;
	};

	// Initial state
	updateState();

	// Update live as user types
	textarea.addEventListener('input', () => {
		updateState();
		updateCharCount(host, textarea);
	});

	// Actual send action
	runBtn.addEventListener('click', () => {
		performSend(host, textarea, context);
	});
}

function initSendShortcut(textarea: HTMLTextAreaElement, context: any) {
	textarea.addEventListener('keydown', (e) => {
		const isSendShortcut =
			(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ||
			(e.key === 'Enter' && e.ctrlKey);

		if (!isSendShortcut) {
			return;
		}

		e.preventDefault();
		performSend(textarea.closest('.prompt-modal') as HTMLElement, textarea, context);
	});
}

function performSend(host: HTMLElement, textarea: HTMLTextAreaElement, context: any) {
	const text = textarea.value.trim();
	if (!text) {
		return;
	}

	const sessionId = context.getActiveSessionId?.();
	if (!sessionId || !context.sendToActiveSession) {
		// Should not happen because UI is disabled, but defensive
		showNoSessionMessage(host);
		return;
	}

	// Send exactly what the user wrote + carriage return (simulates pressing Enter)
	context.sendToActiveSession(text + '\r');

	// Close the modal after sending (clean UX)
	context.close();
}

function updateCharCount(host: HTMLElement, textarea: HTMLTextAreaElement) {
	const counter = host.querySelector<HTMLElement>('#charCount');
	if (!counter) {
		return;
	}

	const current = textarea.value.length;
	const max = 1000;
	counter.textContent = `${current}/${max}`;
}

function initSessionState(host: HTMLElement, hasActiveSession: boolean) {
	if (hasActiveSession) {
		return;
	}

	const body = host.querySelector<HTMLElement>('.prompt-body');
	if (!body) {
		return;
	}

	// Disable interactive elements
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	const chips = host.querySelectorAll<HTMLButtonElement>('.prompt-tool-btn');

	if (textarea) {
		textarea.disabled = true;
	}
	if (runBtn) {
		runBtn.disabled = true;
	}
	chips.forEach((chip) => (chip.disabled = true));

	// Inject a clear "no session" state
	const state = document.createElement('div');
	state.className = 'prompt-no-session';
	state.innerHTML = `
		<div class="prompt-no-session-icon">⌘</div>
		<div class="prompt-no-session-title">No hay sesión CLI activa</div>
		<div class="prompt-no-session-subtitle">
			Abre una sesión desde el panel izquierdo para usar Prompt
		</div>
	`;

	// Hide the normal interactive content but keep the structure
	const skills = host.querySelector<HTMLElement>('.prompt-skills');
	if (skills) {
		skills.style.display = 'none';
	}

	body.appendChild(state);
}

function showNoSessionMessage(host: HTMLElement) {
	const body = host.querySelector<HTMLElement>('.prompt-body');
	if (!body) {
		return;
	}

	let msg = body.querySelector<HTMLElement>('.prompt-no-session-temp');
	if (!msg) {
		msg = document.createElement('div');
		msg.className = 'prompt-no-session-temp';
		msg.textContent = 'Necesitas una sesión CLI activa para enviar prompts.';
		body.appendChild(msg);
		setTimeout(() => msg?.remove(), 2200);
	}
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
