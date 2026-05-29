import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, type CliAgentIcon, type CliAgentOption, type CliSessionSummary } from '../panel-tab/tab';

type VsCodeApi = {
	postMessage: (message: ClientMessage) => void;
};

type ClientMessage =
	| { type: 'cli.ready' }
	| { type: 'cli.create'; agent: string }
	| { type: 'cli.input'; sessionId: string; data: string }
	| { type: 'cli.switch'; sessionId: string }
	| { type: 'cli.resize'; sessionId?: string; cols: number; rows: number }
	| { type: 'cli.close'; sessionId: string };

type CliSession = CliSessionSummary & {
	commandLine: string;
	buffer: string;
	createdAt: number;
};

type ServerMessage =
	| {
		type: 'cli.state';
		activeSessionId?: string;
		agents: CliAgentOption[];
		sessions: CliSession[];
	}
	| { type: 'cli.output'; sessionId: string; data: string }
	| { type: 'cli.error'; message: string };

type TerminalView = {
	terminal: Terminal;
	fitAddon: FitAddon;
	pane: HTMLDivElement;
};

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const sessions = new Map<string, CliSession>();
const terminals = new Map<string, TerminalView>();
let activeSessionId: string | undefined;
let pendingTabSwitchSessionId: string | undefined;

const isAgentIcon = (value: unknown): value is CliAgentIcon => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const icon = value as Record<string, unknown>;
	return typeof icon.label === 'string'
		&& typeof icon.icon === 'string'
		&& typeof icon.darkIcon === 'boolean'
		&& typeof icon.lightIcon === 'boolean';
};

const parseAgentIcons = () => {
	const script = document.getElementById('cli-agent-icons');
	if (!script?.textContent) {
		return new Map<string, CliAgentIcon>();
	}

	try {
		const icons = JSON.parse(script.textContent) as unknown;
		if (!Array.isArray(icons)) {
			return new Map<string, CliAgentIcon>();
		}

		return new Map(icons.filter(isAgentIcon).map((icon) => [icon.label, icon]));
	} catch {
		return new Map<string, CliAgentIcon>();
	}
};

const agentIcons = parseAgentIcons();
const layoutRight = document.querySelector<HTMLElement>('.layout-right');
const terminalStack = document.getElementById('cli-terminal-stack') as HTMLDivElement;
const terminalLabel = document.getElementById('cli-terminal-label') as HTMLDivElement;
const terminalStatus = document.getElementById('cli-terminal-status') as HTMLDivElement;
const terminalBadge = document.getElementById('cli-terminal-badge') as HTMLDivElement;

const cssValue = (name: string, fallback: string) => {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
};

const getTerminalTheme = () => {
	return {
		background: cssValue('--vscode-terminal-background', cssValue('--vscode-editor-background', '#1e1e1e')),
		foreground: cssValue('--vscode-terminal-foreground', cssValue('--vscode-editor-foreground', '#cccccc')),
		cursor: cssValue('--vscode-terminalCursor-foreground', cssValue('--vscode-editor-foreground', '#cccccc')),
		selectionBackground: cssValue('--vscode-terminal-selectionBackground', 'rgba(128, 128, 128, 0.35)'),
		black: cssValue('--vscode-terminal-ansiBlack', '#000000'),
		red: cssValue('--vscode-terminal-ansiRed', '#cd3131'),
		green: cssValue('--vscode-terminal-ansiGreen', '#0dbc79'),
		yellow: cssValue('--vscode-terminal-ansiYellow', '#e5e510'),
		blue: cssValue('--vscode-terminal-ansiBlue', '#2472c8'),
		magenta: cssValue('--vscode-terminal-ansiMagenta', '#bc3fbc'),
		cyan: cssValue('--vscode-terminal-ansiCyan', '#11a8cd'),
		white: cssValue('--vscode-terminal-ansiWhite', '#e5e5e5')
	};
};

const getFontFamily = () => {
	return cssValue('--vscode-editor-font-family', cssValue('--vscode-font-family', 'monospace'));
};

const fitTerminal = (sessionId: string | undefined = activeSessionId) => {
	if (!sessionId) {
		return;
	}

	const view = terminals.get(sessionId);
	if (!view) {
		return;
	}

	try {
		view.fitAddon.fit();
		vscode.postMessage({
			type: 'cli.resize',
			sessionId,
			cols: view.terminal.cols,
			rows: view.terminal.rows
		});
	} catch {
		// xterm can throw while the pane is hidden or still measuring.
	}
};

const switchSessionByOffset = (offset: 1 | -1) => {
	if (pendingTabSwitchSessionId) {
		return false;
	}

	const sessionIds = [...sessions.keys()];
	if (sessionIds.length === 0) {
		return false;
	}

	const activeIndex = activeSessionId ? sessionIds.indexOf(activeSessionId) : -1;
	const currentIndex = activeIndex >= 0 ? activeIndex : 0;
	const nextIndex = (currentIndex + offset + sessionIds.length) % sessionIds.length;
	const nextSessionId = sessionIds[nextIndex];
	if (!nextSessionId || nextSessionId === activeSessionId) {
		return false;
	}

	pendingTabSwitchSessionId = nextSessionId;
	vscode.postMessage({ type: 'cli.switch', sessionId: nextSessionId });
	return true;
};

const handleTerminalKey = (event: KeyboardEvent) => {
	if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
		return true;
	}

	event.preventDefault();
	event.stopPropagation();

	if (event.type === 'keydown' && !event.repeat) {
		switchSessionByOffset(event.shiftKey ? -1 : 1);
	}

	return false;
};

const tabController = createTabController({
	getAgentIcon: (label) => agentIcons.get(label),
	onCreate: (agent) => vscode.postMessage({ type: 'cli.create', agent }),
	onCycleSession: (offset) => {
		switchSessionByOffset(offset);
	},
	onSwitch: (sessionId) => vscode.postMessage({ type: 'cli.switch', sessionId }),
	onClose: (sessionId) => vscode.postMessage({ type: 'cli.close', sessionId })
});

const createTerminalView = (session: CliSession) => {
	const pane = document.createElement('div');
	pane.className = 'cli-terminal-pane';
	pane.dataset.sessionId = session.id;
	terminalStack.append(pane);

	const terminal = new Terminal({
		allowProposedApi: false,
		convertEol: true,
		cursorBlink: true,
		fontFamily: getFontFamily(),
		fontSize: 12,
		scrollback: 8000,
		theme: getTerminalTheme()
	});
	terminal.attachCustomKeyEventHandler(handleTerminalKey);
	const fitAddon = new FitAddon();
	terminal.loadAddon(fitAddon);
	terminal.open(pane);
	terminal.write(session.buffer);
	terminal.onData((data) => {
		const currentSession = sessions.get(session.id);
		if (currentSession?.status === 'running') {
			vscode.postMessage({ type: 'cli.input', sessionId: session.id, data });
		}
	});

	const view = { terminal, fitAddon, pane };
	terminals.set(session.id, view);
	requestAnimationFrame(() => fitTerminal(session.id));

	return view;
};

const removeClosedTerminals = (openSessionIds: Set<string>) => {
	for (const [sessionId, view] of terminals) {
		if (!openSessionIds.has(sessionId)) {
			view.terminal.dispose();
			view.pane.remove();
			terminals.delete(sessionId);
		}
	}
};

const setActiveTerminal = () => {
	layoutRight?.classList.toggle('has-empty-state', !activeSessionId);

	for (const [sessionId, view] of terminals) {
		view.pane.classList.toggle('is-active', sessionId === activeSessionId);
	}

	const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (!activeSession) {
		terminalLabel.textContent = 'CLI';
		terminalStatus.textContent = 'No active session';
		terminalBadge.textContent = 'CLI';
		return;
	}

	terminalLabel.textContent = activeSession.label;
	terminalStatus.textContent = `${activeSession.status} - ${activeSession.cwd}`;
	terminalBadge.textContent = activeSession.commandLine;

	requestAnimationFrame(() => {
		fitTerminal(activeSession.id);
		terminals.get(activeSession.id)?.terminal.focus();
	});
};

const syncState = (message: Extract<ServerMessage, { type: 'cli.state' }>) => {
	activeSessionId = message.activeSessionId;
	tabController.setAgents(message.agents);
	sessions.clear();

	const openSessionIds = new Set<string>();
	for (const session of message.sessions) {
		sessions.set(session.id, session);
		openSessionIds.add(session.id);

		if (!terminals.has(session.id)) {
			createTerminalView(session);
		}
	}

	if (pendingTabSwitchSessionId && (!sessions.has(pendingTabSwitchSessionId) || pendingTabSwitchSessionId === activeSessionId)) {
		pendingTabSwitchSessionId = undefined;
	}

	removeClosedTerminals(openSessionIds);
	tabController.render(message.sessions, activeSessionId);
	setActiveTerminal();
};

const handleOutput = (message: Extract<ServerMessage, { type: 'cli.output' }>) => {
	const session = sessions.get(message.sessionId);
	if (session) {
		session.buffer += message.data;
	}

	if (!terminals.has(message.sessionId) && session) {
		createTerminalView(session);
	}

	terminals.get(message.sessionId)?.terminal.write(message.data);
};

window.addEventListener('message', (event: MessageEvent<ServerMessage>) => {
	const message = event.data;

	if (message.type === 'cli.state') {
		syncState(message);
		return;
	}

	if (message.type === 'cli.output') {
		handleOutput(message);
		return;
	}

	if (message.type === 'cli.error') {
		terminalStatus.textContent = message.message;
	}
});

const resizeObserver = new ResizeObserver(() => {
	fitTerminal();
});
resizeObserver.observe(terminalStack);

vscode.postMessage({ type: 'cli.ready' });
