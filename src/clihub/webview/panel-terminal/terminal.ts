import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, type CliAgentIcon } from '../panel-tab/tab';
import { createCliCreateMessage } from '../../shared/agent-launch-guard';
import { getAgentSlug as resolveAgentSlug } from '../../shared/agents';
import { createToolsController } from '../tools/tools';
import { detectModelName } from '../../shared/model-detect';
import { createRpcChannel } from './host-rpc';
import { createBootSkeletons } from './boot-skeleton';
import { createCopyToTranslateWatcher } from './copy-to-translate';
import { getTerminalFontFamily, getTerminalTheme } from './terminal-theme';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../shared/prompt';
import type { VoiceState } from '../../shared/voice/voice-types';
import type {
	CliSessionSnapshot,
	HostToWebviewMessage,
	WebviewToHostMessage
} from '../../shared/protocol';

type VsCodeApi = {
	postMessage: (message: WebviewToHostMessage) => void;
};

// Same shape the host announces, but the buffer is always materialized:
// either from the snapshot (first announcement) or maintained locally from
// incremental cli.output data.
type CliSession = Omit<CliSessionSnapshot, 'buffer'> & { buffer: string };

type ServerMessage = HostToWebviewMessage;

type TerminalView = {
	terminal: Terminal;
	fitAddon: FitAddon;
	pane: HTMLDivElement;
};

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const customCliIconLabel = '__custom-cli__';
const sessions = new Map<string, CliSession>();
const terminals = new Map<string, TerminalView>();
const visualSleepSessionThreshold = 3;
const maxWebviewBufferLength = 240000;
const promptFilterClickMoveThreshold = 6;
const clipboardPollIntervalMs = 800;
let activeSessionId: string | undefined;
let pendingTabSwitchSessionId: string | undefined;
let isPromptFilterEnabled = false;

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
const getAgentIcon = (label: string) => {
	return agentIcons.get(label) ?? agentIcons.get(customCliIconLabel);
};
const layoutRight = document.querySelector<HTMLElement>('.layout-right');
const terminalStack = document.getElementById('cli-terminal-stack') as HTMLDivElement;
const terminalLabel = document.getElementById('cli-terminal-label') as HTMLDivElement;
const terminalStatus = document.getElementById('cli-terminal-status') as HTMLDivElement;
const terminalBadge = document.getElementById('cli-terminal-badge') as HTMLDivElement;

const trimSessionBuffer = (buffer: string) => {
	if (buffer.length <= maxWebviewBufferLength) {
		return buffer;
	}

	return buffer.slice(buffer.length - maxWebviewBufferLength);
};

const appendToSessionBuffer = (session: CliSession, data: string) => {
	session.buffer = trimSessionBuffer(session.buffer + data);
};

const isVisualSleepEnabled = (sessionCount: number = sessions.size) => {
	return sessionCount > visualSleepSessionThreshold;
};

const shouldKeepTerminalAwake = (
	sessionId: string,
	visualSleepEnabled: boolean = isVisualSleepEnabled()
) => {
	return !visualSleepEnabled || sessionId === activeSessionId;
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

// ── Host round-trips ─────────────────────────────────────────────────
// One RPC channel per request/response message pair; see host-rpc.ts.

// Generous ceiling: long selections fan out into many sequential
// provider requests on the host (450-byte chunks on MyMemory).
const promptTranslateRpc = createRpcChannel<[PromptTranslateRequest], PromptTranslateResult>({
	prefix: 'prompt-translate',
	timeoutMs: 60000,
	onTimeout: { rejectMessage: 'Translation timed out.' },
	send: (id, request) => vscode.postMessage({
		type: 'prompt.translate',
		id,
		text: request.text,
		from: request.from,
		to: request.to,
	})
});

const translatePrompt = (request: PromptTranslateRequest): Promise<PromptTranslateResult> => {
	return promptTranslateRpc.request(request);
};

const promptPrepareRpc = createRpcChannel<[string, ImageAttachment[]], string>({
	prefix: 'prompt-prepare',
	timeoutMs: 30000,
	onTimeout: { rejectMessage: 'Image attachment prepare timed out.' },
	send: (id, text, attachments) => vscode.postMessage({ type: 'prompt.prepare', id, text, attachments })
});

const preparePromptWithAttachments = (text: string, attachments: ImageAttachment[]): Promise<string> => {
	if (!attachments || attachments.length === 0) {
		// No images — just return original (caller can still send)
		return Promise.resolve(text);
	}

	return promptPrepareRpc.request(text, attachments);
};

const workspaceFilesRpc = createRpcChannel<[], FileMentionEntry[]>({
	prefix: 'ws-files',
	timeoutMs: 5000,
	onTimeout: { resolveWith: [] },
	send: (id) => vscode.postMessage({ type: 'workspace.listFiles', id })
});

const workspaceSkillsRpc = createRpcChannel<[], WorkspaceSkill[]>({
	prefix: 'ws-skills',
	timeoutMs: 5000,
	onTimeout: { resolveWith: [] },
	send: (id) => vscode.postMessage({ type: 'workspace.listSkills', id })
});

const clipboardReadRpc = createRpcChannel<[], string>({
	prefix: 'clipboard-read',
	timeoutMs: 3000,
	onTimeout: { resolveWith: '' },
	send: (id) => vscode.postMessage({ type: 'clipboard.read', id })
});

const spellcheckRpc = createRpcChannel<[string, boolean], SpellIssue[]>({
	prefix: 'spell',
	timeoutMs: 5000,
	onTimeout: { resolveWith: [] },
	send: (id, text, strict) => vscode.postMessage({ type: 'prompt.spellcheck', id, text, strict })
});

// Voice playback runs in the extension host (Piper TTS, shared with the ATM
// extension). The webview fires commands and mirrors broadcast state.
let voiceStateListener: ((state: VoiceState, message?: string) => void) | undefined;

const speakText = (text: string) => {
	vscode.postMessage({ type: 'voice.speak', text });
};

const stopSpeech = () => {
	vscode.postMessage({ type: 'voice.stop' });
};

const queryVoiceState = () => {
	vscode.postMessage({ type: 'voice.query' });
};

const onVoiceState = (listener: (state: VoiceState, message?: string) => void) => {
	voiceStateListener = listener;
	return () => {
		if (voiceStateListener === listener) {
			voiceStateListener = undefined;
		}
	};
};

const openPromptFromTerminal = (sessionId: string) => {
	if (!isPromptFilterEnabled || !toolsController) {
		return;
	}

	if (sessionId !== activeSessionId) {
		return;
	}

	const session = sessions.get(sessionId);
	if (session?.status !== 'running') {
		return;
	}

	toolsController.open('prompt');
};

const openTranslatorFromTerminal = (sessionId: string) => {
	if (!isPromptFilterEnabled || !toolsController) {
		return;
	}

	if (sessionId !== activeSessionId) {
		return;
	}

	const session = sessions.get(sessionId);
	if (session?.status !== 'running') {
		return;
	}

	toolsController.open('translate');
};

const toolsController = layoutRight
	? createToolsController({
			container: layoutRight,
			getActiveSessionId: () => activeSessionId,
			getActiveModelName: () => {
				if (!activeSessionId) {
					return undefined;
				}
				const session = sessions.get(activeSessionId);
				if (!session) {
					return undefined;
				}
				return detectModelName(getAgentSlug(session.label), session.buffer);
			},
			sendToActiveSession: (text: string, options?: { paste?: boolean; submit?: boolean }) => {
				if (!activeSessionId) {
					return;
				}
				const sessionId = activeSessionId;
				const session = sessions.get(sessionId);
				if (session?.status !== 'running') {
					return;
				}
				const view = terminals.get(sessionId);
				let data = text;
				// Frame pasted text in bracketed-paste markers when the CLI has
				// enabled that mode (xterm tracks DECSET 2004 per terminal). TUI
				// CLIs rely on this to insert multi-char input cleanly; without it
				// some (e.g. Copilot) garble or drop chunked input entirely.
				if (options?.paste && view?.terminal.modes.bracketedPasteMode) {
					data = `\x1b[200~${text}\x1b[201~`;
				}
				// CLIs that requested focus reporting (DECSET 1004) may ignore key
				// input while the terminal reports itself unfocused — and it does
				// while the user types in the prompt modal. Announce focus-in so the
				// submit registers; the real focus events keep flowing as usual.
				if (options?.submit && view?.terminal.modes.sendFocusMode) {
					data = `\x1b[I${data}`;
				}
				vscode.postMessage({ type: 'cli.input', sessionId, data });
				if (options?.submit) {
					// Enter must arrive as its own write or TUI CLIs treat it as part
					// of the paste. Copilot digests pastes noticeably slower than the
					// rest, so it gets a longer pause before the keypress.
					const agentSlug = getAgentSlug(session.label);
					const hasFileMention = /(^|\s)@\S+/.test(text);
					const delay = agentSlug === 'copilot' || (agentSlug === 'kiro' && hasFileMention) ? 750 : 150;
					setTimeout(() => {
						if (sessions.get(sessionId)?.status === 'running') {
							vscode.postMessage({ type: 'cli.input', sessionId, data: '\r' });
						}
					}, delay);
				}
			},
			translatePrompt,
			preparePromptWithAttachments,
			requestWorkspaceFiles: () => workspaceFilesRpc.request(),
			requestWorkspaceSkills: () => workspaceSkillsRpc.request(),
			openCreateSkill: () => vscode.postMessage({ type: 'mySkills.openCreate' }),
			requestSpellcheck: (text: string, strict: boolean) => spellcheckRpc.request(text, strict),
			speakText,
			stopSpeech,
			queryVoiceState,
			onVoiceState,
			getTerminalSelection: () => {
				const view = activeSessionId ? terminals.get(activeSessionId) : undefined;
				const selection = view?.terminal.hasSelection() ? view.terminal.getSelection() : '';
				// TUI CLIs never produce an xterm selection — fall back to the
				// text they copied (captured via OSC 52 or the clipboard watch).
				return selection || copyToTranslate.getLastCopiedText();
			}
		})
	: undefined;

const copyToTranslate = createCopyToTranslateWatcher({
	pollIntervalMs: clipboardPollIntervalMs,
	readClipboard: () => clipboardReadRpc.request(),
	isEnabled: () => isPromptFilterEnabled && !!toolsController,
	getActiveSessionId: () => activeSessionId,
	isActiveSessionRunning: () => {
		const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
		return session?.status === 'running';
	},
	isToolModalOpen: () => toolsController?.isOpen() ?? false,
	openTranslator: () => toolsController?.open('translate')
});

const tabController = createTabController({
	getAgentIcon,
	onCreate: (agent) => vscode.postMessage(createCliCreateMessage(agent, {
		source: 'panel',
		extensionMode: 'unknown'
	})),
	onCreateCustomCli: () => vscode.postMessage({ type: 'customCli.open', source: 'panel' }),
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
	},
	onPromptFilterChange: (enabled) => {
		isPromptFilterEnabled = enabled;
		if (!enabled && activeSessionId) {
			terminals.get(activeSessionId)?.terminal.focus();
		}
	},
	getOpenToolModal: () => toolsController?.getOpenTool() ?? null
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
	return resolveAgentSlug(label) ?? 'default';
};

const bootSkeletons = createBootSkeletons({
	stack: terminalStack,
	getSessionLabel: (sessionId) => sessions.get(sessionId)?.label || '',
	getAgentSlug
});

const createTerminalView = (session: CliSession) => {
	const existingView = terminals.get(session.id);
	if (existingView) {
		return existingView;
	}

	const pane = document.createElement('div');
	pane.className = 'cli-terminal-pane';
	pane.dataset.sessionId = session.id;
	terminalStack.append(pane);

	const terminal = new Terminal({
		allowProposedApi: false,
		convertEol: true,
		cursorBlink: true,
		fontFamily: getTerminalFontFamily(),
		fontSize: 12,
		scrollback: 8000,
		theme: getTerminalTheme()
	});
	terminal.attachCustomKeyEventHandler(handleTerminalKey);

	// TUI CLIs copy their internal selection with OSC 52, which xterm.js
	// ignores by default. Honor the copy (write it to the real clipboard)
	// and route it through the copy-to-translate flow.
	terminal.parser.registerOscHandler(52, (data) => {
		const separator = data.indexOf(';');
		const payload = separator >= 0 ? data.slice(separator + 1) : data;
		if (!payload || payload === '?') {
			return true;
		}
		try {
			const bytes = Uint8Array.from(atob(payload), (char) => char.charCodeAt(0));
			const text = new TextDecoder().decode(bytes);
			if (text) {
				void navigator.clipboard.writeText(text);
				copyToTranslate.notifyCopiedText(text, session.id);
			}
		} catch {
			// Not a valid base64 copy payload — ignore.
		}
		return true;
	});

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

	let promptFilterPointerStart: {
		x: number;
		y: number;
		pointerId: number;
		hadSelection: boolean;
	} | undefined;

	pane.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) {
			promptFilterPointerStart = undefined;
			return;
		}

		promptFilterPointerStart = {
			x: event.clientX,
			y: event.clientY,
			pointerId: event.pointerId,
			hadSelection: terminal.hasSelection()
		};
	});
	pane.addEventListener('pointerup', (event) => {
		const pointerStart = promptFilterPointerStart;
		promptFilterPointerStart = undefined;
		if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
			return;
		}

		const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
		window.setTimeout(() => {
			if (terminal.hasSelection()) {
				openTranslatorFromTerminal(session.id);
				return;
			}

			if (moved <= promptFilterClickMoveThreshold && !pointerStart.hadSelection) {
				openPromptFromTerminal(session.id);
			}
		}, 0);
	});
	pane.addEventListener('pointercancel', () => {
		promptFilterPointerStart = undefined;
	});

	const view = { terminal, fitAddon, pane };
	terminals.set(session.id, view);
	requestAnimationFrame(() => fitTerminal(session.id));

	// Only show the boot skeleton for freshly created sessions.
	// Old/restored sessions (reopening the panel later) should not flash a skeleton.
	const sessionAge = Date.now() - session.createdAt;
	if (sessionAge < 12000) {
		bootSkeletons.create(session.id);
	}

	return view;
};

const disposeTerminalView = (sessionId: string, view: TerminalView) => {
	view.terminal.dispose();
	view.pane.remove();
	terminals.delete(sessionId);
};

const removeClosedTerminals = (openSessionIds: Set<string>) => {
	for (const [sessionId, view] of terminals) {
		if (!openSessionIds.has(sessionId)) {
			disposeTerminalView(sessionId, view);
		}
	}

	bootSkeletons.removeClosed(openSessionIds);
};

const sleepInactiveTerminals = (visualSleepEnabled: boolean, openSessionIds: Set<string>) => {
	if (!visualSleepEnabled) {
		return;
	}

	for (const [sessionId, view] of terminals) {
		if (openSessionIds.has(sessionId) && !shouldKeepTerminalAwake(sessionId, visualSleepEnabled)) {
			disposeTerminalView(sessionId, view);
		}
	}
};

const setActiveTerminal = () => {
	layoutRight?.classList.toggle('has-empty-state', !activeSessionId);

	const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (activeSession && shouldKeepTerminalAwake(activeSession.id)) {
		createTerminalView(activeSession);
	}

	for (const [sessionId, view] of terminals) {
		view.pane.classList.toggle('is-active', sessionId === activeSessionId);
	}

	bootSkeletons.setActiveSession(activeSessionId);

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
	const previousSessions = new Map(sessions);
	sessions.clear();

	const visualSleepEnabled = isVisualSleepEnabled(message.sessions.length);
	const openSessionIds = new Set<string>();
	for (const snapshot of message.sessions) {
		// The host sends the buffer only the first time it announces a session
		// to this webview; afterwards the local copy (fed by cli.output) wins.
		const buffer = snapshot.buffer !== undefined
			? trimSessionBuffer(snapshot.buffer)
			: previousSessions.get(snapshot.id)?.buffer ?? '';
		const cappedSession: CliSession = { ...snapshot, buffer };
		sessions.set(cappedSession.id, cappedSession);
		openSessionIds.add(snapshot.id);

		if (shouldKeepTerminalAwake(cappedSession.id, visualSleepEnabled)) {
			createTerminalView(cappedSession);
		}
	}

	if (pendingTabSwitchSessionId && (!sessions.has(pendingTabSwitchSessionId) || pendingTabSwitchSessionId === activeSessionId)) {
		pendingTabSwitchSessionId = undefined;
	}

	removeClosedTerminals(openSessionIds);
	sleepInactiveTerminals(visualSleepEnabled, openSessionIds);

	// If a session entered error/exited state before producing output, don't leave skeleton hanging
	for (const [sessionId, session] of sessions) {
		if (bootSkeletons.has(sessionId) && (session.status === 'error' || session.status === 'exited')) {
			bootSkeletons.dismiss(sessionId);
		}
	}

	tabController.render(message.sessions, activeSessionId);
	setActiveTerminal();
};

const handleOutput = (message: Extract<ServerMessage, { type: 'cli.output' }>) => {
	const session = sessions.get(message.sessionId);
	if (session) {
		appendToSessionBuffer(session, message.data);
	}

	let restoredFromBuffer = false;
	if (!terminals.has(message.sessionId) && session && shouldKeepTerminalAwake(message.sessionId)) {
		createTerminalView(session);
		restoredFromBuffer = true;
	}

	if (!restoredFromBuffer) {
		terminals.get(message.sessionId)?.terminal.write(message.data);
	}

	// Skeleton dismissal contract: the skeleton must remain visible until the
	// real CLI has started producing output, then linger exactly 1 second.
	bootSkeletons.notifyOutput(message.sessionId);
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

	if (message.type === 'prompt.translated') {
		promptTranslateRpc.resolve(message.id, {
			text: message.text,
			provider: message.provider,
			fromCache: message.fromCache,
		});
		return;
	}

	if (message.type === 'voice.state') {
		voiceStateListener?.(message.state, message.message);
		return;
	}

	if (message.type === 'clipboard.text') {
		clipboardReadRpc.resolve(message.id, message.text);
		return;
	}

	if (message.type === 'prompt.translationError') {
		promptTranslateRpc.reject(message.id, new Error(message.message));
		return;
	}

	if (message.type === 'prompt.prepared') {
		promptPrepareRpc.resolve(message.id, message.text);
		return;
	}

	if (message.type === 'prompt.prepareError') {
		promptPrepareRpc.reject(message.id, new Error(message.message));
		return;
	}

	if (message.type === 'prompt.spellResult') {
		spellcheckRpc.resolve(message.id, message.issues);
		return;
	}

	if (message.type === 'workspace.files') {
		workspaceFilesRpc.resolve(message.id, message.files);
		return;
	}

	if (message.type === 'workspace.skills') {
		workspaceSkillsRpc.resolve(message.id, message.skills);
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
