/**
 * Footer "model" area: shows the active CLI name plus the best-effort
 * detected model. Claude additionally gets a model switcher exposing the
 * full version list the in-CLI "/model" menu hides.
 */
import type { PromptContext } from './prompt-context';

// Exact public model strings for Claude Code. The in-CLI "/model" menu only
// exposes aliases (default/fable/opus/haiku) — passing the full string via
// "/model <id>" unlocks specific versions the menu hides.
const claudeModels: Array<{ id: string; label: string }> = [
	{ id: 'claude-fable-5', label: 'fable 5' },
	{ id: 'claude-opus-4-8', label: 'opus 4.8' },
	{ id: 'claude-opus-4-7', label: 'opus 4.7' },
	{ id: 'claude-opus-4-6', label: 'opus 4.6' },
	{ id: 'claude-sonnet-4-6', label: 'sonnet 4.6' },
	{ id: 'claude-haiku-4-5', label: 'haiku 4.5' },
];

export function updateFooterModel(host: HTMLElement, context: PromptContext, hasActiveSession: boolean) {
	const labelEl = document.getElementById('cli-terminal-label');
	const label = labelEl?.textContent?.trim() || 'unknown';

	// Make it as simple as possible: "claude", "grok", "kiro", etc.
	const simpleName = label
		.toLowerCase()
		.replace(/\s+(cli|code)\s*$/i, '')   // remove trailing " CLI" or " Code" (standalone only)
		.replace(/\s+/g, '');                // remove any remaining spaces

	const footerInfo = host.querySelector<HTMLElement>('.prompt-footer-info');
	if (!footerInfo) {
		return;
	}

	footerInfo.innerHTML = `<span class="prompt-session-dot" id="sessionDot"></span><i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;

	const modelName = context.getActiveModelName?.();

	// Claude gets a model switcher (the full version list the /model menu
	// hides); every other CLI keeps the read-only detected-model chip.
	if (simpleName === 'claude' && hasActiveSession && context.sendToActiveSession) {
		footerInfo.append(buildClaudeModelSwitcher(context, modelName));
		return;
	}

	// Detected model (best-effort, only when confidently scraped from the
	// session output). textContent — the value originates in terminal output.
	if (modelName) {
		const modelEl = document.createElement('span');
		modelEl.className = 'prompt-footer-model';
		modelEl.textContent = modelName;
		footerInfo.append(modelEl);
	}
}

function buildClaudeModelSwitcher(context: PromptContext, detectedModel?: string): HTMLElement {
	const wrap = document.createElement('span');
	wrap.className = 'prompt-model-switch';

	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.setAttribute('aria-haspopup', 'listbox');
	button.setAttribute('aria-expanded', 'false');
	button.title = 'Switch model (sends /model with the exact model string)';

	const buttonLabel = document.createElement('span');
	buttonLabel.textContent = detectedModel ?? 'model';
	const caret = document.createElement('span');
	caret.className = 'prompt-model-caret';
	caret.textContent = '▼';
	caret.setAttribute('aria-hidden', 'true');
	button.append(buttonLabel, caret);

	const menu = document.createElement('div');
	menu.className = 'prompt-model-menu';
	menu.setAttribute('role', 'listbox');

	const closeMenu = () => {
		menu.classList.remove('open');
		button.setAttribute('aria-expanded', 'false');
		document.removeEventListener('click', onOutsideClick, true);
	};

	const onOutsideClick = (event: MouseEvent) => {
		if (!wrap.contains(event.target as Node)) {
			closeMenu();
		}
	};

	for (const model of claudeModels) {
		const item = document.createElement('button');
		item.className = 'prompt-model-item';
		item.setAttribute('role', 'option');
		if (detectedModel && model.label === detectedModel) {
			item.classList.add('active');
		}

		const name = document.createElement('span');
		name.className = 'prompt-model-item-name';
		name.textContent = model.label;
		const id = document.createElement('code');
		id.className = 'prompt-model-item-id';
		id.textContent = model.id;
		item.append(name, id);

		item.addEventListener('click', () => {
			// Switch silently: the user never types it; Claude just confirms in
			// the terminal. Keep the modal open so they can continue prompting.
			context.sendToActiveSession?.(`/model ${model.id}`, { paste: true, submit: true });
			buttonLabel.textContent = model.label;
			menu.querySelectorAll('.prompt-model-item.active').forEach((el) => el.classList.remove('active'));
			item.classList.add('active');
			closeMenu();
		});

		menu.append(item);
	}

	button.addEventListener('click', () => {
		const isOpen = menu.classList.toggle('open');
		button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		if (isOpen) {
			document.addEventListener('click', onOutsideClick, true);
		} else {
			document.removeEventListener('click', onOutsideClick, true);
		}
	});

	wrap.append(button, menu);
	return wrap;
}
