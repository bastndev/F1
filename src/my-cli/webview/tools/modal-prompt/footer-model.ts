/**
 * Footer "model" area: shows the active CLI name plus a row of action chips.
 * Agents that declare modelCommand/resumeCommand get shortcut buttons that
 * clear the terminal input line, close the modal, and open the CLI's native
 * picker. The rest keep a read-only detected-model chip.
 */
import type { PromptContext } from './prompt-context';
import { getCliAgent } from '../../../shared/agents';
import { getUsageCommandLabel } from '../modal-use/agents';
import { iconEl, type PromptIcon } from './components/icons';

export function updateFooterModel(host: HTMLElement, context: PromptContext, hasActiveSession: boolean) {
	const labelEl = document.getElementById('cli-terminal-label');
	const label = labelEl?.textContent?.trim() || 'unknown';

	const footerInfo = host.querySelector<HTMLElement>('.prompt-footer-info');
	if (!footerInfo) {
		return;
	}

	// Make it as simple as possible: "claude", "grok", "kiro", etc.
	const simpleName = label
		.toLowerCase()
		.replace(/\s+(cli|code)\s*$/i, '')   // remove trailing " CLI" or " Code" (standalone only)
		.replace(/\s+/g, '');                // remove any remaining spaces

	const agent = getCliAgent(label);
	const modelCommand = agent?.modelCommand;
	const resumeCommand = agent?.resumeCommand;
	// Cursor's TUI drops raw chunked input, so it needs bracketed-paste mode
	// and no leading Ctrl+U for these shortcuts to register.
	const usePasteMode = agent?.slug === 'cursor';

	footerInfo.innerHTML = `<span class="prompt-session-dot" id="sessionDot"></span><span class="prompt-cli-name">${simpleName}</span>`;

	const modelName = context.getActiveModelName?.();
	const usageCommand = hasActiveSession ? getUsageCommandLabel(label) : 'not configured';
	const hasUsage = usageCommand !== 'not configured';

	// Agents with shortcut commands get action chips; the rest keeps the
	// read-only detected-model chip.
	if (hasActiveSession && context.sendToActiveSession && (modelCommand || resumeCommand || hasUsage)) {
		const actions = document.createElement('span');
		actions.className = 'prompt-footer-actions';

		if (modelCommand) {
			actions.append(buildShortcutButton(context, modelCommand, modelName ?? modelCommand, usePasteMode));
		}
		if (resumeCommand) {
			actions.append(buildShortcutButton(context, resumeCommand, resumeCommand, usePasteMode, { action: 'shortcut', icon: 'refresh' }));
		}
		if (hasUsage) {
			actions.append(buildUsageButton(context, usageCommand, usePasteMode));
		}

		for (const btn of Array.from(actions.querySelectorAll<HTMLElement>('.prompt-footer-model-btn[data-action="shortcut"]'))) {
			bindShortcutTruncation(btn);
		}

		footerInfo.append(actions);
		bindFooterOverflow(host);
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

function buildShortcutButton(context: PromptContext, command: string, labelText: string, usePasteMode: boolean, opts?: { action?: string; icon?: PromptIcon }): HTMLElement {
	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.title = `Run ${command}`;
	if (opts?.action) {
		button.dataset.action = opts.action;
	}

	if (opts?.icon) {
		button.append(iconEl(opts.icon, 12));
	}

	const label = document.createElement('span');
	label.className = 'prompt-footer-btn-label';
	label.textContent = labelText.startsWith('/') ? labelText.slice(1) : labelText;

	button.append(label);

	button.addEventListener('click', () => {
		// Close the modal first so focus returns to the terminal before the
		// command is injected.
		context.close();
		if (usePasteMode) {
			// Cursor's TUI drops raw input unless it arrives as a bracketed paste,
			// and it does not need a Ctrl+U prefix to replace the current line.
			context.sendToActiveSession?.(command, { paste: true, submit: true });
		} else {
			// \x15 is Ctrl+U: wipe the current terminal input line so a partially
			// typed prompt is not concatenated with the command.
			context.sendToActiveSession?.(`\x15${command}`, { submit: true });
		}
	});

	return button;
}

function buildUsageButton(context: PromptContext, command: string, usePasteMode: boolean): HTMLElement {
	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn prompt-footer-usage-btn';
	button.title = `Run ${command}`;
	button.dataset.action = 'shortcut';

	const label = document.createElement('span');
	label.className = 'prompt-footer-btn-label';
	label.textContent = command.startsWith('/') ? command.slice(1) : command;

	button.append(iconEl('chartBar', 11), label);

	button.addEventListener('click', () => {
		context.close();
		if (usePasteMode) {
			context.sendToActiveSession?.(command, { paste: true, submit: true });
		} else {
			context.sendToActiveSession?.(`\x15${command}`, { submit: true });
		}
	});

	return button;
}

/** Watch a single shortcut chip. If its label would show an ellipsis
 *  (scrollWidth > clientWidth), swap to icon-only; swap back to text-only
 *  when the label would fit again. */
function bindShortcutTruncation(button: HTMLElement) {
	const label = button.querySelector<HTMLElement>('.prompt-footer-btn-label');
	if (!label) {
		return;
	}

	const wouldLabelFit = (): boolean => {
		const wasTruncated = button.classList.contains('is-truncated');
		button.classList.remove('is-truncated');
		const fits = label.scrollWidth <= label.clientWidth + 1;
		if (wasTruncated) {
			button.classList.add('is-truncated');
		}
		return fits;
	};

	const check = () => {
		const isTruncated = button.classList.contains('is-truncated');
		if (isTruncated) {
			if (wouldLabelFit()) {
				button.classList.remove('is-truncated');
			}
		} else if (label.scrollWidth > label.clientWidth + 1) {
			button.classList.add('is-truncated');
		}
	};

	const ro = new ResizeObserver(check);
	ro.observe(button);
	requestAnimationFrame(check);
}

/** Watch the footer for overflow; collapse shortcut chips to icon-only
 *  when the Execute button gets squeezed. Expands back when space allows. */
function bindFooterOverflow(host: HTMLElement) {
	const footer = host.querySelector<HTMLElement>('.prompt-footer');
	if (!footer) {
		return;
	}

	const check = () => {
		footer.classList.toggle('is-compact', footer.scrollWidth > footer.clientWidth + 1);
	};

	const ro = new ResizeObserver(check);
	ro.observe(footer);
	ro.observe(host);
	requestAnimationFrame(check);
}
