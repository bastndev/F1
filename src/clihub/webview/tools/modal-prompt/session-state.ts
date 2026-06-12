/**
 * No-active-session UI: the offline dot, disabled controls and the inline
 * "open a session first" states shown when the prompt modal mounts without
 * a running CLI (or a send is attempted after the session died).
 */
import { uiStrings } from '../../../shared/ui-strings';

export function initSessionState(host: HTMLElement, hasActiveSession: boolean) {
	// Update session dot state
	const dot = host.querySelector<HTMLElement>('#sessionDot');
	if (dot && !hasActiveSession) {
		dot.classList.add('offline');
	}

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
		<div class="prompt-no-session-title">${uiStrings.promptNoSession.title}</div>
		<div class="prompt-no-session-subtitle">
			${uiStrings.promptNoSession.subtitle}
		</div>
	`;

	// Hide the normal interactive content but keep the structure
	const skills = host.querySelector<HTMLElement>('.prompt-skills');
	if (skills) {
		skills.style.display = 'none';
	}

	body.appendChild(state);
}

export function showNoSessionMessage(host: HTMLElement) {
	const body = host.querySelector<HTMLElement>('.prompt-body');
	if (!body) {
		return;
	}

	let msg = body.querySelector<HTMLElement>('.prompt-no-session-temp');
	if (!msg) {
		msg = document.createElement('div');
		msg.className = 'prompt-no-session-temp';
		msg.textContent = uiStrings.promptNoSession.sendBlocked;
		body.appendChild(msg);
		setTimeout(() => msg?.remove(), 2200);
	}
}
