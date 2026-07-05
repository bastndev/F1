/**
 * "rules" button on the composer toolbar — a ONE-SHOT action, not a preference
 * toggle. Language- and CLI-agnostic (always shown, wired even without a session).
 *
 * Lifecycle per CLI session:
 *   • available  → turquoise, clickable ("load the rules into this session")
 *   • injecting  → disabled, working look, while the host types the rules prompt
 *                  and waits for the agent to read it
 *   • done       → brief green text flash (label stays "rules", no width
 *                  change), then gray + permanently disabled for that session
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

export function initRulesToggle(host: HTMLElement, onActivate: () => void, refocusComposer?: () => void): RulesToggleController | undefined {
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

		// Transient green success flash so the click reads as "it worked",
		// then settle into the permanent muted-gray done look.
		btn.classList.add('is-just-done');
		setTimeout(() => btn.classList.remove('is-just-done'), 2400);
	};

	const flashDenied = () => {
		btn.classList.remove('is-denied');
		// Force a reflow so a rapid second click restarts the shake.
		void btn.offsetWidth;
		btn.classList.add('is-denied');
		btn.addEventListener('animationend', () => btn.classList.remove('is-denied'), { once: true });
		// The click handler disabled the button to prevent double-press; re-enable
		// it so a denied click (busy / no session) can be retried.
		btn.disabled = false;
	};

	// A disabled button never fires click, so this only runs while available.
	// Disable immediately to prevent rapid double-clicks from queuing multiple
	// rule injections; prompt.ts will re-enable via setAvailable if the click
	// is denied (busy / no session).
	btn.addEventListener('click', () => {
		if (btn.disabled) {
			return;
		}
		btn.disabled = true;
		onActivate();
		// The button stole focus from the textarea; return it so the user can
		// keep typing while the rules are injected in the background.
		refocusComposer?.();
	});

	return { setAvailable, setInjecting, setDone, flashDenied };
}
