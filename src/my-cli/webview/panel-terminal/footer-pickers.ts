/**
 * Footer chip shortcuts, terminal-wide. Alt+1/2/3 (model / resume / usage)
 * work directly on the focused CLI, not just inside the prompt modal — same
 * injection the modal footer chips use. Skipped while any tool modal is open:
 * the prompt modal binds its own copies to click the visible chips, and the
 * other modals own their keys. The same chord pressed again closes the picker
 * it opened (Esc), and a different chord swaps pickers. We can't *see* the TUI
 * picker, so this is tracked state: set on injection, cleared by Esc/Enter in
 * the terminal, any other submitted send, and session close. Extracted from
 * terminal.ts as a createFooterPickers(deps) factory (mirrors
 * createUsageTracker); reaches terminal state only via deps.
 */
import type { Terminal } from '@xterm/xterm';
import { getAgentSlug as resolveAgentSlug, getCliAgent } from '../../shared/agents';
import { matchesShortcut } from '../../../shared/keymaps/cli';
import { getUsageCommandLabel, isUsageAgentBusy, isUsageViewInline } from '../tools/modal-use/agents';
import { readTerminalScreenText } from './usage-tracker';
import type { WebviewToHostMessage } from '../../shared/protocol';

export type FooterShortcutKind = 'model' | 'resume' | 'usage';

export interface FooterPickerDeps {
	post(message: WebviewToHostMessage): void;
	getActiveSessionId(): string | undefined;
	getSession(sessionId: string): { id: string; label: string; status: string } | undefined;
	getView(sessionId: string): { terminal: Terminal } | undefined;
	isToolModalOpen(): boolean;
	sendToActiveSession(text: string, options?: { paste?: boolean; submit?: boolean }): void;
}

export type FooterPickers = ReturnType<typeof createFooterPickers>;

const getAgentSlug = (label: string): string => resolveAgentSlug(label) ?? 'default';

export const createFooterPickers = (deps: FooterPickerDeps) => {
	const openFooterPickers = new Map<string, FooterShortcutKind>();
	const pickerSwapDelayMs = 200;

	const resolveFooterCommand = (label: string, kind: FooterShortcutKind): string | undefined => {
		const agent = getCliAgent(label);
		if (kind === 'model') {
			return agent?.modelCommand;
		}
		if (kind === 'resume') {
			return agent?.resumeCommand;
		}
		// Usage differs per CLI (/usage vs /status) and some CLIs have none.
		const usageCommand = getUsageCommandLabel(label);
		return usageCommand === 'not configured' ? undefined : usageCommand;
	};

	// Runs on every submitted send (chords, modal chips, even a hand-typed
	// "/model" from the prompt modal): a send matching a picker command marks
	// that picker open; anything else clears the entry — after a real prompt
	// lands, no picker can still be up.
	const trackPickerCommand = (sessionId: string, label: string, text: string) => {
		const stripped = text.startsWith('\x15') ? text.slice(1) : text;
		let kind: FooterShortcutKind | undefined;
		if (stripped === resolveFooterCommand(label, 'model')) {
			kind = 'model';
		} else if (stripped === resolveFooterCommand(label, 'resume')) {
			kind = 'resume';
		} else if (stripped === resolveFooterCommand(label, 'usage')) {
			// Inline usage views (Codex /status prints into the transcript) have no
			// overlay to close, so they are never tracked as open.
			kind = isUsageViewInline(label) ? undefined : 'usage';
		}
		if (kind) {
			openFooterPickers.set(sessionId, kind);
		} else {
			openFooterPickers.delete(sessionId);
		}
	};

	const postEscapeToSession = (sessionId: string) => {
		const view = deps.getView(sessionId);
		const data = view?.terminal.modes.sendFocusMode ? '\x1b[I\x1b' : '\x1b';
		deps.post({ type: 'cli.input', sessionId, data });
	};

	const injectFooterCommand = (kind: FooterShortcutKind) => {
		const activeSessionId = deps.getActiveSessionId();
		const session = activeSessionId ? deps.getSession(activeSessionId) : undefined;
		if (session?.status !== 'running') {
			return;
		}
		const command = resolveFooterCommand(session.label, kind);
		if (!command) {
			return;
		}
		if (getAgentSlug(session.label) === 'cursor') {
			// Cursor's TUI drops raw chunked input: bracketed paste, no Ctrl+U.
			deps.sendToActiveSession(command, { paste: true, submit: true });
		} else {
			// \x15 is Ctrl+U: wipe the current input line so partially typed text
			// is not concatenated with the command.
			deps.sendToActiveSession(`\x15${command}`, { submit: true });
		}
	};

	// Whether the active CLI is mid-task and would corrupt its input if a command
	// were injected right now (idle-only CLIs: Kiro/Antigravity/Codex). Same
	// guard modal-use applies before injecting /usage.
	const isActiveCliBusy = (): boolean => {
		const activeSessionId = deps.getActiveSessionId();
		const session = activeSessionId ? deps.getSession(activeSessionId) : undefined;
		if (!session) {
			return false;
		}
		return isUsageAgentBusy(session.label, readTerminalScreenText(deps.getView(session.id)));
	};

	const handleShortcutKey = (event: KeyboardEvent): boolean => {
		if (event.type !== 'keydown' || event.repeat) {
			return false;
		}
		if (deps.isToolModalOpen()) {
			return false;
		}
		const kind = matchesShortcut(event, 'promptFooterModel') ? 'model'
			: matchesShortcut(event, 'promptFooterResume') ? 'resume'
			: matchesShortcut(event, 'promptFooterUsage') ? 'usage'
			: undefined;
		if (!kind) {
			return false;
		}
		const activeSessionId = deps.getActiveSessionId();
		const session = activeSessionId ? deps.getSession(activeSessionId) : undefined;
		if (session?.status !== 'running' || !resolveFooterCommand(session.label, kind)) {
			return false;
		}
		event.preventDefault();
		event.stopPropagation();

		const openKind = openFooterPickers.get(session.id);
		if (openKind) {
			// A picker we opened is still up: same chord closes it, a different
			// chord closes it and opens the requested one once the Esc has landed.
			postEscapeToSession(session.id);
			openFooterPickers.delete(session.id);
			if (openKind !== kind) {
				window.setTimeout(() => injectFooterCommand(kind), pickerSwapDelayMs);
			}
		} else if (!isActiveCliBusy()) {
			injectFooterCommand(kind);
		}
		// The CLI's picker needs terminal focus for arrow-key navigation.
		deps.getView(session.id)?.terminal.focus();
		return true;
	};

	// Esc dismisses a TUI picker, Enter selects from it — either way the
	// picker a footer chord opened is gone now. Observe only, never consume.
	const noteTerminalKey = (event: KeyboardEvent, sessionId: string) => {
		if (event.type === 'keydown' && (event.key === 'Escape' || event.key === 'Enter')) {
			openFooterPickers.delete(sessionId);
		}
	};

	const pruneClosedSessions = (openSessionIds: Set<string>) => {
		for (const sessionId of [...openFooterPickers.keys()]) {
			if (!openSessionIds.has(sessionId)) {
				openFooterPickers.delete(sessionId);
			}
		}
	};

	return {
		handleShortcutKey,
		trackPickerCommand,
		noteTerminalKey,
		pruneClosedSessions,
		isActiveCliBusy
	};
};
