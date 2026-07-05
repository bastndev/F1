/**
 * PRO / PLAN mode tabs on the composer toolbar. PRO is the everyday mode
 * (auto-translate + spell-fix). PLAN keeps all of that and appends planning
 * text to each send (built by buildPlanText).
 *
 * Stateless on purpose: F1 cannot observe which mode a CLI is really in, so it
 * never injects /plan (or any mode command) into the terminal — an injection
 * toggle would desync the moment the user switches modes inside the CLI. The
 * instruction travels with each prompt instead, which works identically on
 * every CLI, native plan mode or not. PLAN stays independent of the "rules"
 * one-shot: neither knows the other, so pressing them in any order is safe.
 *
 * Token discipline: the full preamble rides only the FIRST plan send of a
 * session (caller tracks that, see prompt.ts). The model keeps it in context,
 * so later sends carry only PLAN_REMINDER — the safety guard re-anchored
 * cheaply, not the whole preamble re-spent each turn.
 *
 * The choice persists in localStorage 'f1-prompt-mode' ('pro' | 'plan';
 * missing = pro), sibling of 'f1-translate-auto' / 'f1-prompt-lang'.
 */
import { matchesShortcut } from '../../../../shared/keymaps/cli';

export type PromptMode = 'pro' | 'plan';

const STORAGE_KEY = 'f1-prompt-mode';

// Full planning preamble — FIRST plan send of a session only. Keeps the
// approval guard (the safety line) and asks for a compact plan. Compact-format
// spirit borrowed from the "rules" concise rule, minus its "done 🎉" sign-off
// (that signals finished work — opposite of planning).
const PLAN_PREAMBLE =
	'First give me a numbered step-by-step plan for this task, listing the files you would touch. '
	+ 'Keep it compact — a numbered list or a small table, minimal prose. '
	+ 'Do not write code or modify files yet — wait for my approval.';

// Cheap re-anchor for later plan sends: preamble is already in context, so only
// refresh the safety guard per turn.
const PLAN_REMINDER = '(Still planning — plan only, no code yet, wait for my approval.)';

// "Just pass a route": a plan message that is only an @mention (no prose) gets
// wrapped in this analyze framing so the user skips retyping the boilerplate.
// English + applied post-translation, like the preamble.
const ANALYZE_PREFIX = 'Analyze and thoroughly understand ';
const ANALYZE_SUFFIX =
	' — I want to add a feature to it, so first I need you to fully understand how it currently works.';

export type PlanTextOptions = {
	/** Typed text is only a route (@mention), no prose → wrap it. */
	routeOnly: boolean;
	/** First plan send this session → full preamble; else the short reminder. */
	firstInSession: boolean;
};

/** Build the PLAN text that rides along with a send. Pure — the caller owns the
 *  per-session "already sent the full preamble" state. */
export function buildPlanText(prompt: string, opts: PlanTextOptions): string {
	const core = opts.routeOnly
		? `${ANALYZE_PREFIX}${prompt.trim()}${ANALYZE_SUFFIX}`
		: prompt.trimEnd();
	const tail = opts.firstInSession ? PLAN_PREAMBLE : PLAN_REMINDER;
	return `${core}\n\n${tail}`;
}

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
