/**
 * "rules" button on the composer toolbar — a ONE-SHOT action, not a preference
 * toggle. Language- and CLI-agnostic (always shown, wired even without a session).
 *
 * Lifecycle per CLI session:
 *   • available  → turquoise, clickable ("load the rules into this session")
 *   • injecting  → disabled, working look, while the host types the rules prompt
 *                  and waits for the agent to read it
 *   • done       → gray + permanently disabled for that session (rules loaded)
 * A refused click (CLI busy / no session) shakes the button but leaves it
 * available. The "already loaded" state is tracked per session by the composer
 * (see prompt.ts), so it survives modal close/reopen and resets for a new CLI.
 *
 * This module owns only the button's visual state; prompt.ts decides what a
 * click does (deny vs inject) since that needs the session/busy context.
 */
export type RulesToggleController = {
	/** Turquoise + clickable — rules not yet loaded this session. */
	setAvailable: () => void;
	/** Disabled + working look — injection in flight. */
	setInjecting: () => void;
	/** Gray + permanently disabled — rules already loaded this session. */
	setDone: () => void;
	/** Transient shake — the click was refused (busy / no session). */
	flashDenied: () => void;
};

export function initRulesToggle(host: HTMLElement, onActivate: () => void): RulesToggleController | undefined {
	const btn = host.querySelector<HTMLButtonElement>('#rulesToggle');
	if (!btn) {
		return undefined;
	}

	const setAvailable = () => {
		btn.disabled = false;
		btn.classList.remove('is-injecting');
		btn.setAttribute('aria-pressed', 'true');
		btn.title = 'Load working rules into this session (click)';
		btn.innerHTML = '<span class="prompt-rules-label">rules</span>';
	};

	const setInjecting = () => {
		btn.disabled = true;
		btn.classList.add('is-injecting');
		btn.setAttribute('aria-pressed', 'true');
		btn.title = 'loading rules';
		btn.innerHTML = '<span class="prompt-rules-label">rules</span>';
	};

	const setDone = () => {
		btn.disabled = true;
		btn.classList.remove('is-injecting');
		btn.setAttribute('aria-pressed', 'false');
		btn.title = 'rules loaded for this session';
		btn.innerHTML = '<span class="prompt-rules-label">rules</span>';
	};

	const flashDenied = () => {
		btn.classList.remove('is-denied');
		// Force a reflow so a rapid second click restarts the shake.
		void btn.offsetWidth;
		btn.classList.add('is-denied');
		btn.addEventListener('animationend', () => btn.classList.remove('is-denied'), { once: true });
	};

	// A disabled button never fires click, so this only runs while available.
	btn.addEventListener('click', () => onActivate());

	return { setAvailable, setInjecting, setDone, flashDenied };
}
