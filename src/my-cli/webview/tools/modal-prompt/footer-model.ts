/**
 * Footer "model" area: shows the active CLI name plus the best-effort
 * detected model. Agents that declare a modelCommand get a shortcut button
 * that clears the terminal input line, closes the modal, and opens the
 * CLI's native model picker.
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

	footerInfo.innerHTML = `<span class="prompt-session-dot" id="sessionDot"></span><i class="ti ti-cpu" aria-hidden="true"></i> ${simpleName}`;

	const modelName = context.getActiveModelName?.();

	// Agents with a modelCommand get a shortcut to the native picker; the rest
	// keep the read-only detected-model chip.
	if (modelCommand && hasActiveSession && context.sendToActiveSession) {
		footerInfo.append(buildModelShortcut(context, modelCommand, modelName));
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

function buildModelShortcut(context: PromptContext, modelCommand: string, detectedModel?: string): HTMLElement {
	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.title = `Open model picker (${modelCommand})`;

	const label = document.createElement('span');
	label.textContent = detectedModel ?? 'model';

	button.append(label);

	button.addEventListener('click', () => {
		// Close the modal first so focus returns to the terminal before the
		// command is injected.
		context.close();
		// \x15 is Ctrl+U: wipe the current terminal input line so a partially
		// typed prompt like "asd" is not concatenated into "asd${modelCommand}".
		context.sendToActiveSession?.(`\x15${modelCommand}`, { submit: true });
	});

	return button;
}
