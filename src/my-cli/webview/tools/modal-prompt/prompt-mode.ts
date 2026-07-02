/**
 * PRO / PLAN mode tabs on the composer toolbar. PRO is the everyday mode
 * (auto-translate + spell-fix). PLAN keeps all of that and appends a planning
 * instruction to every send.
 *
 * Stateless on purpose: F1 cannot observe which mode a CLI is really in, so it
 * never injects /plan (or any mode command) into the terminal — an injection
 * toggle would desync the moment the user switches modes inside the CLI. The
 * instruction travels with each prompt instead, which works identically on
 * every CLI, native plan mode or not.
 *
 * The choice persists in localStorage 'f1-prompt-mode' ('pro' | 'plan';
 * missing = pro), sibling of 'f1-translate-auto' / 'f1-prompt-lang'.
 */
import { matchesShortcut } from '../../../../shared/keymaps/cli';

export type PromptMode = 'pro' | 'plan';

const STORAGE_KEY = 'f1-prompt-mode';

/** Appended post-translation (already English) to every send while PLAN is active. */
export const PLAN_INSTRUCTION =
	'First give me a numbered step-by-step plan for this task, listing the files you would touch. '
	+ 'Do not write code or modify files yet — wait for my approval.';

export const getPromptMode = (): PromptMode => {
	try {
		return localStorage.getItem(STORAGE_KEY) === 'plan' ? 'plan' : 'pro';
	} catch {
		return 'pro';
	}
};

export function initPromptMode(host: HTMLElement, onChange: (mode: PromptMode) => void) {
	const proBtn = host.querySelector<HTMLButtonElement>('#proBtn');
	const planBtn = host.querySelector<HTMLButtonElement>('#planBtn');
	if (!proBtn || !planBtn) {
		return;
	}

	const apply = (mode: PromptMode, persist: boolean) => {
		proBtn.classList.toggle('is-active', mode === 'pro');
		planBtn.classList.toggle('is-active', mode === 'plan');
		proBtn.setAttribute('aria-pressed', mode === 'pro' ? 'true' : 'false');
		planBtn.setAttribute('aria-pressed', mode === 'plan' ? 'true' : 'false');
		if (persist) {
			try {
				localStorage.setItem(STORAGE_KEY, mode);
			} catch {
				/* storage unavailable */
			}
		}
		onChange(mode);
	};

	proBtn.addEventListener('click', () => apply('pro', true));
	planBtn.addEventListener('click', () => apply('plan', true));

	// Alt+1 / Alt+2 switch modes; listening on the host (not the textarea)
	// keeps the chord working wherever focus sits inside the modal.
	host.addEventListener('keydown', (e) => {
		if (matchesShortcut(e, 'promptModePro')) {
			e.preventDefault();
			apply('pro', true);
		} else if (matchesShortcut(e, 'promptModePlan')) {
			e.preventDefault();
			apply('plan', true);
		}
	});

	// Reflect the persisted mode on every mount.
	apply(getPromptMode(), false);
}
