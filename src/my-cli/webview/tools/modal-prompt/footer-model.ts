/**
 * Footer "model" area: shows the active CLI name plus a row of action chips.
 * Agents that declare modelCommand/resumeCommand get shortcut buttons that
 * clear the terminal input line, close the modal, and open the CLI's native
 * picker. The rest keep a read-only detected-model chip.
 */
import type { PromptContext } from './prompt-context';
import { getCliAgent } from '../../../shared/agents';

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

	footerInfo.innerHTML = `<span class="prompt-session-dot" id="sessionDot"></span><i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;

	const modelName = context.getActiveModelName?.();

	// Agents with shortcut commands get action chips; the rest keeps the
	// read-only detected-model chip.
	if (hasActiveSession && context.sendToActiveSession && (modelCommand || resumeCommand)) {
		const actions = document.createElement('span');
		actions.className = 'prompt-footer-actions';

		if (modelCommand) {
			actions.append(buildShortcutButton(context, modelCommand, modelName ?? modelCommand));
		}
		if (resumeCommand) {
			actions.append(buildShortcutButton(context, resumeCommand, resumeCommand));
		}

		footerInfo.append(actions);
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

function buildShortcutButton(context: PromptContext, command: string, labelText: string): HTMLElement {
	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.title = `Run ${command}`;

	const label = document.createElement('span');
	label.textContent = labelText.startsWith('/') ? labelText.slice(1) : labelText;

	button.append(label);

	button.addEventListener('click', () => {
		// Close the modal first so focus returns to the terminal before the
		// command is injected.
		context.close();
		// \x15 is Ctrl+U: wipe the current terminal input line so a partially
		// typed prompt is not concatenated with the command.
		context.sendToActiveSession?.(`\x15${command}`, { submit: true });
	});

	return button;
}
