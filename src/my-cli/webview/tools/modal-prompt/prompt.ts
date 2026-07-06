import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';
import {
	processPrompt,
	translatePromptText,
	type ImageAttachment,
	protectImageMarkers,
	restoreImageMarkers,
	type SpellIssue,
	type PasteAttachment,
	buildPasteMarker,
	countLines,
	detectPasteKind,
	expandPasteMarkers,
	protectPasteMarkers,
	restorePasteMarkers,
	stripPromptTokens,
	protectMentions,
	restoreMentions,
	type WorkspaceSkill,
	expandSkillsToken,
	protectSkillTokens,
	restoreSkillTokens,
	getPromptLanguage,
	type PromptLang,
} from '../../../shared/prompt';
import { mountFileMentionPicker, resolveFileMentionAliases } from './components/file-mention/file-mention';
import { initLanguageSelect } from './language-select';
import { initSpellSuggest } from './spell-suggest';
import type { PromptContext } from './prompt-context';
import type { VoiceState } from '../../../shared/voice/voice-types';
import { setupUndoHistory } from './textarea-history';
import { enforceLowercaseInput } from './lowercase-input';
import {
	atomicMarkerPattern,
	getImageTypeFromPath,
	getLeadingSkillTokenGuardEnd,
	getPathBaseName,
	getReferencedImageAttachments,
	guardLeadingSkillToken,
	handleImageMarkerArrowKey,
	handleImageMarkerDeleteKey,
	setupImagePaste,
	setupPasteCollapse
} from './attachments-ui';
import { updatePromptImageHighlight } from './highlight';
import { initSkillsChips, isClaudeSession } from './skills-chips';
import { updateFooterModel } from './footer-model';
import { initSessionState, showNoSessionMessage } from './session-state';
import { initPromptMode, buildPlanText, type PromptMode } from './prompt-mode';
import { initRulesToggle, type RulesToggleController } from './rules-toggle';
import { buildRulesPrompt, RULES_MARKER } from '../../../shared/rules/rules-content';
import { initPromptHistory, recordSentPrompt } from './prompt-history';
import { initAttachmentPeek } from './attachment-peek';
import { getShortcut, matchesShortcut } from '../../../../shared/keymaps/cli';

export type { PromptContext } from './prompt-context';

const stylesId = 'cli-prompt-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = promptStyles;
	document.head.append(style);
};

// Budget for the *effective* typed text — markers and @mentions are free, and
// large pastes collapse into markers, so this only constrains hand-typed prose.
// Kept well under the host translator's 20k hard cap so a send can never die
// there mid-flight. Warn/danger track ~70% / ~90%.
const promptCharLimit = 5000;
const promptCharWarn = 3500;
const promptCharDanger = 4500;
const routePromptCloseDelayMs = 1200;

const hasRouteMention = (text: string) => /(^|\s)@\S+/.test(text);

// Same source modal-commands uses; keys the per-CLI prompt history.
const getActiveAgentSlug = (): string =>
	document.querySelector<HTMLElement>('.agent-shell')?.dataset.agent ?? '';

// Draft state per CLI session, surviving modal close/Esc (a too-easy accident
// while typing). Lives in module scope: the webview JS context persists while
// the panel is open, and entries are keyed by session id so a draft dies with
// its session and can never resurface in another CLI.
type PromptDraft = {
	text: string;
	imageAttachments: ImageAttachment[];
	nextImageAttachmentId: number;
	pasteAttachments: PasteAttachment[];
	nextPasteAttachmentId: number;
	selectedSkills: WorkspaceSkill[];
};
const promptDrafts = new Map<string, PromptDraft>();

// CLI sessions that already had the rules injected. Keyed by session id so the
// one-shot survives modal close/reopen and resets for a brand-new CLI. Lives in
// module scope alongside the drafts, and is pruned on the same lifecycle.
const rulesInjectedSessions = new Set<string>();

// CLI sessions that already received PLAN's full preamble. Same one-shot idea as
// the rules set above: after the first plan send the model has the preamble in
// context, so later plan sends carry only a short reminder. Same lifecycle —
// survives modal reopen, pruned when the session closes.
const planPreambleSentSessions = new Set<string>();

/** The rules toggle controller for the currently open prompt modal, if any. */
let activeRulesController: RulesToggleController | undefined;

/** Host-driven rules injection (launcher Alt+Left click) tells the webview the
 *  rules landed; mark the session and update the live button state. */
export const markRulesInjectedForSession = (sessionId: string) => {
	rulesInjectedSessions.add(sessionId);
	activeRulesController?.setDone();
};

/** Read the rules sound URI injected by the host into the webview HTML. */
export const getRulesSoundUri = (): string | undefined => {
	const el = document.getElementById('cli-sounds');
	if (!el) {
		return undefined;
	}
	try {
		return JSON.parse(el.textContent || '{}').rules as string | undefined;
	} catch {
		return undefined;
	}
};

/** Drop drafts + rules-injected marks whose session is gone; the terminal calls
 *  this on every state sync. */
export const prunePromptDrafts = (openSessionIds: Set<string>) => {
	for (const sessionId of promptDrafts.keys()) {
		if (!openSessionIds.has(sessionId)) {
			promptDrafts.delete(sessionId);
		}
	}
	for (const sessionId of rulesInjectedSessions) {
		if (!openSessionIds.has(sessionId)) {
			rulesInjectedSessions.delete(sessionId);
		}
	}
	for (const sessionId of planPreambleSentSessions) {
		if (!openSessionIds.has(sessionId)) {
			planPreambleSentSessions.delete(sessionId);
		}
	}
};

export const mountPromptPanel = (host: HTMLElement, context: PromptContext = { close: () => {} }) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (promptHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closePromptBtn');
	if (closeBtn) {
		closeBtn.addEventListener('click', () => context.close());
	}

	const hasActiveSession = !!context.getActiveSessionId?.();

	// Element-level listeners die with the DOM on unmount, but this mount also
	// registers document/window listeners, observers and timers — those outlive
	// the DOM and pile up across modal opens unless released. The abort signal
	// is that release; the tools controller invokes the returned cleanup on close.
	const lifecycle = new AbortController();

	updateFooterModel(host, context, hasActiveSession, lifecycle.signal);
	initSessionState(host, hasActiveSession);
	// Wired independently of session state: a read-aloud can be live even with no
	// active session, and must stay controllable here.
	initVoiceControl(host, context, lifecycle.signal);
	initPromptComposer(host, context, hasActiveSession, lifecycle.signal);

	return () => lifecycle.abort();
};

// Voice pill: control a read-aloud already playing when the modal opens (e.g.
// Ctrl+Space here from the translator mid-read). Shown only while active; the
// prompt never starts a read, only pauses/resumes/stops the host's.
function initVoiceControl(host: HTMLElement, context: PromptContext, signal: AbortSignal) {
	const pill = host.querySelector<HTMLElement>('#promptVoicePill');
	const toggleBtn = host.querySelector<HTMLButtonElement>('#promptVoiceToggle');
	const stopBtn = host.querySelector<HTMLButtonElement>('#promptVoiceStop');
	if (!pill || !toggleBtn || !stopBtn || !context.onVoiceState) {
		return;
	}

	let state: VoiceState = 'idle';

	const apply = (next: VoiceState) => {
		state = next;
		const active = next === 'speaking' || next === 'paused' || next === 'preparing';
		pill.hidden = !active;
		pill.setAttribute('aria-hidden', active ? 'false' : 'true');
		pill.classList.toggle('is-speaking', next === 'speaking');
		pill.classList.toggle('is-paused', next === 'paused');
		pill.classList.toggle('is-preparing', next === 'preparing');
		toggleBtn.disabled = next === 'preparing';
		const label = next === 'preparing' ? 'Preparing voice…'
			: next === 'paused' ? 'Resume voice'
			: 'Pause voice';
		toggleBtn.title = label;
		toggleBtn.setAttribute('aria-label', label);
	};

	const dispose = context.onVoiceState((next) => apply(next));
	// Resync against a read that may already be running in the translator we left.
	context.queryVoiceState?.();

	toggleBtn.addEventListener('click', () => {
		if (state === 'speaking') {
			context.pauseSpeech?.();
		} else if (state === 'paused') {
			context.resumeSpeech?.();
		}
	});
	stopBtn.addEventListener('click', () => {
		if (state === 'speaking' || state === 'paused') {
			context.stopSpeech?.();
		}
	});

	signal.addEventListener('abort', () => dispose());
}

function initPromptComposer(host: HTMLElement, context: PromptContext, hasActiveSession: boolean, signal: AbortSignal) {
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const textareaWrap = host.querySelector<HTMLElement>('.prompt-textarea-wrap');
	const highlight = host.querySelector<HTMLElement>('.prompt-textarea-highlight');

	if (!textarea) {
		return;
	}

	// Rules injection state — declared up front so the always-on rules button
	// (wired before the no-session return) and the later run button can share it.
	let injectInFlight = false;
	let runButtonRefresh: (() => void) | undefined;
	let rulesController: RulesToggleController | undefined;

	// PRO/PLAN tabs — initialized even without a session so the persisted mode
	// always shows. PLAN appends a planning instruction at send time (see the
	// send path); it never injects anything into the terminal.
	let promptMode: PromptMode = 'pro';

	// Rules is a full-session action; PLAN carries its own guard, so gray the
	// button while planning (blocks an accidental heavy injection mid-plan) and
	// restore it in PRO. Done/injecting states are left alone. Hoisted so the mode
	// onChange can call it even though rulesController is undefined at the first
	// (init) call — optional chaining no-ops then; the post-init call below applies
	// it for real once the controller exists.
	function syncRulesForMode(mode: PromptMode) {
		if (injectInFlight) {
			return; // an injection is landing — don't disturb its visual
		}
		const sid = context.getActiveSessionId?.();
		if (sid && rulesInjectedSessions.has(sid)) {
			return; // already loaded → stays muted-gray regardless of mode
		}
		if (mode === 'plan') {
			rulesController?.setPlanLocked();
		} else {
			rulesController?.setAvailable();
		}
	}

	initPromptMode(host, (mode) => {
		promptMode = mode;
		// The run button keeps "Execute" in both modes; the input field wears
		// the mode instead (accent-tinted while PLAN is active).
		host.querySelector<HTMLElement>('.prompt-modal')?.classList.toggle('is-plan-mode', mode === 'plan');
		syncRulesForMode(mode);
	});

	// "rules" — a one-shot, language- and CLI-agnostic action, wired before the
	// no-session return so the button is always live. Clicking it types the rules
	// prompt into the CLI once (the host waits until the agent has read it); a
	// click with no running CLI, a busy one, or after it already ran this session
	// is refused with a shake. The per-session "loaded" mark survives modal
	// close/reopen (rulesInjectedSessions) and blocks re-injection.
	let rulesSoundPlayedForSession = false;
	async function activateRules() {
		if (injectInFlight) {
			return;
		}
		const sessionId = context.getActiveSessionId?.();
		// Need a running CLI to type into, and it must be idle — typing into a
		// busy CLI would corrupt its input line.
		if (!sessionId || context.isCliBusy?.() || !context.injectRules || rulesInjectedSessions.has(sessionId)) {
			rulesController?.flashDenied();
			return;
		}

		injectInFlight = true;
		rulesController?.setInjecting();

		// Play the whip-crack sound once per successful rules activation.
		// Failures/retry reset via setAvailable below.
		if (!rulesSoundPlayedForSession) {
			rulesSoundPlayedForSession = true;
			const soundUri = getRulesSoundUri();
			if (soundUri) {
				const audio = new Audio(soundUri);
				audio.volume = 0.5;
				audio.play().catch(() => { /* ignore autoplay / load errors */ });
			}
		}

		// Block Execute with a visible "loading" state while the rules land — a
		// prompt sent mid-injection would race the rules message into the CLI.
		const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
		const savedRunBtnHtml = runBtn?.innerHTML;
		if (runBtn) {
			runBtn.classList.add('is-loading-rules');
			// Hide the original "Execute" text but keep its width so the button
			// does not collapse or stretch — the turquoise stripe animation is
			// the only visible loading cue.
			runBtn.innerHTML = '<span class="prompt-run-loading-text">Execute</span>';
		}
		runButtonRefresh?.();

		let ok = false;
		try {
			ok = await context.injectRules(buildRulesPrompt(), RULES_MARKER);
		} catch (err) {
			console.error('[Prompt] Rules injection failed:', err);
		} finally {
			injectInFlight = false;
			if (runBtn && savedRunBtnHtml !== undefined) {
				runBtn.classList.remove('is-loading-rules');
				runBtn.innerHTML = savedRunBtnHtml;
			}
			runButtonRefresh?.();
		}

		if (ok) {
			rulesInjectedSessions.add(sessionId);
			rulesController?.setDone();
		} else {
			// Nothing landed (session gone) — restore per current mode: clickable
			// to retry in PRO, but stays grayed if we're now in PLAN.
			syncRulesForMode(promptMode);
		}
	}

	rulesController = initRulesToggle(host, () => { void activateRules(); }, () => textarea.focus());
	activeRulesController = rulesController;
	signal.addEventListener('abort', () => {
		if (activeRulesController === rulesController) {
			activeRulesController = undefined;
		}
	});

	// Reflect whether this session already loaded the rules (survives reopen).
	const activeSessionId = context.getActiveSessionId?.();
	if (activeSessionId && rulesInjectedSessions.has(activeSessionId)) {
		rulesController?.setDone();
	} else {
		// Not loaded yet → available in PRO, grayed while PLAN is active.
		syncRulesForMode(promptMode);
	}

	// Alt+1 / Alt+2 / Alt+3 click the footer model / resume / usage chips.
	host.addEventListener('keydown', (e) => {
		const shortcutButtons = [
			{ id: 'promptFooterModel' as const, selector: '[data-shortcut="model"]' },
			{ id: 'promptFooterResume' as const, selector: '[data-shortcut="resume"]' },
			{ id: 'promptFooterUsage' as const, selector: '[data-shortcut="usage"]' },
		];
		for (const { id, selector } of shortcutButtons) {
			if (matchesShortcut(e, id)) {
				const btn = host.querySelector<HTMLButtonElement>(`.prompt-footer ${selector}`);
				if (btn) {
					e.preventDefault();
					// The chip click closes the modal, so without this the event
					// would bubble on to the terminal-wide Alt+1/2/3 handler (which
					// only skips while a modal is open) and inject twice.
					e.stopPropagation();
					btn.click();
					// VS Code's Alt+number bindings switch editor tabs and steal focus;
					// bring it back to the CLI after the chip action runs.
					context.refocusCli?.();
				}
				break;
			}
		}
	});

	// When there is no active session we keep everything disabled
	if (!hasActiveSession) {
		textarea.disabled = true;
		return;
	}

	// Force lowercase input, with Shift as the only way to write uppercase
	enforceLowercaseInput(textarea);

	// @ file mention picker
	// We pass the wrap as the "anchor" for position calculations (getBoundingClientRect).
	// Internally the picker now portals the dropdown to the outer #cli-tools-modal
	// (using position:absolute relative to it) so the list can float freely upwards
	// in the full dialog area without being height-limited by the input box or card.
	if (context.requestWorkspaceFiles) {
		const textareaWrapEl = host.querySelector<HTMLElement>('.prompt-textarea-wrap');
		if (textareaWrapEl) {
			mountFileMentionPicker(
				textarea,
				textareaWrapEl,
				() => context.requestWorkspaceFiles!(),
				signal
			);
		}
	}

	// Restore the draft for this session, if the modal was closed mid-typing.
	const draftKey = context.getActiveSessionId?.();
	const savedDraft = draftKey ? promptDrafts.get(draftKey) : undefined;

	// Image attachments state (survives modal close via the session draft)
	const imageAttachments: ImageAttachment[] = savedDraft?.imageAttachments ?? [];
	let nextImageAttachmentId = savedDraft?.nextImageAttachmentId ?? 1;

	// Collapsed-paste state — large pasted blocks live here verbatim while the
	// textarea only shows their [Code/Text #N +X lines] marker.
	const pasteAttachments: PasteAttachment[] = savedDraft?.pasteAttachments ?? [];
	let nextPasteAttachmentId = savedDraft?.nextPasteAttachmentId ?? 1;
	let sendInFlight = false;

	// The chosen source language (persisted by the picker). Drives translation
	// source, spell-check language and toggle visibility. Undefined until the
	// user picks one — typing stays locked until then.
	let currentLang: PromptLang | undefined;

	if (savedDraft?.text) {
		textarea.value = savedDraft.text;
	}

	const saveDraft = () => {
		if (!draftKey) {
			return;
		}
		promptDrafts.set(draftKey, {
			text: textarea.value,
			imageAttachments,
			nextImageAttachmentId,
			pasteAttachments,
			nextPasteAttachmentId,
			selectedSkills,
		});
	};
	textarea.addEventListener('input', saveDraft);

	// Custom undo/redo: programmatic value writes (lowercase enforcement,
	// marker insertion) wipe the browser's native undo stack, so Ctrl+Z needs
	// its own history.
	setupUndoHistory(textarea);

	const registerPasteAttachment = (content: string): string => {
		const id = nextPasteAttachmentId++;
		const kind = detectPasteKind(content);
		const marker = buildPasteMarker(kind, id, countLines(content));
		pasteAttachments.push({ id, marker, kind, content });
		return marker;
	};

	// Translate toggle — on by default, persisted to localStorage across sessions.
	// localStorage key: 'f1-translate-auto' → '1' (on) | '0' (off). Missing key = on.
	const translateState = { enabled: localStorage.getItem('f1-translate-auto') !== '0' };
	let setTranslating: (active: boolean) => void = () => {};

	// Spell-checking always runs in lenient mode: accent omissions (missing
	// tildes) are accepted, never flagged. There is no user-facing strict toggle —
	// an English keyboard can't type accents and the CLI understands the text
	// regardless. Assigned once runSpellcheck/renderHighlight exist; re-marks when
	// the source language changes.
	let rerunSpellcheck: () => void = () => {};

	const registerPathImageAttachment = (path: string): string => {
		const id = nextImageAttachmentId++;
		const marker = `[Image #${id}]`;
		imageAttachments.push({
			id,
			marker,
			source: 'path',
			path,
			type: getImageTypeFromPath(path),
			name: getPathBaseName(path),
		});
		return marker;
	};

	const registerClipboardImageAttachment = (file: File): string => {
		const id = nextImageAttachmentId++;
		const marker = `[Image #${id}]`;
		const attachment: ImageAttachment = {
			id,
			marker,
			source: 'clipboard',
			type: file.type || 'image/png',
			name: file.name || `Image ${id}`,
			size: file.size,
		};
		imageAttachments.push(attachment);

		const reader = new FileReader();
		reader.addEventListener('load', () => {
			if (typeof reader.result === 'string') {
				attachment.dataUrl = reader.result;
			}
		});
		reader.readAsDataURL(file);

		return marker;
	};

	// Setup paste that supports images/screenshots + paths (must run before or combined with lowercase)
	setupImagePaste(textarea, registerPathImageAttachment, registerClipboardImageAttachment);

	// Large text/code pastes collapse into an atomic marker instead of flooding
	// the textarea (the other paste handlers skip these via shouldCollapsePaste).
	setupPasteCollapse(textarea, registerPasteAttachment);

	// Atomic delete and traversal for [Image #N] markers
	textarea.addEventListener('keydown', (e) => {
		if (handleImageMarkerDeleteKey(textarea, e)) {return;}
		if (handleImageMarkerArrowKey(textarea, e)) {return;}
	});

	// Blocks non-letter insertion (digits, symbols, space, IME, native paste)
	// from landing in front of a leading [Skills] token. Typed letters are
	// clamped separately in enforceLowercaseInput, above.
	guardLeadingSkillToken(textarea);

	// The real send that handles optional auto-translate + image resolution before processPrompt.
	// Lives inside init so it closes over translateState / setTranslating / imageAttachments.
	async function doPerformSendWithImages(
		hostEl: HTMLElement,
		ta: HTMLTextAreaElement,
		ctx: PromptContext,
		currentAttachments: ImageAttachment[],
		skipTranslate: boolean
	) {
		// injectInFlight: a rules injection is landing in the CLI — a send now
		// would race its message in ahead of the rules.
		if (sendInFlight || injectInFlight) {
			return;
		}

		if (!ctx.sendToActiveSession) {
			showNoSessionMessage(hostEl);
			return;
		}

		sendInFlight = true;
		// Lock the composer for the whole in-flight window. Translation and the
		// @route delayed-close both keep the modal open after Execute, and until
		// now the textarea stayed editable there — the user could type into or
		// delete from a prompt already on its way out. `disabled` (not readonly)
		// because the custom key handlers mutate textarea.value directly and would
		// slip past a readonly guard; it is also the component's existing "locked"
		// idiom (no-session + language gate). The field's paint comes from the
		// overlay, so disabling changes nothing visually beyond dropping the caret.
		// Re-enabled only on the stay-open failure paths below; a successful send
		// unmounts the modal.
		ta.disabled = true;
		const runBtn = hostEl.querySelector<HTMLButtonElement>('#runBtn');
		const savedRunBtnHtml = runBtn?.innerHTML;
		const restoreRunButton = () => {
			if (!runBtn || savedRunBtnHtml === undefined) {
				return;
			}

			runBtn.classList.remove('is-translating');
			runBtn.innerHTML = savedRunBtnHtml;
			const trimmed = ta.value.trim();
			runBtn.disabled = !(trimmed.length >= 6 || trimmed.includes(' ')) || !ctx.getActiveSessionId?.();
		};

		let textToSend = ta.value;
		// Whether this send actually ran the translator. Drives the button label
		// for @route prompts below: a translated route keeps "Translating…" all
		// the way to the close instead of flashing a separate "Sending…" state.
		let didTranslate = false;

		// Auto-translate (<source> → EN) when the language translates and the
		// toggle is active. English (translates:false) is sent verbatim.
		// The textarea keeps the original text; the CLI receives the translation.
		// skipTranslate is the one-off Ctrl+Shift+Enter override.
		const sourceLang = currentLang ? getPromptLanguage(currentLang) : undefined;
		if (sourceLang?.translates && translateState.enabled && !skipTranslate && ctx.translatePrompt) {
			didTranslate = true;
			setTranslating(true);
			if (runBtn) {
				runBtn.classList.add('is-translating');
				runBtn.disabled = true;
				runBtn.innerHTML = '<span>Translating…</span>';
			}
			try {
				// Image markers, paste markers, skill tokens AND @mention routes
				// must survive translation untouched — they also shrink the payload
				// the translator has to process, so requests are faster and safer.
				const { text: imageProtected, markers } = protectImageMarkers(textToSend);
				const { text: pasteProtected, markers: pasteMarkers } = protectPasteMarkers(imageProtected);
				const { text: skillProtected, tokens: skillTokens } = protectSkillTokens(pasteProtected);
				const { text: protectedText, mentions } = protectMentions(skillProtected);
				const result = await translatePromptText(protectedText, ctx, currentLang);
				const translated = result.text
					? restoreImageMarkers(restorePasteMarkers(restoreSkillTokens(restoreMentions(result.text, mentions), skillTokens), pasteMarkers), markers)
					: '';
				if (translated && translated !== textToSend.trim()) {
					textToSend = translated;
				}
			} catch (err) {
				console.error('[Prompt] Auto-translate failed:', err);
			} finally {
				setTranslating(false);
				// Button restore is deferred until the @route check below: a
				// translated route prompt must keep its "Translating…" label
				// straight through to the close, not snap back to "Execute" here.
			}
		}

		const referenced = getReferencedImageAttachments(textToSend, currentAttachments);

		if (referenced.length > 0 && ctx.preparePromptWithAttachments) {
			try {
				textToSend = await ctx.preparePromptWithAttachments(textToSend, referenced);
			} catch (err) {
				console.error('[Prompt] Failed to prepare image attachments:', err);
			}
		}

		// The [Skills #N] aggregate token expands into explicit instructions
		// with each SKILL.md route resolved for the active CLI (.claude/skills
		// for Claude, .agents/skills for the rest). Done post-translation —
		// the generated text is already English — and before paste expansion.
		textToSend = expandSkillsToken(textToSend, selectedSkills, isClaudeSession());

		// Collapsed pastes leave the textarea as markers; the CLI gets the
		// original verbatim content (never lowercased, never translated).
		textToSend = expandPasteMarkers(textToSend, pasteAttachments);

		// The textarea can show compact @~/ aliases; restore the actual
		// workspace-relative @path right before sending to the CLI.
		textToSend = resolveFileMentionAliases(textToSend);

		// PLAN mode rides along as text — appended last so it wraps the fully
		// expanded prompt, and post-translation so it stays English. A route-only
		// message is a cheap "prime & ack" (💡); prose is the real plan request and
		// carries the preamble once per session. See prompt-mode.buildPlanText.
		let planSessionForMark: string | undefined;
		if (promptMode === 'plan') {
			const sid = ctx.getActiveSessionId?.();
			const routeOnly = hasRouteMention(ta.value) && stripPromptTokens(ta.value).trim().length === 0;
			const firstInSession = !sid || !planPreambleSentSessions.has(sid);
			textToSend = buildPlanText(textToSend, { routeOnly, firstInSession });
			// A route-only prime carries no preamble, so it must not burn the
			// one-shot — only a prose plan send marks the session.
			planSessionForMark = routeOnly ? undefined : sid;
		}
		const shouldDelayClose = hasRouteMention(textToSend);
		if (shouldDelayClose && runBtn) {
			// Route prompts hold the modal open briefly so the @path paste can land
			// in the terminal. Keep the "Translating…" label straight through that
			// window when we translated (no jarring "Sending…" flash); show a
			// neutral "Sending…" only when no translation ran.
			runBtn.classList.add('is-translating');
			runBtn.disabled = true;
			runBtn.innerHTML = didTranslate
				? '<span>Translating…</span>'
				: '<span>Sending…</span>';
		} else if (didTranslate) {
			// Translated but closing immediately (no @route) — restore the normal
			// button now that the deferred restore above no longer runs.
			restoreRunButton();
		}

		// Release the in-flight guard only when the close actually runs: during a
		// route prompt's delayed-close window the guard is what blocks a duplicate
		// Ctrl+Enter send.
		const closeAfterSend = () => {
			sendInFlight = false;
			ctx.close();
		};
		let result: { status: string };
		try {
			result = processPrompt(textToSend, {
				close: shouldDelayClose ? () => window.setTimeout(closeAfterSend, routePromptCloseDelayMs) : closeAfterSend,
				sendToActiveSession: ctx.sendToActiveSession,
				getActiveSessionId: ctx.getActiveSessionId,
			});
		} catch (err) {
			console.error('[MySkills] processPrompt threw:', err);
			sendInFlight = false;
			ta.disabled = false;
			restoreRunButton();
			return;
		}

		if (result.status === 'no-session') {
			sendInFlight = false;
			ta.disabled = false;
			restoreRunButton();
			showNoSessionMessage(hostEl);
			ta.focus();
		}

		if (result.status === 'empty') {
			sendInFlight = false;
			ta.disabled = false;
			restoreRunButton();
			ta.focus();
		}

		if (result.status === 'sent') {
			// Mark PLAN's full preamble as delivered only now — a failed send must
			// not burn the one-shot.
			if (planSessionForMark) {
				planPreambleSentSessions.add(planSessionForMark);
			}
			// Original textarea text (markers get stripped inside) — never the
			// translated/expanded payload.
			recordSentPrompt(getActiveAgentSlug(), ta.value);
			// The draft has served its purpose.
			if (draftKey) {
				promptDrafts.delete(draftKey);
			}
		}
	}

	if (textareaWrap) {
		textareaWrap.classList.remove('is-pro');
	}
	// Placeholder + focus + textarea unlock are driven by the language gate below.

	// Ordered selection of skills — updated as the user toggles chips. The
	// textarea holds only the aggregate [Skills #N] count token; the actual
	// WorkspaceSkill objects live here and drive the send-time expansion.
	// Restored from the draft so a modal close/reopen keeps the chips marked.
	let selectedSkills: WorkspaceSkill[] = savedDraft?.selectedSkills ?? [];

	if (hasActiveSession) {
		const refreshSkills = initSkillsChips(host, context, textarea, (selection) => {
			selectedSkills = selection;
			// updateToken() dispatches its own 'input' event (which calls
			// saveDraft) BEFORE invoking this callback, so that save would
			// otherwise persist the previous selection — save again now that
			// selectedSkills is current.
			saveDraft();
		}, selectedSkills);
		if (refreshSkills) {
			context.registerSkillsRefresh?.(refreshSkills);
		}
		const tools = initToolbarActions(
			host,
			() => translateState.enabled,
			(val) => {
				translateState.enabled = val;
				try { localStorage.setItem('f1-translate-auto', val ? '1' : '0'); } catch { /* storage unavailable */ }
			}
		);
		setTranslating = tools.setTranslating;
	}

	const performSendNow = async (options?: { skipTranslate?: boolean }) => {
		await doPerformSendWithImages(host, textarea, context, imageAttachments, options?.skipTranslate === true);
	};

	runButtonRefresh = initRunButton(host, textarea, context, performSendNow, () => injectInFlight)?.refresh;
	initSendShortcut(textarea, context, performSendNow);

	if (hasActiveSession) {
		updateCharCount(host, textarea);
	}

	const adjustHeight = () => {
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	};

	// Live spell-marking state. Misspelled-word ranges come from the host (cspell trie).
	// Ranges are offset-based, so edits shift them — instead of clearing on every
	// keystroke (marks used to vanish and pop back after the debounce round-trip),
	// we remap offsets across the edit and let the debounced recheck refresh them.
	let spellIssues: SpellIssue[] = [];
	// The text the current spellIssues offsets refer to.
	let spellTextSnapshot = textarea.value;
	let spellcheckTimer: number | undefined;
	let spellcheckToken = 0;

	// Shift existing marks across a contiguous edit (the only kind a textarea
	// produces): marks before the edit stay, marks after it slide by the length
	// delta, and marks touching the edited region are dropped — that word is
	// being rewritten, and the recheck re-flags it if it's still wrong.
	const remapSpellIssues = (oldText: string, newText: string) => {
		if (spellIssues.length === 0 || oldText === newText) {
			return;
		}
		let prefix = 0;
		const maxCommon = Math.min(oldText.length, newText.length);
		while (prefix < maxCommon && oldText[prefix] === newText[prefix]) {
			prefix++;
		}
		let suffix = 0;
		while (
			suffix < maxCommon - prefix &&
			oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
		) {
			suffix++;
		}
		const oldEditEnd = oldText.length - suffix;
		const delta = newText.length - oldText.length;
		spellIssues = spellIssues.flatMap((issue) => {
			if (issue.offset + issue.length < prefix) {
				return [issue];
			}
			if (issue.offset > oldEditEnd) {
				return [{ ...issue, offset: issue.offset + delta }];
			}
			return [];
		});
	};

	const renderHighlight = () => {
		if (highlight && textareaWrap) {
			updatePromptImageHighlight(textareaWrap, textarea, highlight, spellIssues);
		}
	};

	const runSpellcheck = () => {
		// No checker, no language chosen, or a language without a dictionary
		// (Chinese) → no spell marking.
		const langInfo = currentLang ? getPromptLanguage(currentLang) : undefined;
		if (!context.requestSpellcheck || !currentLang || !langInfo?.spellcheck) {
			return;
		}

		const token = ++spellcheckToken;
		const text = textarea.value;
		if (!text.trim()) {
			return;
		}

		// Always lenient: accent omissions are accepted, never flagged.
		void context.requestSpellcheck(text, currentLang, false).then((issues) => {
			// Drop stale responses and any result whose offsets no longer match the text.
			if (token !== spellcheckToken || textarea.value !== text) {
				return;
			}
			spellIssues = issues;
			spellTextSnapshot = text;
			renderHighlight();
		});
	};

	// Switching the source language changes verdicts for already-typed text:
	// clear stale marks immediately, then recompute under the new dictionary.
	rerunSpellcheck = () => {
		spellIssues = [];
		spellTextSnapshot = textarea.value;
		renderHighlight();
		runSpellcheck();
	};

	const scheduleSpellcheck = () => {
		window.clearTimeout(spellcheckTimer);
		spellcheckTimer = window.setTimeout(runSpellcheck, 400);
	};
	signal.addEventListener('abort', () => window.clearTimeout(spellcheckTimer));

	const onInputForHighlight = () => {
		adjustHeight();
		// Keep existing marks alive through the edit: shift their offsets to the
		// new text so nothing flickers; the debounced pass trues them up.
		remapSpellIssues(spellTextSnapshot, textarea.value);
		spellTextSnapshot = textarea.value;
		if (highlight && textareaWrap) {
			// use raf to ensure update happens after value commit and to help layer paint
			requestAnimationFrame(renderHighlight);
		}
		scheduleSpellcheck();
	};

	textarea.addEventListener('input', onInputForHighlight);

	// scroll sync for the highlight overlay (so long text + markers stay aligned)
	textarea.addEventListener('scroll', () => {
		if (highlight) {
			highlight.scrollTop = textarea.scrollTop;
			highlight.scrollLeft = textarea.scrollLeft;
		}
	});

	const forceCaretOutOfMarkers = () => {
		if (textarea.selectionStart !== textarea.selectionEnd) {return;}
		const caret = textarea.selectionStart ?? 0;

		// A leading [Skills] token has no valid position "before" it — unlike
		// other markers, clicking right in front of it and typing would glue
		// text onto its start-anchored pattern and silently break it.
		const guardEnd = getLeadingSkillTokenGuardEnd(textarea.value);
		if (caret < guardEnd) {
			textarea.setSelectionRange(guardEnd, guardEnd);
			return;
		}

		for (const match of textarea.value.matchAll(atomicMarkerPattern)) {
			const start = match.index ?? 0;
			const end = start + match[0].length;
			if (caret > start && caret < end) {
				const newCaret = (caret - start) < (end - caret) ? start : end;
				textarea.setSelectionRange(newCaret, newCaret);
				break;
			}
		}
	};

	// selectionchange: update highlight so .selected spans get the blue bg when user selects text
	const onSelectionChange = () => {
		if (document.activeElement === textarea && highlight && textareaWrap) {
			forceCaretOutOfMarkers();
			renderHighlight();
		}
	};
	document.addEventListener('selectionchange', onSelectionChange, { signal });

	// Initial adjustment + first highlight render
	requestAnimationFrame(() => {
		adjustHeight();
		renderHighlight();
	});

	// Alt-click a red word → apply its top correction; Alt-hover → pointer cursor.
	initSpellSuggest({
		textarea,
		highlight,
		getSpellIssues: () => spellIssues,
		onApplied: rerunSpellcheck,
		signal,
	});

	// ArrowUp in an empty textarea recalls previously sent prompts (per CLI).
	initPromptHistory(textarea, getActiveAgentSlug);

	// Plain click a collapsed-paste marker → peek/edit popover; hover an
	// [Image #N] marker → thumbnail preview.
	initAttachmentPeek({ textarea, highlight, pasteAttachments, imageAttachments, signal });

	// ── Language gate ────────────────────────────────────────────────
	// The picker is the single source of the source language. Typing stays
	// locked until one is chosen; the choice persists across sessions.
	const translateToggleBtn = host.querySelector<HTMLButtonElement>('#translateToggle');

	const applyLanguage = (lang: PromptLang) => {
		currentLang = lang;
		const info = getPromptLanguage(lang);
		// Translate toggle: only for languages that translate (hidden for English).
		if (translateToggleBtn) {
			translateToggleBtn.hidden = !info?.translates;
		}
		// Unlock typing now that a language is chosen.
		textarea.disabled = false;
		textarea.placeholder = 'Ask anything…';
		rerunSpellcheck();
		requestAnimationFrame(() => textarea.focus());
	};

	const langController = initLanguageSelect(host, applyLanguage);
	const initialLang = langController.getLang();

	if (initialLang) {
		applyLanguage(initialLang);
	} else {
		// No language yet — lock typing and hide the translate toggle until the
		// user picks one from the header picker.
		textarea.disabled = true;
		textarea.placeholder = 'Select a language to start…';
		if (translateToggleBtn) { translateToggleBtn.hidden = true; }
	}
}

function initToolbarActions(
	host: HTMLElement,
	getEnabled: () => boolean,
	setEnabled: (val: boolean) => void
): { setTranslating: (active: boolean) => void } {
	const toggleBtn = host.querySelector<HTMLButtonElement>('#translateToggle');

	if (!toggleBtn) {
		return { setTranslating: () => {} };
	}

	// Sync visual state from persisted preference (aria-pressed="true" is the HTML default,
	// but we still set it explicitly so it reflects localStorage on every mount).
	toggleBtn.setAttribute('aria-pressed', getEnabled() ? 'true' : 'false');

	toggleBtn.addEventListener('click', () => {
		const next = !getEnabled();
		setEnabled(next);
		toggleBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
	});

	return {
		setTranslating: (active: boolean) => {
			toggleBtn.classList.toggle('is-translating', active);
		},
	};
}

function initRunButton(
	host: HTMLElement,
	textarea: HTMLTextAreaElement,
	context: PromptContext,
	performSendImpl: () => Promise<void>,
	isBlocked?: () => boolean
): { refresh: () => void } | undefined {
	const runBtn = host.querySelector<HTMLButtonElement>('#runBtn');
	const runHint = host.querySelector<HTMLElement>('.prompt-run-hint');
	if (!runBtn) {
		return undefined;
	}

	if (runHint) {
		runHint.textContent = getShortcut('sendPrompt')?.description ?? 'Ctrl + Enter';
		runHint.title = 'Hold Shift to send without translating';
	}

	const updateState = () => {
		const text = textarea.value.trim();
		const hasSession = !!context.getActiveSessionId?.();
		// Activate only after a real word: 6+ chars OR first space (second word started)
		const hasEnoughText = text.length >= 6 || text.includes(' ');
		// Limit applies to the effective (typed) length — markers/@routes are free.
		const overLimit = stripPromptTokens(textarea.value).length > promptCharLimit;
		// isBlocked holds while a rules injection is in flight (Execute is frozen).
		runBtn.disabled = !hasEnoughText || !hasSession || overLimit || (isBlocked?.() ?? false);
	};

	// Initial state
	updateState();

	// Update live as user types
	textarea.addEventListener('input', () => {
		updateState();
		updateCharCount(host, textarea);
	});

	// Actual send action — delegates to the processor (future home of autocorrect + translate)
	// Now also resolves image attachments so paths appear in the CLI when Enter is pressed.
	runBtn.addEventListener('click', async () => {
		await performSendImpl();
	});

	return { refresh: updateState };
}

function initSendShortcut(
	textarea: HTMLTextAreaElement,
	context: PromptContext,
	performSendImpl: (options?: { skipTranslate?: boolean }) => Promise<void>
) {
	textarea.addEventListener('keydown', (e) => {
		if (matchesShortcut(e, 'sendPrompt')) {
			e.preventDefault();
			void performSendImpl();
			return;
		}

		// Shift variant of the send chord: one-off send without translation
		// (sendPrompt itself never matches with Shift held).
		if (e.key === 'Enter' && e.shiftKey && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void performSendImpl({ skipTranslate: true });
		}
	});
}

function updateCharCount(host: HTMLElement, textarea: HTMLTextAreaElement) {
	const counter = host.querySelector<HTMLElement>('#charCount');
	if (!counter) {
		return;
	}

	// Tokens (images, pastes, @routes) don't spend prompt budget — they resolve
	// outside the textarea and never go through translation.
	const current = stripPromptTokens(textarea.value).length;
	counter.textContent = `${current}/${promptCharLimit}`;

	// Remove previous states
	counter.classList.remove('warn', 'danger');

	if (current >= promptCharDanger) {
		// red + shake
		counter.classList.add('danger');
	} else if (current >= promptCharWarn) {
		// yellow warning
		counter.classList.add('warn');
	}
}
