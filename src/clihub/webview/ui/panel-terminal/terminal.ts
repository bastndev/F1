import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, type CliAgentIcon, type CliAgentOption, type CliSessionSummary } from '../panel-tab/tab';
import { createToolsController } from './tools-cli/tools';

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
const bootSkeletons = new Map<string, HTMLDivElement>();
const sessionsWithFirstOutput = new Set<string>();
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

const toolsController = layoutRight ? createToolsController({ container: layoutRight }) : undefined;

const tabController = createTabController({
	getAgentIcon: (label) => agentIcons.get(label),
	onCreate: (agent) => vscode.postMessage({ type: 'cli.create', agent }),
	onCycleSession: (offset) => {
		switchSessionByOffset(offset);
	},
	onSwitch: (sessionId) => vscode.postMessage({ type: 'cli.switch', sessionId }),
	onClose: (sessionId) => vscode.postMessage({ type: 'cli.close', sessionId }),
	onDismissToolModal: () => {
		toolsController?.close();
	},
	onOpenTool: (tool) => {
		toolsController?.toggle(tool);
	}
});

const handleTerminalKey = (event: KeyboardEvent) => {
	if (tabController.handleKeyboardShortcut(event)) {
		return false;
	}

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

const getAgentSlug = (label: string): string => {
	const lower = label.toLowerCase();
	if (lower.includes('grok')) {
		return 'grok';
	}
	if (lower.includes('claude')) {
		return 'claude';
	}
	if (lower.includes('codex')) {
		return 'codex';
	}
	if (lower.includes('opencode') || lower === 'open code') {
		return 'opencode';
	}
	if (lower.includes('antigravity')) {
		return 'antigravity';
	}
	if (lower.includes('copilot')) {
		return 'copilot';
	}
	if (lower.includes('kilo')) {
		return 'kilocode';
	}
	if (lower.includes('kiro')) {
		return 'kiro';
	}
	if (lower.includes('amp')) {
		return 'amp';
	}
	if (lower.includes('codeep')) {
		return 'codeep';
	}
	return 'default';
};

const createBootSkeleton = (sessionId: string) => {
	const session = sessions.get(sessionId);
	const agentLabel = session?.label || '';
	const agentSlug = getAgentSlug(agentLabel);

	const skeleton = document.createElement('div');
	skeleton.className = 'cli-boot-skeleton';
	skeleton.dataset.sessionId = sessionId;
	skeleton.dataset.agent = agentSlug;

	// Premium scan overlay (terminal "reading" feel)
	const scan = document.createElement('div');
	scan.className = 's-scan';
	skeleton.append(scan);

	// Main rich line field (fills most of the vertical space)
	const main = document.createElement('div');
	main.className = 's-main';

	// Vertical beam (subtle descending light column) — placed inside .s-main
	// so it naturally stops before the live typing dots area
	const vbeamWrap = document.createElement('div');
	vbeamWrap.className = 's-vbeam-wrap';
	const vbeam = document.createElement('div');
	vbeam.className = 's-vbeam';
	vbeamWrap.appendChild(vbeam);
	main.appendChild(vbeamWrap);

	// BLOCK GROUPS — structured left accent bars + grouped shimmer lines
	// (replaces previous flat list of lines for richer visual rhythm)
	const blockGroups: string[][] = [
		['full', 'long'],
		['med', 'long', 'thick'],
		['indent', 'med', 'short'],
		['long', 'med', 'full'],
		['tiny', 'long', 'med'],
		['indent', 'thick', 'short', 'long'],
		['med', 'full']
	];

	for (const group of blockGroups) {
		const block = document.createElement('div');
		block.className = 's-block';

		const bar = document.createElement('div');
		bar.className = 's-block-bar';

		const linesWrap = document.createElement('div');
		linesWrap.className = 's-block-lines';

		for (const variant of group) {
			const line = document.createElement('div');
			line.className = `s-line ${variant}`;
			linesWrap.appendChild(line);
		}

		block.append(bar, linesWrap);
		main.appendChild(block);
	}

	skeleton.appendChild(main);

	// Strong LIVE ZONE — solves the "bottom is always black" problem
	const live = document.createElement('div');
	live.className = 's-live';

	const liveLines = ['long', 'full', 'med', 'long'];
	for (const variant of liveLines) {
		const line = document.createElement('div');
		line.className = `s-line ${variant}`;
		live.append(line);
	}

	// Real typing presence (three dots) — modern and alive
	const typing = document.createElement('div');
	typing.className = 's-typing';

	const sym = document.createElement('span');
	sym.className = 's-sym';
	sym.textContent = '▍';

	const dots = document.createElement('div');
	dots.className = 's-typing-dots';
	for (let i = 0; i < 3; i++) {
		const dot = document.createElement('div');
		dot.className = 's-dot';
		dots.append(dot);
	}

	typing.append(sym, dots);
	live.append(typing);

	skeleton.append(live);

	// Subtle status/context row (adds polish, feels intentional)
	const status = document.createElement('div');
	status.className = 's-status';

	const statusLeft = document.createElement('div');
	statusLeft.className = 's-status-left';

	const statusDot = document.createElement('div');
	statusDot.className = 's-status-dot';

	const statusText = document.createElement('span');
	statusText.textContent = agentLabel ? `starting ${agentLabel}` : 'preparing session';

	statusLeft.append(statusDot, statusText);

	const statusRight = document.createElement('span');
	statusRight.textContent = 'waiting for output';

	status.append(statusLeft, statusRight);
	skeleton.append(status);

	terminalStack.append(skeleton);
	bootSkeletons.set(sessionId, skeleton);

	// Hard safety net
	setTimeout(() => {
		if (bootSkeletons.has(sessionId)) {
			dismissSkeleton(sessionId);
		}
	}, 14000);

	return skeleton;
};

const dismissSkeleton = (sessionId: string) => {
	const skeleton = bootSkeletons.get(sessionId);
	if (!skeleton) {
		return;
	}

	bootSkeletons.delete(sessionId);
	sessionsWithFirstOutput.delete(sessionId);

	skeleton.classList.add('is-exiting');

	const remove = () => {
		skeleton.remove();
	};

	// Match the CSS transition duration (520ms)
	skeleton.addEventListener('transitionend', remove, { once: true });
	// Safety fallback in case transitionend doesn't fire
	setTimeout(remove, 800);
};

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

	// Only show the boot skeleton for freshly created sessions.
	// Old/restored sessions (reopening the panel later) should not flash a skeleton.
	const sessionAge = Date.now() - session.createdAt;
	if (!bootSkeletons.has(session.id) && sessionAge < 12000) {
		createBootSkeleton(session.id);
	}

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

	for (const [sessionId, skeleton] of bootSkeletons) {
		if (!openSessionIds.has(sessionId)) {
			skeleton.remove();
			bootSkeletons.delete(sessionId);
			sessionsWithFirstOutput.delete(sessionId);
		}
	}
};

const setActiveTerminal = () => {
	layoutRight?.classList.toggle('has-empty-state', !activeSessionId);

	for (const [sessionId, view] of terminals) {
		view.pane.classList.toggle('is-active', sessionId === activeSessionId);
	}

	for (const [sessionId, skeleton] of bootSkeletons) {
		skeleton.classList.toggle('is-active', sessionId === activeSessionId);
	}

	const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (!activeSession) {
		terminalLabel.textContent = 'CLI';
		terminalStatus.textContent = 'No active session';
		terminalBadge.textContent = 'CLI';
		updateAgentTheme();
		return;
	}

	terminalLabel.textContent = activeSession.label;
	terminalStatus.textContent = `${activeSession.status} - ${activeSession.cwd}`;
	terminalBadge.textContent = activeSession.commandLine;

	updateAgentTheme();

	requestAnimationFrame(() => {
		fitTerminal(activeSession.id);
		terminals.get(activeSession.id)?.terminal.focus();
	});
};

const updateAgentTheme = () => {
	const agentShell = document.querySelector<HTMLElement>('.agent-shell');
	if (!agentShell) {
		return;
	}

	const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (activeSession?.label) {
		const slug = getAgentSlug(activeSession.label);
		agentShell.dataset.agent = slug || '';
	} else {
		delete agentShell.dataset.agent;
	}
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

	// If a session entered error/exited state before producing output, don't leave skeleton hanging
	for (const [sessionId, skeleton] of [...bootSkeletons]) {
		const s = sessions.get(sessionId);
		if (s && (s.status === 'error' || s.status === 'exited')) {
			dismissSkeleton(sessionId);
		}
	}

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

	// Skeleton dismissal contract:
	// The skeleton must remain visible until the real CLI has started producing output,
	// and then must linger for exactly 1 second AFTER the first output appears.
	if (bootSkeletons.has(message.sessionId) && !sessionsWithFirstOutput.has(message.sessionId)) {
		sessionsWithFirstOutput.add(message.sessionId);

		// Wait 1 full second after the CLI actually speaks before we begin the exit animation.
		setTimeout(() => {
			dismissSkeleton(message.sessionId);
		}, 1000);
	}
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
