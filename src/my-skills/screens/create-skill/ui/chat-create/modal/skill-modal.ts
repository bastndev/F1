
type SkillTemplate = 'base' | 'fast';

interface SkillNameConfirmDetail {
	name: string;
	query: string;
	target?: string;
	template: SkillTemplate;
}

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxNameLength = 30;
const allowedChars = /[^a-z0-9-]/g;
const consecutiveHyphens = /-{2,}/g;
const leadingHyphens = /^-+/;
const trailingHyphens = /-+$/;


export function initNamePrompt() {
	const overlay = document.querySelector<HTMLElement>('[data-name-prompt-overlay]');
	const panel = document.querySelector<HTMLElement>('[data-name-prompt-panel]');
	const input = document.querySelector<HTMLInputElement>('[data-name-prompt-input]');
	const hint = document.querySelector<HTMLElement>('[data-name-prompt-hint]');
	const hintText = document.querySelector<HTMLElement>('[data-name-prompt-hint-text]');
	const hintCounter = document.querySelector<HTMLElement>('[data-name-prompt-hint-counter]');
	const hintIcon = document.querySelector<HTMLElement>('[data-name-prompt-hint-icon]');
	const cancelButton = document.querySelector<HTMLButtonElement>('[data-name-prompt-cancel]');
	const confirmButton = document.querySelector<HTMLButtonElement>('[data-name-prompt-confirm]');
	const pathPreview = document.querySelector<HTMLElement>('[data-name-prompt-path-preview]');
	const pathName = document.querySelector<HTMLElement>('[data-name-prompt-path-name]');
	const pathTarget = document.querySelector<HTMLElement>('[data-name-prompt-path-target]');

	if (!overlay || !panel || !input || !hint || !hintText || !hintCounter || !cancelButton || !confirmButton) {
		return;
	}

	const els = { overlay, panel, input, hint, hintText, hintCounter, hintIcon, cancelButton, confirmButton, pathPreview, pathName, pathTarget };

	const templateToggle = panel.querySelector<HTMLElement>('[data-name-prompt-template]');
	const templateButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-name-prompt-template] [data-template]'));

	let pendingTarget: string | undefined;
	let selectedTemplate: SkillTemplate = 'fast';
	let shakeTimer: number | undefined;
	let isOpen = false;
	const existingFolders: { agents: Set<string>; claude: Set<string> } = {
		agents: new Set(),
		claude: new Set(),
	};

	function resetInput() {
		els.input.value = '';
		els.confirmButton.disabled = true;
		els.confirmButton.setAttribute('aria-disabled', 'true');
		els.hintText.textContent = 'lowercase, numbers, hyphens';
		els.hintCounter.textContent = '';
		els.hint.classList.remove('is-error');
		els.hint.classList.remove('is-valid');
		els.panel.classList.remove('is-shaking');
		if (els.hintIcon) {
			els.hintIcon.innerHTML = '';
		}
		if (els.pathName) {
			els.pathName.textContent = 'skill-name';
		}
	}

	function setTemplate(template: SkillTemplate) {
		selectedTemplate = template;
		templateToggle?.classList.toggle('is-fast-active', template === 'fast');
		templateButtons.forEach(button => {
			const isActive = button.dataset.template === template;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-pressed', String(isActive));
		});
	}

	function setTarget(target?: string) {
		const targetKey = target === 'claude' ? 'claude' : 'agents';
		pendingTarget = targetKey;
		if (els.pathTarget) {
			els.pathTarget.textContent = targetKey === 'claude' ? '.claude' : '.agents';
		}
	}

	function open(target?: string, initialValue?: string, initialTemplate?: string) {
		if (isOpen) {
			return;
		}

		isOpen = true;
		resetInput();
		setTarget(target);
		setTemplate(initialTemplate === 'base' ? 'base' : 'fast');

		if (initialValue) {
			els.input.value = initialValue;
			syncInputState();
		}

		els.overlay.classList.add('is-open');

		requestAnimationFrame(() => {
			els.input.focus();
		});
	}

	function close(cancelled = false) {
		if (!isOpen) {
			return;
		}

		isOpen = false;
		els.overlay.classList.remove('is-open');
		pendingTarget = undefined;

		if (shakeTimer !== undefined) {
			window.clearTimeout(shakeTimer);
			shakeTimer = undefined;
		}

		// If the user cancelled, notify shell to restore the cards view
		if (cancelled) {
			window.dispatchEvent(new CustomEvent('createSkill.namePrompt.cancel'));
		}

		const onEnd = () => {
			els.overlay.removeEventListener('transitionend', onEnd);
			resetInput();
		};
		els.overlay.addEventListener('transitionend', onEnd, { once: true });
	}

	function shake() {
		els.panel.classList.remove('is-shaking');
		void els.panel.offsetWidth;
		els.panel.classList.add('is-shaking');
		if (shakeTimer !== undefined) {
			window.clearTimeout(shakeTimer);
		}
		shakeTimer = window.setTimeout(() => {
			els.panel.classList.remove('is-shaking');
			shakeTimer = undefined;
		}, 400);
	}

	function validateName(value: string): boolean {
		return value.length <= maxNameLength && skillNamePattern.test(value);
	}

	function sanitizeInput(raw: string): string {
		let sanitized = raw.toLowerCase();
		sanitized = sanitized.replace(/\s+/g, '-');
		sanitized = sanitized.replace(allowedChars, '');
		sanitized = sanitized.replace(consecutiveHyphens, '-');
		sanitized = sanitized.replace(leadingHyphens, '');
		sanitized = sanitized.slice(0, maxNameLength);
		return sanitized;
	}

	const checkIcon = '<svg viewBox="0 0 16 16" focusable="false"><path d="M3.5 8.25 6.4 11 12.5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
	const errorIcon = '<svg viewBox="0 0 16 16" focusable="false"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5.5v3M8 10.5v.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

	function syncInputState() {
		const raw = els.input.value;
		const sanitized = sanitizeInput(raw);

		if (raw !== sanitized) {
			const cursorPos = els.input.selectionStart ?? sanitized.length;
			els.input.value = sanitized;
			const newPos = Math.min(cursorPos, sanitized.length);
			els.input.setSelectionRange(newPos, newPos);
		}

		// Update path preview name
		if (els.pathName) {
			els.pathName.textContent = sanitized.length > 0 ? sanitized : 'skill-name';
		}

		const isValid = sanitized.length > 0 && validateName(sanitized);

		if (sanitized.length === 0) {
			els.hintText.textContent = 'lowercase, numbers, hyphens';
			els.hintCounter.textContent = '';
			els.hint.classList.remove('is-error');
			els.hint.classList.remove('is-valid');
			if (els.hintIcon) {
				els.hintIcon.innerHTML = '';
			}
			els.confirmButton.disabled = true;
			els.confirmButton.setAttribute('aria-disabled', 'true');
			return;
		}

		if (!isValid) {
			els.hintText.textContent = sanitized.length > maxNameLength
				? `Max ${maxNameLength} characters`
				: 'Cannot start or end with hyphen';
			els.hintCounter.textContent = '';
			els.hint.classList.add('is-error');
			els.hint.classList.remove('is-valid');
			if (els.hintIcon) {
				els.hintIcon.innerHTML = errorIcon;
			}
			els.confirmButton.disabled = true;
			els.confirmButton.setAttribute('aria-disabled', 'true');
			return;
		}

		// Check for duplicate folder name in the selected target
		const targetKey = pendingTarget === 'claude' ? 'claude' : 'agents';
		const targetPath = targetKey === 'claude' ? '.claude/skills/' : '.agents/skills/';
		if (existingFolders[targetKey].has(sanitized)) {
			els.hintText.textContent = `Already exists in ${targetPath}`;
			els.hintCounter.textContent = '';
			els.hint.classList.add('is-error');
			els.hint.classList.remove('is-valid');
			if (els.hintIcon) {
				els.hintIcon.innerHTML = errorIcon;
			}
			els.confirmButton.disabled = true;
			els.confirmButton.setAttribute('aria-disabled', 'true');
			return;
		}

		els.hintText.textContent = 'Looks good';
		els.hintCounter.textContent = `${sanitized.length}/${maxNameLength}`;
		els.hint.classList.remove('is-error');
		els.hint.classList.add('is-valid');
		if (els.hintIcon) {
			els.hintIcon.innerHTML = checkIcon;
		}
		els.confirmButton.disabled = false;
		els.confirmButton.setAttribute('aria-disabled', 'false');
	}

	function confirm() {
		const name = sanitizeInput(els.input.value);
		const targetKey = pendingTarget === 'claude' ? 'claude' : 'agents';
		
		if (!name || !validateName(name) || existingFolders[targetKey].has(name)) {
			shake();
			return;
		}

		window.dispatchEvent(new CustomEvent<SkillNameConfirmDetail>('createSkill.skillName.confirm', {
			detail: {
				name,
				query: '',
				target: pendingTarget,
				template: selectedTemplate,
			},
		}));
		close();
	}

	els.input.addEventListener('input', syncInputState);
	els.input.addEventListener('keydown', event => {
		if (event.key === 'Enter') {
			event.preventDefault();
			confirm();
		}
	});
	els.cancelButton.addEventListener('click', () => close(true));
	els.confirmButton.addEventListener('click', confirm);

	templateButtons.forEach(button => {
		button.addEventListener('click', () => {
			const template = button.dataset.template;
			if (template === 'base' || template === 'fast') {
				setTemplate(template);
			}
		});
	});
	els.overlay.addEventListener('pointerdown', event => {
		if (event.target === els.overlay) {
			close(true);
		}
	});

	window.addEventListener('keydown', event => {
		if (event.key === 'Escape' && isOpen) {
			event.preventDefault();
			close(true);
		}
	});

	// Open the name modal when cards have finished animating out
	window.addEventListener('createSkill.namePrompt.open', event => {
		if (!(event instanceof CustomEvent)) {
			return;
		}
		const detail = event.detail as { target?: unknown; initialValue?: unknown; template?: unknown } | null;
		const target = typeof detail?.target === 'string' ? detail.target : undefined;
		const initialValue = typeof detail?.initialValue === 'string' ? detail.initialValue : undefined;
		const initialTemplate = typeof detail?.template === 'string' ? detail.template : undefined;
		open(target, initialValue, initialTemplate);
	});

	window.addEventListener('createSkill.folders.sync', event => {
		if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
			return;
		}
		const detail = event.detail as { agents?: unknown; claude?: unknown };
		if (Array.isArray(detail.agents)) {
			existingFolders.agents = new Set(detail.agents.filter((v): v is string => typeof v === 'string'));
		}
		if (Array.isArray(detail.claude)) {
			existingFolders.claude = new Set(detail.claude.filter((v): v is string => typeof v === 'string'));
		}
		// Re-validate live if modal is open
		if (isOpen) {
			syncInputState();
		}
	});
}
