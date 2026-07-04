/**
 * "rules" toggle on the composer toolbar. Unlike the translate toggle, it is
 * language- AND CLI-agnostic: always shown, for every local CLI and every source
 * language (no language gate, initialized even without an active session).
 *
 * Visual contract: ON by default → turquoise; toggling OFF turns it gray. The
 * choice persists in localStorage 'f1-prompt-rules' ('1' on (default) | '0' off),
 * sibling of 'f1-translate-auto' / 'f1-prompt-mode'.
 *
 * The send-time behaviour is not wired yet — the onChange callback fires with the
 * new state on every toggle (and once on mount, reflecting the persisted value)
 * so the logic can hook in later without touching the UI.
 */
const STORAGE_KEY = 'f1-prompt-rules';

/** The persisted rules state — ON unless explicitly turned off. */
export const getRulesEnabled = (): boolean => {
	try {
		return localStorage.getItem(STORAGE_KEY) !== '0';
	} catch {
		return true;
	}
};

export function initRulesToggle(host: HTMLElement, onChange?: (enabled: boolean) => void) {
	const toggleBtn = host.querySelector<HTMLButtonElement>('#rulesToggle');
	if (!toggleBtn) {
		return;
	}

	let enabled = getRulesEnabled();

	const apply = (persist: boolean) => {
		toggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
		if (persist) {
			try {
				localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
			} catch {
				/* storage unavailable */
			}
		}
		onChange?.(enabled);
	};

	toggleBtn.addEventListener('click', () => {
		enabled = !enabled;
		apply(true);
	});

	// Reflect the persisted state on every mount.
	apply(false);
}
