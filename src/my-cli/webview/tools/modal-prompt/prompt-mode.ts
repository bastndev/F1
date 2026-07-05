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
 * The mode is intentionally NOT persisted: every mount opens in PRO and PLAN is
 * a transient, per-open choice (sending closes the modal, so the next open is
 * PRO again). A stale saved PLAN was a footgun — the modal could silently reopen
 * in PLAN and turn "create X" into a plan-only reply.
 */
import { matchesShortcut } from '../../../../shared/keymaps/cli';

export type PromptMode = 'pro' | 'plan';

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

// "Just pass a route" (route-only) → a cheap PRIME step: the user loads code
// into the model's context first (read & understand, NO plan, tiny ack), then
// sends the real task to get the plan. Saves time and tokens. The ack is turn-
// scoped ("this message only… never repeat"): without that, weak models re-emit
// the fixed line on the NEXT message instead of engaging (the bare "reply with
// only X" reads as a standing rule). English + post-translation, like the preamble.
const PRIME_PREFIX = 'Read and fully understand ';
const PRIME_SUFFIX =
	' — open whatever files you need. Do not plan or write code yet; once you truly understand it, reply with only this line: 💡 now I get your project! — this reply is for THIS message only; respond normally to whatever I send next, and never repeat this line.';

export type PlanTextOptions = {
	/** Typed text is only a route (@mention), no prose → cheap prime + ack. */
	routeOnly: boolean;
	/** First prose plan send this session → full preamble; else short reminder. */
	firstInSession: boolean;
};

/** Build the PLAN text that rides along with a send. Pure — the caller owns the
 *  per-session preamble one-shot (and skips marking it for route-only primes,
 *  which carry no preamble). */
export function buildPlanText(prompt: string, opts: PlanTextOptions): string {
	// Route-only → prime the context and ask for the 💡 ack, nothing more.
	if (opts.routeOnly) {
		return `${PRIME_PREFIX}${prompt.trim()}${PRIME_SUFFIX}`;
	}
	// Prose → the real plan request: full preamble first, cheap reminder after.
	const tail = opts.firstInSession ? PLAN_PREAMBLE : PLAN_REMINDER;
	return `${prompt.trimEnd()}\n\n${tail}`;
}

export function initPromptMode(host: HTMLElement, onChange: (mode: PromptMode) => void) {
	const proBtn = host.querySelector<HTMLButtonElement>('#proBtn');
	const planBtn = host.querySelector<HTMLButtonElement>('#planBtn');
	if (!proBtn || !planBtn) {
		return;
	}

	// PLAN is transient — never persisted (see module header). No persist arg.
	const apply = (mode: PromptMode) => {
		proBtn.classList.toggle('is-active', mode === 'pro');
		planBtn.classList.toggle('is-active', mode === 'plan');
		proBtn.setAttribute('aria-pressed', mode === 'pro' ? 'true' : 'false');
		planBtn.setAttribute('aria-pressed', mode === 'plan' ? 'true' : 'false');
		onChange(mode);
	};

	proBtn.addEventListener('click', () => apply('pro'));
	planBtn.addEventListener('click', () => apply('plan'));

	// Alt+1 / Alt+2 switch modes; listening on the host (not the textarea)
	// keeps the chord working wherever focus sits inside the modal.
	host.addEventListener('keydown', (e) => {
		if (matchesShortcut(e, 'promptModePro')) {
			e.preventDefault();
			apply('pro');
		} else if (matchesShortcut(e, 'promptModePlan')) {
			e.preventDefault();
			apply('plan');
		}
	});

	// Always open in PRO — the mode is not remembered across opens.
	apply('pro');
}
