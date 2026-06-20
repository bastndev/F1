import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, type CliAgentIcon } from '../panel-tab/tab';
import { createCliCreateMessage } from '../../shared/agent-launch-guard';
import { getAgentSlug as resolveAgentSlug } from '../../shared/agents';
import { isLynxPanelNavChord } from '../../../shared/keymaps/lynx-keymap/index';
import { createToolsController, type CliUsageSnapshot } from '../tools/tools';
import { USAGE_BUSY_ERROR, isUsageAgentBusy, isUsageViewInline } from '../tools/modal-use/agents';
import { detectModelName } from '../../shared/model-detect';
import { createRpcChannel } from './host-rpc';
import { initMemoryHandler, handleMemoryMessage } from '../memory-handler';
import { createBootSkeletons } from './boot-skeleton';
import { createCopyToTranslateWatcher } from './copy-to-translate';
import { getTerminalFontFamily, getTerminalTheme } from './terminal-theme';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../shared/prompt';
import type { VoiceProgress, VoiceState } from '../../shared/voice/voice-types';
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
const defaultSubmitDelayMs = 150;
const slowPasteSubmitDelayMs = 750;
const routeSubmitDelayMs = 450;
const routeSubmitSecondEnterDelayMs = 350;
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
let activeSessionId: string | undefined;
let pendingTabSwitchSessionId: string | undefined;
let isPromptFilterEnabled = false;
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

const hasRouteMention = (text: string) => /(^|\s)@\S+/.test(text);

const getSubmitDelayMs = (agentSlug: string, text: string) => {
	const hasFileMention = hasRouteMention(text);

	if (agentSlug === 'copilot') {
		return slowPasteSubmitDelayMs;
	}

	if (hasFileMention) {
		return routeSubmitDelayMs;
	}

	return defaultSubmitDelayMs;
};

const getUsageCommandForAgent = (agentLabel: string) => {
	const slug = resolveAgentSlug(agentLabel) ?? 'default';
	return usageCommandsByAgentSlug[slug];
};

const getUsageInputData = (view: TerminalView | undefined, data: string) => (
	view?.terminal.modes.sendFocusMode ? `\x1b[I${data}` : data
);

// The current visible terminal screen as plain text (no ANSI). Used to detect
// whether a CLI is mid-task before injecting its usage command — the live
// viewport reflects the present state, unlike the append-only session buffer.
const readTerminalScreenText = (view: TerminalView | undefined): string => {
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

	pendingUsageRequest.captured = trimSessionBuffer(pendingUsageRequest.captured + data);
	window.clearTimeout(pendingUsageRequest.settleTimer);
	pendingUsageRequest.settleTimer = window.setTimeout(resolvePendingUsageRequest, usageRequestSettleDelayMs);
};

const requestActiveUsage = () => new Promise<CliUsageSnapshot>((resolve, reject) => {
	if (!activeSessionId) {
		reject(new Error('No active CLI session.'));
		return;
	}

	const session = sessions.get(activeSessionId);
	if (!session || session.status !== 'running') {
		reject(new Error('The active CLI session is not running.'));
		return;
	}

	const command = getUsageCommandForAgent(session.label);
	if (!command) {
		reject(new Error(`Usage command is not configured for ${session.label}.`));
		return;
	}

	const view = terminals.get(session.id);

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
		vscode.postMessage({
			type: 'cli.input',
			sessionId: session.id,
			data: getUsageInputData(view, command)
		});
		window.setTimeout(() => {
			if (sessions.get(session.id)?.status === 'running') {
				vscode.postMessage({
					type: 'cli.input',
					sessionId: session.id,
					data: getUsageInputData(view, '\r')
				});
			}
		}, codexUsageSubmitDelayMs);
		return;
	}

	vscode.postMessage({
		type: 'cli.input',
		sessionId: session.id,
		data: getUsageInputData(view, `${command}\r`)
	});
});

const dismissActiveUsageView = () => {
	if (!activeSessionId) {
		return;
	}

	const sessionId = activeSessionId;
	const session = sessions.get(sessionId);
	if (session?.status !== 'running') {
		return;
	}

	// Codex renders /status as inline transcript text — there's no overlay to
	// close. Sending Esc would instead open Codex's backtrack/edit-previous
	// pager whenever prior conversation exists, trapping the user. Skip dismiss.
	if (isUsageViewInline(session.label)) {
		return;
	}

	const view = terminals.get(sessionId);
	const data = view?.terminal.modes.sendFocusMode ? '\x1b[I\x1b' : '\x1b';
	const postEscape = () => {
		if (sessions.get(sessionId)?.status === 'running') {
			vscode.postMessage({ type: 'cli.input', sessionId, data });
		}
	};

	postEscape();
	window.setTimeout(postEscape, usageDismissSecondEscapeDelayMs);
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
let voiceStateListener: ((state: VoiceState, message?: string, progress?: VoiceProgress) => void) | undefined;

const speakText = (text: string, options?: { chunks?: string[] }) => {
	vscode.postMessage({ type: 'voice.speak', text, chunks: options?.chunks });
};

const stopSpeech = () => {
	vscode.postMessage({ type: 'voice.stop' });
};

const pauseSpeech = () => {
	vscode.postMessage({ type: 'voice.pause' });
};

const resumeSpeech = () => {
	vscode.postMessage({ type: 'voice.resume' });
};

const queryVoiceState = () => {
	vscode.postMessage({ type: 'voice.query' });
};

const onVoiceState = (listener: (state: VoiceState, message?: string, progress?: VoiceProgress) => void) => {
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
			getActiveSessionCreatedAt: () => {
				if (!activeSessionId) {
					return undefined;
				}
				return sessions.get(activeSessionId)?.createdAt;
			},
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
			getUsageSnapshot: () => {
				if (!activeSessionId) {
					return undefined;
				}
				return usageSnapshots.get(activeSessionId);
			},
			requestUsage: requestActiveUsage,
			dismissUsageView: dismissActiveUsageView,
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
					// rest. Route mentions are special in most CLI TUIs: the first
					// Enter commits/accepts the @file/@folder context, the next one
					// submits the completed prompt.
					const agentSlug = getAgentSlug(session.label);
					const delay = getSubmitDelayMs(agentSlug, text);
					const enterData = view?.terminal.modes.sendFocusMode ? '\x1b[I\r' : '\r';
					const needsRouteSubmitConfirm = hasRouteMention(text);
					const postEnter = () => {
						if (sessions.get(sessionId)?.status === 'running') {
							vscode.postMessage({ type: 'cli.input', sessionId, data: enterData });
						}
					};
					setTimeout(() => {
						postEnter();
						if (needsRouteSubmitConfirm) {
							setTimeout(postEnter, routeSubmitSecondEnterDelayMs);
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
			pauseSpeech,
			resumeSpeech,
			stopSpeech,
			queryVoiceState,
			onVoiceState,
			getTerminalSelection: () => {
				const view = activeSessionId ? terminals.get(activeSessionId) : undefined;
				const selection = view?.terminal.hasSelection() ? view.terminal.getSelection() : '';
				// TUI CLIs never produce an xterm selection — fall back to the
				// text they copied (captured via OSC 52 or the clipboard watch).
				return selection || copyToTranslate.getLastCopiedText();
			},
			refocusTerminal: () => {
				if (activeSessionId) {
					const view = terminals.get(activeSessionId);
					if (view?.terminal) {
						// Use the real xterm instance focus — it moves input focus to the
						// internal helper textarea (which is hidden and has no visible ring).
						view.terminal.focus();
						return;
					}
				}
				// Fallback (very rare): at least put focus near the terminal area.
				const activePane = document.querySelector<HTMLElement>('.cli-terminal-pane.is-active');
				activePane?.focus();
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

	// Lynx Keymap's panel-navigation chords (Alt+E/R/W/Q) must reach VS Code even
	// while the terminal is focused, so the user can hop between the CLI Hub and the
	// other bottom panels. Returning false stops xterm from sending them to the pty;
	// since we don't preventDefault/stopPropagation, the event bubbles to VS Code's
	// webview keybinding forwarder and the bound command runs. Every other key —
	// Alt+Enter, Ctrl+C, word-nav, … — still belongs to the CLI.
	if (isLynxPanelNavChord(event)) {
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
	// When the new view belongs to the active session (visual-sleep recycling,
	// late tab switch), mark the pane active synchronously so terminal.open()
	// and the RAF fit measure real dimensions. The pane is display:none without
	// is-active — opening xterm against a 0×0 element leaves it stuck at a
	// degenerate size and paints a tiny cursor with a black void below, even
	// after setActiveTerminal re-fits later.
	if (session.id === activeSessionId) {
		pane.classList.add('is-active');
	}
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

	// The host owns "is this CLI still starting?" via awaitingFirstOutput (true
	// until the pty emits its first real output). It's the only signal that survives
	// this webview being rebuilt on a panel switch — there's no retainContextWhenHidden
	// on My CLI, so any in-webview memory resets every time. Show the boot skeleton
	// only while the CLI genuinely hasn't rendered yet, so it plays on launch but
	// never replays on return. Gate on running so an instant exit/error doesn't flash it.
	if (session.awaitingFirstOutput && session.status === 'running') {
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
	for (const sessionId of [...usageSnapshots.keys()]) {
		if (!openSessionIds.has(sessionId)) {
			usageSnapshots.delete(sessionId);
		}
	}
	if (pendingUsageRequest && !openSessionIds.has(pendingUsageRequest.sessionId)) {
		pendingUsageRequest.reject(new Error('Usage refresh session was closed.'));
		clearPendingUsageRequest();
	}

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
		notePendingUsageOutput(message.sessionId, message.data);
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
		voiceStateListener?.(message.state, message.message, message.progress);
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

	if (message.type === 'memory.initialState') {
		tabController.setMemoryState(message.enabled);
		return;
	}

	if (message.type?.startsWith('memory.')) {
		handleMemoryMessage(message);
		return;
	}

	if (message.type === 'cli.visible') {
		repaintActiveTerminal();
		return;
	}

	if (message.type === 'cli.hidden') {
		// The translator is a transient action panel: it auto-opens on copy and has
		// no draft to preserve. retainContextWhenHidden would otherwise leave it open
		// across a panel switch, so it reappears (looking like an auto-open) when the
		// user returns. Dismiss it on hide. The Prompt modal is deliberately left
		// alone so an in-progress draft survives the round-trip.
		if (toolsController?.getOpenTool() === 'translate') {
			toolsController.close();
		}
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

// When the F1 view is hidden (user switches to Terminal/Debug Console) the
// webview keeps running thanks to retainContextWhenHidden, but the iframe is laid
// out display:none and xterm ends up stale — on return the pane shows a black
// rectangle where the viewport background bleeds below the under-sized screen.
// Re-fit (the pane regained its real height) and refresh() to force a full
// repaint. Two RAFs: the first lets layout flush after the iframe is shown again,
// the second runs once measurements are valid.
const repaintActiveTerminal = () => {
	if (!activeSessionId) {
		return;
	}
	const view = terminals.get(activeSessionId);
	if (!view) {
		return;
	}
	requestAnimationFrame(() => requestAnimationFrame(() => {
		fitTerminal(activeSessionId);
		try {
			view.terminal.refresh(0, view.terminal.rows - 1);
		} catch {
			// xterm can throw while the renderer is still settling — fine to drop.
		}
	}));
};

// Window minimize/restore (and OS-level tab switches) do fire the Page Visibility
// API; a VS Code panel switch does not — that case is driven by the host posting
// cli.visible via WebviewView.onDidChangeVisibility (handled above).
document.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'visible') {
		repaintActiveTerminal();
	}
});

initMemoryHandler((message) => vscode.postMessage(message));

vscode.postMessage({ type: 'cli.ready' });
