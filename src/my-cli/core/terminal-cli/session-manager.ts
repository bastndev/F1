import * as childProcess from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { cliAgents, getCliAgent } from '../../shared/agents';
import { ensureCliInstalled } from './installation';
import { playFinishSound } from '../voice/finish-sound';
import type {
	CliSessionSnapshot,
	CustomCliLaunch,
	InboundPtyHostEvent,
	InboundWebviewMessage,
	PtyHostCommand
} from '../../shared/protocol';

// Snapshot shape plus the host-only runtime state; the buffer is always
// materialized here (snapshots only omit it on the wire).
type CliSession = Omit<CliSessionSnapshot, 'buffer'> & {
	buffer: string;
	process?: childProcess.ChildProcess;
	cols: number;
	rows: number;
	started?: boolean;
	closing?: boolean;
	/** Set on submit; cleared when the response settles (drives Voice Finish). */
	awaitingResponse?: boolean;
	/** Quiet-period timer that decides the response is done. */
	responseSettleTimer?: ReturnType<typeof setTimeout>;
	/** One-shot: fires when the response after a host-sent prompt settles (Smart cleanup). */
	onResponseDone?: () => void;
	/** "CLI booted and is idle, ready for input" detection (Smart auto-prompt). */
	idleTimer?: ReturnType<typeof setTimeout>;
	idleResolve?: () => void;
};

type MyCliMessageResult = 'closed-last-session' | undefined;

const maxBufferLength = 240000;

// How long the CLI output must stay quiet after a submission before we call the
// response "finished". TUI CLIs stream spinner frames while thinking, so this
// only elapses once the agent has actually stopped writing.
const responseSettleMs = 1500;

// After the CLI's first output, how long it must stay quiet before we treat it as
// "booted and waiting for input" — the moment the Smart auto-prompt is typed in.
const bootIdleMs = 1200;

// Gap between typing the auto-prompt and sending the Enter that submits it. TUI
// CLIs (opencode, kilocode, copilot…) read a fast "text\r" burst as a single
// paste and fold the trailing Return into the input as a literal newline instead
// of submitting. Sending Enter as its own delayed keystroke makes it a real
// "submit" key. It's hidden behind the Smart overlay, so it costs no UX latency.
const submitEnterDelayMs = 250;

// opencode and its fork kilocode drop a whole-prompt burst on their bubbletea
// input — the box stays empty (placeholder still showing). For those agents we
// type the prompt one code point at a time (after a short lead-in) so each lands
// as a genuine keystroke their input always accepts. Hidden behind the overlay.
const incrementalTypeSlugs = new Set(['opencode', 'kilocode']);
const incrementalLeadInMs = 400;
const perCharTypeMs = 8;

// codex/copilot classify a large one-shot write as a paste and swallow the
// trailing \r as paste content instead of a submit key (short prompts like the
// Smart one submit fine — the trigger is size). Wrapping the text in the
// standard bracketed-paste markers gives them a definite paste end, so the
// separately-sent \r reads as a genuine Enter. Scoped to these two: other CLIs
// already submit correctly and may not enable bracketed paste.
const bracketedPasteSlugs = new Set(['codex', 'copilot']);
const bracketedPasteOpen = '\x1b[200~';
const bracketedPasteClose = '\x1b[201~';

const getWorkspaceCwd = () => {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
};

const getProcessEnv = () => {
	const env: Record<string, string> = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === 'string') {
			env[key] = value;
		}
	}

	env.TERM = 'xterm-256color';
	env.COLORTERM = env.COLORTERM || 'truecolor';

	return env;
};

const appendToBuffer = (session: CliSession, data: string) => {
	session.buffer += data;

	if (session.buffer.length > maxBufferLength) {
		session.buffer = session.buffer.slice(session.buffer.length - maxBufferLength);
	}
};

const buildCommandLine = (command: string, args: string[]) => {
	return [command, ...args].join(' ');
};

const getPtyHostPath = () => {
	return path.join(__dirname, 'my-cli', 'core', 'pty-host.js');
};

export type SessionBeforeCreateHook = (agentLabel: string) => void;

export class CliSessionManager implements vscode.Disposable {
	private readonly sessions = new Map<string, CliSession>();
	private webview?: vscode.Webview;
	private activeSessionId?: string;
	private nextSessionId = 1;
	private _beforeSessionCreate?: SessionBeforeCreateHook;

	// Voice Finish config, pushed from the webview (cli.voiceFinish). Off by
	// default; the language picks which WAV cue plays when a response settles.
	private voiceFinishEnabled = false;
	private voiceFinishLang = 'en';
	// True while the user is actually watching the CLI (panel visible + window
	// focused). The cue is meant to notify you when you're elsewhere, so it stays
	// silent in that case. Driven by the provider's visibility/focus listeners.
	private finishSoundSuppressed = false;

	/**
	 * Sessions whose full buffer the *current* webview already received —
	 * either in its first cli.state or built up through cli.output. Snapshots
	 * for these omit the buffer. Reset on attach: a fresh webview needs the
	 * scrollback once to restore its terminals.
	 */
	private readonly sessionsKnownToWebview = new Set<string>();

	public attach(webview: vscode.Webview) {
		this.webview = webview;
		this.sessionsKnownToWebview.clear();
	}

	public onBeforeSessionCreate(hook: SessionBeforeCreateHook) {
		this._beforeSessionCreate = hook;
	}

	public detach() {
		this.webview = undefined;
		this.sessionsKnownToWebview.clear();
	}

	/**
	 * Tell the manager whether the user is currently watching the CLI (F1 panel
	 * visible AND window focused). When true, a finishing response stays silent —
	 * the Voice Finish cue is only useful when attention is elsewhere.
	 */
	public setFinishSoundSuppressed(suppressed: boolean) {
		this.finishSoundSuppressed = suppressed;
	}

	public async createSession(agentLabel: string, options: { smart?: boolean; rules?: boolean } = {}): Promise<string | undefined> {
		const agent = getCliAgent(agentLabel);
		if (!agent) {
			this.postError(`Unknown CLI: ${agentLabel}`);
			return undefined;
		}

		if (!(await ensureCliInstalled(agent))) {
			return undefined;
		}

		this._beforeSessionCreate?.(agentLabel);
		return this.createSessionFromCommand(agent.label, agent.command, agent.args, options.smart, options.rules);
	}

	public createCustomSession(customCli: CustomCliLaunch) {
		this.createSessionFromCommand(customCli.label, customCli.command, customCli.args);
	}

	private createSessionFromCommand(label: string, command: string, args: string[], smart?: boolean, rules?: boolean): string {
		const id = `cli-${this.nextSessionId++}`;
		const cwd = getWorkspaceCwd();
		const session: CliSession = {
			id,
			label,
			commandLine: buildCommandLine(command, args),
			cwd,
			status: 'running',
			createdAt: Date.now(),
			buffer: '',
			hasUnread: false,
			awaitingFirstOutput: true,
			smart: smart === true,
			rules: rules === true,
			cols: 80,
			rows: 24
		};

		this.sessions.set(id, session);
		this.activeSessionId = id;
		appendToBuffer(session, `\x1b[90mCLI Hub: starting ${session.commandLine}\x1b[0m\r\n`);
		this.postState();

		try {
			this.startPtyHost(session, command, args);
		} catch (error) {
			session.status = 'error';
			const message = error instanceof Error ? error.message : String(error);
			const output = `\x1b[31mCould not start ${session.commandLine}: ${message}\x1b[0m\r\n`;
			appendToBuffer(session, output);
			this.postMessage({ type: 'cli.output', sessionId: session.id, data: output });
			this.postState();
		}

		return id;
	}

	public hasRunningSessionForAgent(agentLabel: string) {
		const expectedLabel = getCliAgent(agentLabel)?.label || agentLabel;
		for (const session of this.sessions.values()) {
			if (session.label === expectedLabel && session.status === 'running' && !session.closing) {
				return true;
			}
		}

		return false;
	}

	private startPtyHost(session: CliSession, command: string, args: string[]) {
		const host = childProcess.spawn(process.env.CLIHUB_NODE_PATH || 'node', [getPtyHostPath()], {
			cwd: session.cwd,
			env: getProcessEnv(),
			stdio: ['ignore', 'pipe', 'pipe', 'ipc']
		});

		session.process = host;
		host.stdout?.on('data', (chunk) => {
			this.appendSessionOutput(session, chunk.toString());
		});
		host.stderr?.on('data', (chunk) => {
			this.appendSessionOutput(session, chunk.toString());
		});
		host.on('message', (message: InboundPtyHostEvent) => {
			this.handleInboundPtyHostEvent(session, message);
		});
		host.on('error', (error) => {
			this.markSessionError(session, `Could not start PTY host: ${error.message}`);
		});
		host.on('exit', (code, signal) => {
			if (!this.sessions.has(session.id) || session.closing) {
				return;
			}

			if (session.status === 'running') {
				this.markSessionError(session, `PTY host exited before the CLI could run (${signal || (code ?? 'unknown')}).`);
			}
		});

		this.sendPtyHostCommand(session, {
			type: 'start',
			command,
			args,
			cwd: session.cwd,
			cols: session.cols,
			rows: session.rows,
			env: getProcessEnv()
		});
	}

	private handleInboundPtyHostEvent(session: CliSession, message: InboundPtyHostEvent) {
		if (!this.sessions.has(session.id)) {
			return;
		}

		if (message.type === 'ready') {
			session.started = true;
			return;
		}

		if (message.type === 'output' && typeof message.data === 'string') {
			this.appendSessionOutput(session, message.data);
			return;
		}

		if (message.type === 'exit') {
			const exitCode = message.exitCode ?? 0;
			session.status = 'exited';
			session.exitCode = exitCode;
			session.idleResolve?.();
			session.idleResolve = undefined;
			this.appendSessionOutput(session, `\r\n\x1b[90mCLI Hub: ${session.label} exited with code ${exitCode}\x1b[0m\r\n`);
			this.postState();
			return;
		}

		if (message.type === 'error') {
			this.markSessionError(session, message.message || 'Unknown PTY host error.');
		}
	}

	private appendSessionOutput(session: CliSession, data: string) {
		appendToBuffer(session, data);

		// First real output (stdout/stderr/IPC) means the CLI has started rendering —
		// the boot skeleton's job is done. This is the single funnel for pty output;
		// the "starting …" preamble goes through appendToBuffer directly, so it never
		// trips this. cli.output dismisses the live skeleton; the flag keeps it from
		// reappearing after the webview is rebuilt on a panel switch.
		session.awaitingFirstOutput = false;
		this.armIdle(session);

		if (this.activeSessionId !== session.id) {
			session.hasUnread = true;
		}

		this.postMessage({ type: 'cli.output', sessionId: session.id, data });
		this.scheduleResponseSettle(session);
	}

	// While a response is in flight, restart a quiet-period timer on every output
	// chunk. When the CLI stops writing for responseSettleMs the response is done
	// — play the Voice Finish cue once (if enabled) and disarm. No-op until a
	// submission arms the session, so boot output and idle redraws never fire.
	private scheduleResponseSettle(session: CliSession) {
		if (!session.awaitingResponse) {
			return;
		}

		if (session.responseSettleTimer) {
			clearTimeout(session.responseSettleTimer);
		}

		session.responseSettleTimer = setTimeout(() => {
			session.responseSettleTimer = undefined;
			session.awaitingResponse = false;
			if (
				this.voiceFinishEnabled
				&& !this.finishSoundSuppressed
				&& session.status === 'running'
				&& !session.closing
			) {
				playFinishSound(this.voiceFinishLang);
			}

			const onDone = session.onResponseDone;
			session.onResponseDone = undefined;
			onDone?.();
		}, responseSettleMs);
	}

	private armIdle(session: CliSession) {
		if (!session.idleResolve) {
			return;
		}
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
		}
		session.idleTimer = setTimeout(() => {
			session.idleTimer = undefined;
			const resolve = session.idleResolve;
			session.idleResolve = undefined;
			resolve?.();
		}, bootIdleMs);
	}

	/**
	 * Resolve once the CLI has produced output and then gone quiet — i.e. it has
	 * booted and is waiting for input. Times the Smart auto-prompt. A hard fallback
	 * means it can never hang the launch.
	 */
	public waitForFirstIdle(sessionId: string): Promise<void> {
		return new Promise((resolve) => {
			const session = this.sessions.get(sessionId);
			if (!session || session.status !== 'running') {
				resolve();
				return;
			}
			let settled = false;
			const done = () => {
				if (!settled) {
					settled = true;
					resolve();
				}
			};
			session.idleResolve = done;
			if (!session.awaitingFirstOutput) {
				this.armIdle(session);
			}
			setTimeout(done, 20000);
		});
	}

	/** Type text into the CLI (as if submitted) and arm the response detector. */
	public sendText(sessionId: string, text: string) {
		const session = this.sessions.get(sessionId);
		if (!session || session.status !== 'running') {
			return;
		}
		session.awaitingResponse = true;

		// Bubbletea CLIs (opencode/kilocode) ignore a whole-prompt burst, so type
		// it out as real keystrokes. Everyone else takes the single write fine.
		const slug = getCliAgent(session.label)?.slug;
		if (slug && incrementalTypeSlugs.has(slug)) {
			this.typePromptIncrementally(sessionId, Array.from(text), 0);
			return;
		}

		// codex/copilot need the text explicitly bracketed as paste so the later
		// \r isn't eaten as paste content (see bracketedPasteSlugs).
		const payload = slug && bracketedPasteSlugs.has(slug)
			? bracketedPasteOpen + text + bracketedPasteClose
			: text;
		this.sendPtyHostCommand(session, { type: 'input', data: payload });
		this.submitPromptAfterDelay(sessionId);
	}

	// Send the prompt one code point at a time (Array.from keeps "—"/"✅" intact),
	// then submit. Each keystroke is its own pty write, so it's never mistaken for
	// a paste and the input box actually fills.
	private typePromptIncrementally(sessionId: string, chars: string[], index: number) {
		if (index >= chars.length) {
			this.submitPromptAfterDelay(sessionId);
			return;
		}
		setTimeout(() => {
			const session = this.sessions.get(sessionId);
			if (!session || session.status !== 'running' || session.closing) {
				return;
			}
			this.sendPtyHostCommand(session, { type: 'input', data: chars[index] });
			this.typePromptIncrementally(sessionId, chars, index + 1);
		}, index === 0 ? incrementalLeadInMs : perCharTypeMs);
	}

	// Send the Enter that submits a host-typed prompt, on a separate delayed write
	// so TUI CLIs read it as a real submit key instead of folding it into the text.
	private submitPromptAfterDelay(sessionId: string) {
		setTimeout(() => {
			const session = this.sessions.get(sessionId);
			if (!session || session.status !== 'running' || session.closing) {
				return;
			}
			this.sendPtyHostCommand(session, { type: 'input', data: '\r' });
		}, submitEnterDelayMs);
	}

	/** Run `callback` once, when the response after the next host-sent prompt settles. */
	public onceResponseSettled(sessionId: string, callback: () => void) {
		const session = this.sessions.get(sessionId);
		if (!session) {
			callback();
			return;
		}
		session.onResponseDone = callback;
	}

	/** True if the session exists and its pty is still running. */
	public isRunning(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		return !!session && session.status === 'running';
	}

	/** True if the session's output buffer contains `needle` (e.g. the Smart ready message). */
	public bufferContains(sessionId: string, needle: string): boolean {
		const session = this.sessions.get(sessionId);
		return !!session && session.buffer.includes(needle);
	}

	private markSessionError(session: CliSession, message: string) {
		if (!this.sessions.has(session.id)) {
			return;
		}

		session.status = 'error';
		session.idleResolve?.();
		session.idleResolve = undefined;
		this.appendSessionOutput(session, `\r\n\x1b[31m${message}\x1b[0m\r\n`);
		this.postState();
	}

	public handleMessage(message: InboundWebviewMessage): MyCliMessageResult {
		switch (message.type) {
			case 'cli.create':
				if (message.agent) {
					void this.createSession(message.agent);
				}
				break;
			case 'cli.input':
				if (message.sessionId && typeof message.data === 'string') {
					this.writeInput(message.sessionId, message.data);
				}
				break;
			case 'cli.switch':
				if (message.sessionId) {
					this.switchSession(message.sessionId);
				}
				break;
			case 'cli.resize':
				this.resizeSession(message.sessionId, message.cols, message.rows);
				break;
			case 'cli.close':
				if (message.sessionId) {
					return this.closeSession(message.sessionId);
				}
				break;
			case 'cli.ready':
				this.postState();
				break;
			case 'cli.voiceFinish':
				this.voiceFinishEnabled = message.enabled === true;
				if (typeof message.lang === 'string' && message.lang) {
					this.voiceFinishLang = message.lang;
				}
				break;
		}

		return undefined;
	}

	public postState() {
		const sessions = [...this.sessions.values()].map((session) => {
			const includeBuffer = !this.sessionsKnownToWebview.has(session.id);
			if (this.webview) {
				this.sessionsKnownToWebview.add(session.id);
			}
			return this.toSnapshot(session, includeBuffer);
		});

		for (const knownId of this.sessionsKnownToWebview) {
			if (!this.sessions.has(knownId)) {
				this.sessionsKnownToWebview.delete(knownId);
			}
		}

		this.postMessage({
			type: 'cli.state',
			activeSessionId: this.activeSessionId,
			agents: cliAgents.map((agent) => ({ label: agent.label })),
			sessions
		});
	}

	public dispose() {
		for (const session of this.sessions.values()) {
			this.disposeSession(session);
		}

		this.sessions.clear();
	}

	private writeInput(sessionId: string, data: string) {
		const session = this.sessions.get(sessionId);
		if (!session || session.status !== 'running') {
			return;
		}

		// A carriage return means the user submitted something — arm the finish
		// detector so the next quiet period counts as "response done". Plain
		// keystrokes (no Enter) don't arm it, so idle redraws never ding.
		if (data.includes('\r') || data.includes('\n')) {
			session.awaitingResponse = true;
		}

		this.sendPtyHostCommand(session, { type: 'input', data });
	}

	private sendPtyHostCommand(session: CliSession, command: PtyHostCommand) {
		session.process?.send?.(command);
	}

	private switchSession(sessionId: string) {
		if (!this.sessions.has(sessionId)) {
			return;
		}

		const session = this.sessions.get(sessionId);
		if (session) {
			session.hasUnread = false;
		}

		this.activeSessionId = sessionId;
		this.postState();
	}

	private resizeSession(sessionId: string | undefined, cols: number | undefined, rows: number | undefined) {
		if (typeof cols !== 'number' || typeof rows !== 'number' || !Number.isFinite(cols) || !Number.isFinite(rows)) {
			return;
		}

		const session = this.sessions.get(sessionId || this.activeSessionId || '');
		if (!session) {
			return;
		}

		session.cols = Math.max(2, Math.floor(cols));
		session.rows = Math.max(1, Math.floor(rows));
		this.sendPtyHostCommand(session, { type: 'resize', cols: session.cols, rows: session.rows });
	}

	private closeSession(sessionId: string): MyCliMessageResult {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return undefined;
		}

		this.disposeSession(session);
		this.sessions.delete(sessionId);

		if (this.activeSessionId === sessionId) {
			this.activeSessionId = this.sessions.keys().next().value;
		}

		if (this.sessions.size === 0) {
			this.activeSessionId = undefined;
			return 'closed-last-session';
		}

		this.postState();
		return undefined;
	}

	private disposeSession(session: CliSession) {
		session.closing = true;

		if (session.responseSettleTimer) {
			clearTimeout(session.responseSettleTimer);
			session.responseSettleTimer = undefined;
		}
		session.awaitingResponse = false;
		if (session.idleTimer) {
			clearTimeout(session.idleTimer);
			session.idleTimer = undefined;
		}
		session.idleResolve?.();
		session.idleResolve = undefined;
		session.onResponseDone = undefined;

		try {
			this.sendPtyHostCommand(session, { type: 'kill' });
			session.process?.kill();
		} catch {
			// The process may already be gone.
		}
	}

	private postError(message: string) {
		this.postMessage({ type: 'cli.error', message });
	}

	private postMessage(message: unknown) {
		this.webview?.postMessage(message);
	}

	private toSnapshot(session: CliSession, includeBuffer: boolean): CliSessionSnapshot {
		return {
			id: session.id,
			label: session.label,
			commandLine: session.commandLine,
			cwd: session.cwd,
			status: session.status,
			createdAt: session.createdAt,
			...(includeBuffer ? { buffer: session.buffer } : {}),
			hasUnread: session.hasUnread,
			awaitingFirstOutput: session.awaitingFirstOutput,
			smart: session.smart,
			rules: session.rules,
			exitCode: session.exitCode
		};
	}
}
