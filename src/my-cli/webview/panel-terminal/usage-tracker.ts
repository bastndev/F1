/**
 * CLI usage/quota tracker for the terminal panel. Owns the per-session usage
 * snapshots and the in-flight request (inject the agent's /usage command, capture
 * its output, settle, resolve). Idle-only CLIs are skipped mid-task; codex splits
 * submit into two writes. Extracted from terminal.ts as a createUsageTracker(deps)
 * factory (mirrors createToolsController); reaches terminal state only via deps.
 */
import type { Terminal } from '@xterm/xterm';
import type { WebviewToHostMessage } from '../../shared/protocol';
import { getAgentSlug as resolveAgentSlug } from '../../shared/agents';
import type { CliUsageSnapshot } from '../tools/tools';
import { USAGE_BUSY_ERROR, isUsageAgentBusy, isUsageViewInline } from '../tools/modal-use/agents';

export interface UsageTrackerDeps {
	post(message: WebviewToHostMessage): void;
	getActiveSessionId(): string | undefined;
	getSession(sessionId: string): { id: string; label: string; status: string } | undefined;
	getView(sessionId: string): { terminal: Terminal } | undefined;
	trimSessionBuffer(buffer: string): string;
}

export interface UsageTracker {
	getSnapshot(sessionId: string | undefined): CliUsageSnapshot | undefined;
	request(): Promise<CliUsageSnapshot>;
	dismiss(): void;
	noteOutput(sessionId: string, data: string): void;
	pruneClosedSessions(openSessionIds: Set<string>): void;
}

const getAgentSlug = (label: string): string => resolveAgentSlug(label) ?? 'default';

// The current visible terminal screen as plain text (no ANSI). Used to detect
// whether a CLI is mid-task before injecting a command — the live viewport
// reflects the present state, unlike the append-only session buffer.
export const readTerminalScreenText = (view: { terminal: Terminal } | undefined): string => {
	const terminal = view?.terminal;
	const buffer = terminal?.buffer.active;
	if (!terminal || !buffer) {
		return '';
	}

	const lines: string[] = [];
	const end = buffer.baseY + terminal.rows;
	for (let row = buffer.baseY; row < end; row += 1) {
		const line = buffer.getLine(row);
		if (line) {
			lines.push(line.translateToString(true));
		}
	}
	return lines.join('\n');
};

export function createUsageTracker(deps: UsageTrackerDeps): UsageTracker {
	const usageRequestSettleDelayMs = 900;
	const usageRequestTimeoutMs = 7000;
	const usageDismissSecondEscapeDelayMs = 80;
	const codexUsageSubmitDelayMs = 150;
	const usageCommandsByAgentSlug: Record<string, string> = {
		antigravity: '/usage',
		claude: '/usage',
		codex: '/status',
		kiro: '/usage'
	};

	const usageSnapshots = new Map<string, CliUsageSnapshot>();
	let pendingUsageRequest: {
		sessionId: string;
		agentLabel: string;
		command: string;
		captured: string;
		resolve: (snapshot: CliUsageSnapshot) => void;
		reject: (reason?: unknown) => void;
		settleTimer?: number;
		timeoutTimer?: number;
	} | undefined;

	const getUsageCommandForAgent = (agentLabel: string) => {
		const slug = resolveAgentSlug(agentLabel) ?? 'default';
		return usageCommandsByAgentSlug[slug];
	};

	const getUsageInputData = (view: { terminal: Terminal } | undefined, data: string) => (
		view?.terminal.modes.sendFocusMode ? `\x1b[I${data}` : data
	);

	const clearPendingUsageRequest = () => {
		if (!pendingUsageRequest) {
			return;
		}

		window.clearTimeout(pendingUsageRequest.settleTimer);
		window.clearTimeout(pendingUsageRequest.timeoutTimer);
		pendingUsageRequest = undefined;
	};

	const resolvePendingUsageRequest = () => {
		const request = pendingUsageRequest;
		if (!request) {
			return;
		}

		const snapshot: CliUsageSnapshot = {
			sessionId: request.sessionId,
			agentLabel: request.agentLabel,
			command: request.command,
			raw: request.captured,
			requestedAt: Date.now()
		};

		usageSnapshots.set(request.sessionId, snapshot);
		clearPendingUsageRequest();
		request.resolve(snapshot);
	};

	// Capture the usage command's output straight into the pending request as it
	// streams in, then (re)arm the settle timer so we resolve 900ms after the last
	// chunk. Capturing here — instead of slicing session.buffer by an absolute
	// offset on resolve — keeps usage detection correct in long sessions, where the
	// append-only buffer is trimmed from the front and a start offset recorded
	// before the command no longer lines up (it would slice off an empty tail).
	const notePendingUsageOutput = (sessionId: string, data: string) => {
		if (!pendingUsageRequest || pendingUsageRequest.sessionId !== sessionId) {
			return;
		}

		pendingUsageRequest.captured = deps.trimSessionBuffer(pendingUsageRequest.captured + data);
		window.clearTimeout(pendingUsageRequest.settleTimer);
		pendingUsageRequest.settleTimer = window.setTimeout(resolvePendingUsageRequest, usageRequestSettleDelayMs);
	};

	const requestActiveUsage = () => new Promise<CliUsageSnapshot>((resolve, reject) => {
		const activeSessionId = deps.getActiveSessionId();
		if (!activeSessionId) {
			reject(new Error('No active CLI session.'));
			return;
		}

		const session = deps.getSession(activeSessionId);
		if (!session || session.status !== 'running') {
			reject(new Error('The active CLI session is not running.'));
			return;
		}

		const command = getUsageCommandForAgent(session.label);
		if (!command) {
			reject(new Error(`Usage command is not configured for ${session.label}.`));
			return;
		}

		const view = deps.getView(session.id);

		// Idle-only CLIs (e.g. Kiro) corrupt their input if the usage command is
		// injected mid-task. Bail before sending anything; the modal renders an
		// in-progress card instead. Nothing is typed into the session.
		if (isUsageAgentBusy(session.label, readTerminalScreenText(view))) {
			reject(new Error(USAGE_BUSY_ERROR));
			return;
		}

		if (pendingUsageRequest) {
			pendingUsageRequest.reject(new Error('Usage refresh was superseded.'));
			clearPendingUsageRequest();
		}

		const agentSlug = getAgentSlug(session.label);
		pendingUsageRequest = {
			sessionId: session.id,
			agentLabel: session.label,
			command,
			captured: '',
			resolve,
			reject,
			timeoutTimer: window.setTimeout(resolvePendingUsageRequest, usageRequestTimeoutMs)
		};

		if (agentSlug === 'codex') {
			deps.post({
				type: 'cli.input',
				sessionId: session.id,
				data: getUsageInputData(view, `\x15${command}`)
			});
			window.setTimeout(() => {
				if (deps.getSession(session.id)?.status === 'running') {
					deps.post({
						type: 'cli.input',
						sessionId: session.id,
						data: getUsageInputData(view, '\r')
					});
				}
			}, codexUsageSubmitDelayMs);
			return;
		}

		deps.post({
			type: 'cli.input',
			sessionId: session.id,
			data: getUsageInputData(view, `\x15${command}\r`)
		});
	});

	const dismissActiveUsageView = () => {
		const activeSessionId = deps.getActiveSessionId();
		if (!activeSessionId) {
			return;
		}

		const sessionId = activeSessionId;
		const session = deps.getSession(sessionId);
		if (session?.status !== 'running') {
			return;
		}

		// Codex renders /status as inline transcript text — there's no overlay to
		// close. Sending Esc would instead open Codex's backtrack/edit-previous
		// pager whenever prior conversation exists, trapping the user. Skip dismiss.
		if (isUsageViewInline(session.label)) {
			return;
		}

		const view = deps.getView(sessionId);
		const data = view?.terminal.modes.sendFocusMode ? '\x1b[I\x1b' : '\x1b';
		const postEscape = () => {
			if (deps.getSession(sessionId)?.status === 'running') {
				deps.post({ type: 'cli.input', sessionId, data });
			}
		};

		postEscape();
		window.setTimeout(postEscape, usageDismissSecondEscapeDelayMs);
	};

	const pruneClosedSessions = (openSessionIds: Set<string>) => {
		for (const sessionId of [...usageSnapshots.keys()]) {
			if (!openSessionIds.has(sessionId)) {
				usageSnapshots.delete(sessionId);
			}
		}
		if (pendingUsageRequest && !openSessionIds.has(pendingUsageRequest.sessionId)) {
			pendingUsageRequest.reject(new Error('Usage refresh session was closed.'));
			clearPendingUsageRequest();
		}
	};

	return {
		getSnapshot: sessionId => (sessionId ? usageSnapshots.get(sessionId) : undefined),
		request: requestActiveUsage,
		dismiss: dismissActiveUsageView,
		noteOutput: notePendingUsageOutput,
		pruneClosedSessions
	};
}
