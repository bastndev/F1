/**
 * Footer "model" area: shows the active CLI name plus the best-effort
 * detected model. Claude gets a shortcut button that clears the terminal input
 * line, closes the modal, and opens the native "/model" picker so the user
 * always sees the real, up-to-date model list.
 */
import type { PromptContext } from './prompt-context';

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

	// Claude gets a shortcut to the native /model picker; every other CLI keeps
	// the read-only detected-model chip.
	if (simpleName === 'claude' && hasActiveSession && context.sendToActiveSession) {
		footerInfo.append(buildClaudeModelShortcut(context, modelName));
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

function buildClaudeModelShortcut(context: PromptContext, detectedModel?: string): HTMLElement {
	const button = document.createElement('button');
	button.className = 'prompt-footer-model prompt-footer-model-btn';
	button.title = 'Open Claude /model picker (clears the current terminal line)';

	const label = document.createElement('span');
	label.textContent = detectedModel ?? 'model';

	button.append(label);

	button.addEventListener('click', () => {
		// Close the modal first so focus returns to the terminal before the
		// command is injected.
		context.close();
		// \x15 is Ctrl+U: wipe the current terminal input line so a partially
		// typed prompt like "asd" is not concatenated into "asd/model".
		context.sendToActiveSession?.('\x15/model', { submit: true });
	});

	return button;
}
