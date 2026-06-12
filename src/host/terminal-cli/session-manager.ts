import * as childProcess from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { cliAgents, getCliAgent } from '../../shared/agents';
import { ensureCliInstalled } from './installation';
import type {
	CliSessionSnapshot,
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
};

type CliHubMessageResult = 'closed-last-session' | undefined;

const maxBufferLength = 240000;

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
	return path.join(__dirname, 'host', 'pty-host.js');
};

export class CliSessionManager implements vscode.Disposable {
	private readonly sessions = new Map<string, CliSession>();
	private webview?: vscode.Webview;
	private activeSessionId?: string;
	private nextSessionId = 1;

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

	public detach() {
		this.webview = undefined;
		this.sessionsKnownToWebview.clear();
	}

	public async createSession(agentLabel: string) {
		const agent = getCliAgent(agentLabel);
		if (!agent) {
			this.postError(`Unknown CLI: ${agentLabel}`);
			return;
		}

		if (!(await ensureCliInstalled(agent))) {
			return;
		}

		const id = `cli-${this.nextSessionId++}`;
		const cwd = getWorkspaceCwd();
		const session: CliSession = {
			id,
			label: agent.label,
			commandLine: buildCommandLine(agent.command, agent.args),
			cwd,
			status: 'running',
			createdAt: Date.now(),
			buffer: '',
			hasUnread: false,
			cols: 80,
			rows: 24
		};

		this.sessions.set(id, session);
		this.activeSessionId = id;
		appendToBuffer(session, `\x1b[90mCLI Hub: starting ${session.commandLine}\x1b[0m\r\n`);
		this.postState();

		try {
			this.startPtyHost(session, agent.command, agent.args);
		} catch (error) {
			session.status = 'error';
			const message = error instanceof Error ? error.message : String(error);
			const output = `\x1b[31mCould not start ${session.commandLine}: ${message}\x1b[0m\r\n`;
			appendToBuffer(session, output);
			this.postMessage({ type: 'cli.output', sessionId: session.id, data: output });
			this.postState();
		}
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

		if (this.activeSessionId !== session.id) {
			session.hasUnread = true;
		}

		this.postMessage({ type: 'cli.output', sessionId: session.id, data });
	}

	private markSessionError(session: CliSession, message: string) {
		if (!this.sessions.has(session.id)) {
			return;
		}

		session.status = 'error';
		this.appendSessionOutput(session, `\r\n\x1b[31m${message}\x1b[0m\r\n`);
		this.postState();
	}

	public handleMessage(message: InboundWebviewMessage): CliHubMessageResult {
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

	private closeSession(sessionId: string): CliHubMessageResult {
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
			exitCode: session.exitCode
		};
	}
}
