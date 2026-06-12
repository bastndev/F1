import type { CreateSkillChatSubmitDetail, CreateSkillMode, CreateSkillTarget } from '../types';

interface CreateDockOptions {
	getMode(): CreateSkillMode;
	getTarget(): CreateSkillTarget | undefined;
	getCreatePlaceholder(target: CreateSkillTarget | undefined): string;
	isCreateNameConfirmed(): boolean;
	isCreateDescriptionStep(): boolean;
	isCreateCategoryStep(): boolean;
	onBack(): void;
	onBeforeSubmit(mode: CreateSkillMode): void;
	onCreateSubmit(query: string): boolean;
	onCreateChatOpen(target?: CreateSkillTarget, focusChat?: boolean): void;
	onSearchInput(): void;
	onToggleMode(): void;
}

type ModeConfig = {
	label: string;
	placeholder: string;
	icon: string;
};

const modeConfigs: Record<CreateSkillMode, ModeConfig> = {
	create: {
		label: 'Create',
		placeholder: 'Create a new skill...',
		icon: [
			'<svg viewBox="0 0 16 16" focusable="false">',
			'<path d="m4.25 10.75-.75 2.75 2.75-.75 6.25-6.25-2-2z"/>',
			'<path d="m9.5 5.5 2 2"/>',
			'</svg>',
		].join(''),
	},
	search: {
		label: 'Search',
		placeholder: 'Search the best skill for your project...',
		icon: [
			'<svg viewBox="0 0 16 16" focusable="false">',
			'<circle cx="7" cy="7" r="4.25"/>',
			'<path d="m10.25 10.25 3 3"/>',
			'</svg>',
		].join(''),
	},
	design: {
		label: 'Design',
		placeholder: 'Design visual rules...',
		icon: [
			'<svg viewBox="0 0 16 16" focusable="false">',
			'<path d="M3 12.5h10"/>',
			'<path d="M5 3.5h6v6H5z"/>',
			'<path d="M6.5 11.5 8 9.5l1.5 2"/>',
			'</svg>',
		].join(''),
	},
};

export interface CreateDockController {
	clearValue(mode: CreateSkillMode): void;
	focusInput(): void;
	hasSearchInputValue(): boolean;
	saveActiveValue(mode: CreateSkillMode): void;
	setInputDisabled(disabled: boolean): void;
	sync(mode: CreateSkillMode, target: CreateSkillTarget | undefined): void;
}

export function initCreateDock(options: CreateDockOptions): CreateDockController {
	const createSurface = document.querySelector('[data-create-skill-surface]') as HTMLElement | null;
	const createChat = document.querySelector('[data-create-chat]') as HTMLElement | null;
	const createChatInput = document.querySelector('[data-create-chat-input]') as HTMLTextAreaElement | null;
	const createChatSend = document.querySelector('[data-create-chat-send]') as HTMLButtonElement | null;
	const modeToggle = document.querySelector('[data-create-chat-mode-toggle]') as HTMLButtonElement | null;
	const modeLabel = document.querySelector('[data-create-chat-mode-label]') as HTMLElement | null;
	const modeIcon = document.querySelector('[data-create-chat-mode-icon]') as HTMLElement | null;
	const createTargetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-create-chat-target]'));
	const createChatBackButton = document.querySelector('[data-create-chat-back]') as HTMLButtonElement | null;
	const createChatCounter = document.querySelector('[data-create-chat-counter]') as HTMLElement | null;
	const createChatCounterWords = document.querySelector('[data-create-chat-counter-words]') as HTMLElement | null;
	const createChatCounterChars = document.querySelector('[data-create-chat-counter-chars]') as HTMLElement | null;

	const chatValues: Record<CreateSkillMode, string> = {
		create: '',
		search: '',
		design: '',
	};

	const DESCRIPTION_MAX_CHARS = 1536;
	const DESCRIPTION_MIN_CHARS = 60;
	const DESCRIPTION_MIN_WORDS = 10;

	let typingTimer: number | undefined;

	function updateCounter(mode: CreateSkillMode) {
		if (!createChatCounter || !createChatCounterWords || !createChatCounterChars || !createChatInput) {
			return;
		}

		if (mode !== 'create' || !options.isCreateNameConfirmed() || !options.isCreateDescriptionStep()) {
			createChatCounter.hidden = true;
			return;
		}

		const text = createChatInput.value;
		const length = text.length;
		const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
		const isValid = length >= DESCRIPTION_MIN_CHARS || wordCount >= DESCRIPTION_MIN_WORDS;

		createChatCounter.hidden = false;
		createChatCounterWords.textContent = `${wordCount}/${DESCRIPTION_MIN_WORDS}`;
		createChatCounterWords.hidden = isValid;
		createChatCounterChars.textContent = `${length}/${DESCRIPTION_MAX_CHARS}`;
	}

	function isDescriptionValid(): boolean {
		if (!createChatInput) {
			return false;
		}

		const text = createChatInput.value;
		const length = text.length;
		const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

		return length >= DESCRIPTION_MIN_CHARS || wordCount >= DESCRIPTION_MIN_WORDS;
	}

	function syncChatPlaceholder(mode: CreateSkillMode, target: CreateSkillTarget | undefined) {
		if (!createChatInput) {
			return;
		}

		createChatInput.placeholder = mode === 'create'
			? options.getCreatePlaceholder(target)
			: modeConfigs[mode].placeholder;
	}

	function resizeChatInput(mode: CreateSkillMode) {
		if (!createChatInput) {
			return;
		}

		if (mode !== 'search') {
			createChatInput.style.height = '';
			createChatInput.style.overflowY = '';
			return;
		}

		createChatInput.style.height = 'auto';
		createChatInput.style.height = `${createChatInput.scrollHeight}px`;
		createChatInput.style.overflowY = createChatInput.scrollHeight > createChatInput.clientHeight + 1 ? 'auto' : 'hidden';
	}

	function syncChatInputState(mode: CreateSkillMode) {
		if (!createChat || !createChatInput) {
			return;
		}

		const hasMessage = createChatInput.value.trim().length > 0;
		const isValid = mode === 'create' ? isDescriptionValid() : hasMessage;

		createChat.classList.toggle('has-message', isValid);
		resizeChatInput(mode);
		updateCounter(mode);

		if (createChatSend) {
			createChatSend.disabled = !isValid;
			createChatSend.setAttribute('aria-disabled', String(!isValid));
		}
	}

	function saveActiveValue(mode: CreateSkillMode) {
		if (createChatInput) {
			chatValues[mode] = createChatInput.value;
		}
	}

	function clearValue(mode: CreateSkillMode) {
		chatValues[mode] = '';
		if (createChatInput && options.getMode() === mode) {
			createChatInput.value = '';
			syncChatInputState(mode);
		}
	}

	function restoreActiveValue(mode: CreateSkillMode) {
		if (!createChatInput) {
			return;
		}

		createChatInput.value = chatValues[mode];
		syncChatInputState(mode);
	}

	function submitActiveChat() {
		const mode = options.getMode();
		if (!createChatInput || createChatSend?.disabled) {
			return;
		}

		const query = createChatInput.value.trim();
		if (!query) {
			return;
		}

		options.onBeforeSubmit(mode);

		if (mode === 'create' && options.onCreateSubmit(query)) {
			createChatInput.value = '';
			chatValues.create = '';
			syncChatInputState(mode);
			return;
		}

		window.dispatchEvent(new CustomEvent<CreateSkillChatSubmitDetail>('createSkill.chat.submit', {
			detail: {
				mode,
				query,
				target: options.getTarget(),
			},
		}));

		if (mode === 'search') {
			createChatInput.value = '';
			chatValues.search = '';
			syncChatInputState(mode);
		}
	}

	function sync(mode: CreateSkillMode, target: CreateSkillTarget | undefined) {
		const config = modeConfigs[mode];
		const hasVisibleTarget = mode === 'create' && target !== undefined;
		const isCategoryStep = mode === 'create' && options.isCreateNameConfirmed() && options.isCreateCategoryStep();

		createSurface?.classList.toggle('is-claude-target', hasVisibleTarget && target === 'claude');
		createChat?.classList.toggle('is-search-mode', mode === 'search');
		createChat?.classList.toggle('is-claude-target', hasVisibleTarget && target === 'claude');
		createChat?.classList.toggle('is-category-step', isCategoryStep);

		createTargetButtons.forEach(button => {
			const isActive = hasVisibleTarget && button.dataset.createChatTarget === target;
			button.classList.toggle('is-selected', isActive);
			button.setAttribute('aria-pressed', String(isActive));
		});

		syncChatPlaceholder(mode, target);
		restoreActiveValue(mode);
		updateCounter(mode);

		if (createChatInput) {
			createChatInput.disabled = isCategoryStep;
		}

		if (modeLabel) {
			modeLabel.textContent = config.label;
		}

		if (modeIcon) {
			modeIcon.innerHTML = config.icon;
		}
	}

	if (createChat && createChatInput) {
		createChatInput.addEventListener('input', () => {
			const mode = options.getMode();
			saveActiveValue(mode);
			syncChatInputState(mode);
			
			if (mode === 'search') {
				options.onSearchInput();
			}
			
			const query = createChatInput.value.trim();
			if (query) {
				window.clearTimeout(typingTimer);
				typingTimer = window.setTimeout(() => {
					if (mode === 'search') {
						window.dispatchEvent(new CustomEvent('createSkill.search.typing', { detail: { query } }));
					} else if (mode === 'create') {
						window.dispatchEvent(new CustomEvent('createSkill.chat.typing', { detail: { query } }));
					}
				}, mode === 'search' ? 400 : 300);
			}
		});
		createChatInput.addEventListener('keydown', event => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				submitActiveChat();
			}
		});
		createChatInput.addEventListener('focus', () => {
			if (options.getMode() === 'create') {
				options.onCreateChatOpen(undefined, false);
			}
		});
		createChat.addEventListener('pointerdown', event => {
			if (options.getMode() !== 'create') {
				return;
			}

			const actionButton = (event.target as HTMLElement | null)?.closest('[data-create-chat-mode-toggle], [data-create-chat-send]');
			if (actionButton) {
				return;
			}

			options.onCreateChatOpen(undefined, true);
		});
		syncChatInputState(options.getMode());
		resizeChatInput(options.getMode());
	}

	createChatSend?.addEventListener('click', submitActiveChat);
	createChatBackButton?.addEventListener('click', options.onBack);
	modeToggle?.addEventListener('click', options.onToggleMode);

	createTargetButtons.forEach(button => {
		button.addEventListener('click', () => {
			const target = button.dataset.createChatTarget;
			if (target !== 'agents' && target !== 'claude') {
				return;
			}

			options.onCreateChatOpen(target, true);
		});
	});

	window.addEventListener('createSkill.skillName.confirm', () => {
		if (createChatInput) {
			createChatInput.value = '';
			chatValues.create = '';
			syncChatInputState('create');
		}
	});

	return {
		clearValue,
		focusInput() {
			createChatInput?.focus();
		},
		hasSearchInputValue() {
			return options.getMode() === 'search' && (createChatInput?.value.trim().length ?? 0) > 0;
		},
		saveActiveValue,
		setInputDisabled(disabled: boolean) {
			if (createChatInput) {
				createChatInput.disabled = disabled;
			}
		},
		sync,
	};
}
