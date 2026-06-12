import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, type CliAgentIcon, type CliAgentOption, type CliSessionSummary } from '../panel-tab/tab';
import { createCliCreateMessage, type AgentLaunchGuardMessage } from './agent-safety/agent-launch-guard';
import { createToolsController } from './tools-cli-ui/tools';
import { detectModelName } from '../../core/terminal-cli/model-detect';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../core/tools-cli-core/prompt';
import type { VoiceState } from '../../core/tools-cli-core/modal-voice/voice-types';

type VsCodeApi = {
	postMessage: (message: ClientMessage) => void;
};

type ClientMessage =
	| { type: 'cli.ready' }
	| { type: 'cli.create'; agent: string; launchGuard?: AgentLaunchGuardMessage }
	| { type: 'cli.input'; sessionId: string; data: string }
	| { type: 'cli.switch'; sessionId: string }
	| { type: 'cli.resize'; sessionId?: string; cols: number; rows: number }
	| { type: 'cli.close'; sessionId: string }
	| { type: 'prompt.translate'; id: string; text: string; from: string; to: string }
	| { type: 'prompt.prepare'; id: string; text: string; attachments: ImageAttachment[] }
	| { type: 'prompt.spellcheck'; id: string; text: string; strict: boolean }
	| { type: 'workspace.listFiles'; id: string }
	| { type: 'workspace.listSkills'; id: string }
	| { type: 'voice.speak'; text: string }
	| { type: 'voice.stop' }
	| { type: 'voice.query' }
	| { type: 'clipboard.read'; id: string };

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
	| { type: 'cli.error'; message: string }
	| { type: 'prompt.translated'; id: string; text: string; provider?: string; fromCache?: boolean }
	| { type: 'prompt.translationError'; id: string; message: string }
	| { type: 'prompt.prepared'; id: string; text: string }
	| { type: 'prompt.prepareError'; id: string; message: string }
	| { type: 'prompt.spellResult'; id: string; issues: SpellIssue[] }
	| { type: 'workspace.files'; id: string; files: FileMentionEntry[] }
	| { type: 'workspace.skills'; id: string; skills: WorkspaceSkill[] }
	| { type: 'voice.state'; state: VoiceState; message?: string }
	| { type: 'clipboard.text'; id: string; text: string };

type TerminalView = {
	terminal: Terminal;
	fitAddon: FitAddon;
	pane: HTMLDivElement;
};

type PendingPromptTranslation = {
	resolve: (value: PromptTranslateResult) => void;
	reject: (reason?: unknown) => void;
	timeout: number;
};

type PendingPromptPrepare = {
	resolve: (value: string) => void;
	reject: (reason?: unknown) => void;
	timeout: number;
};

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const sessions = new Map<string, CliSession>();
const terminals = new Map<string, TerminalView>();
const bootSkeletons = new Map<string, HTMLDivElement>();
const sessionsWithFirstOutput = new Set<string>();
const pendingPromptTranslations = new Map<string, PendingPromptTranslation>();
const pendingPromptPrepares = new Map<string, PendingPromptPrepare>();
const visualSleepSessionThreshold = 3;
const maxWebviewBufferLength = 240000;
const promptFilterClickMoveThreshold = 6;
let activeSessionId: string | undefined;
let pendingTabSwitchSessionId: string | undefined;
let nextPromptTranslationId = 1;
let nextPromptPrepareId = 1;
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

const translatePrompt = (request: PromptTranslateRequest): Promise<PromptTranslateResult> => {
	const id = `prompt-translate-${nextPromptTranslationId++}`;

	return new Promise((resolve, reject) => {
		// Generous ceiling: long selections fan out into many sequential
		// provider requests on the host (450-byte chunks on MyMemory).
		const timeout = window.setTimeout(() => {
			pendingPromptTranslations.delete(id);
			reject(new Error('Translation timed out.'));
		}, 60000);

		pendingPromptTranslations.set(id, { resolve, reject, timeout });
		vscode.postMessage({
			type: 'prompt.translate',
			id,
			text: request.text,
			from: request.from,
			to: request.to,
		});
	});
};

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

const preparePromptWithAttachments = (text: string, attachments: ImageAttachment[]): Promise<string> => {
	if (!attachments || attachments.length === 0) {
		// No images — just return original (caller can still send)
		return Promise.resolve(text);
	}

	const id = `prompt-prepare-${nextPromptPrepareId++}`;

	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			pendingPromptPrepares.delete(id);
			reject(new Error('Image attachment prepare timed out.'));
		}, 30000);

		pendingPromptPrepares.set(id, { resolve, reject, timeout });
		vscode.postMessage({
			type: 'prompt.prepare',
			id,
			text,
			attachments,
		});
	});
};

const pendingWorkspaceFiles = new Map<string, (files: FileMentionEntry[]) => void>();
let nextWorkspaceFilesId = 1;

const requestWorkspaceFiles = (): Promise<FileMentionEntry[]> => {
	const id = `ws-files-${nextWorkspaceFilesId++}`;
	return new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			pendingWorkspaceFiles.delete(id);
			resolve([]);
		}, 5000);
		pendingWorkspaceFiles.set(id, (files) => {
			clearTimeout(timeout);
			resolve(files);
		});
		vscode.postMessage({ type: 'workspace.listFiles', id });
	});
};

const pendingWorkspaceSkills = new Map<string, (skills: WorkspaceSkill[]) => void>();
let nextWorkspaceSkillsId = 1;

const requestWorkspaceSkills = (): Promise<WorkspaceSkill[]> => {
	const id = `ws-skills-${nextWorkspaceSkillsId++}`;
	return new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			pendingWorkspaceSkills.delete(id);
			resolve([]);
		}, 5000);
		pendingWorkspaceSkills.set(id, (skills) => {
			clearTimeout(timeout);
			resolve(skills);
		});
		vscode.postMessage({ type: 'workspace.listSkills', id });
	});
};

const pendingClipboardReads = new Map<string, (text: string) => void>();
let nextClipboardReadId = 1;

const readClipboard = (): Promise<string> => {
	const id = `clipboard-read-${nextClipboardReadId++}`;
	return new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			pendingClipboardReads.delete(id);
			resolve('');
		}, 3000);
		pendingClipboardReads.set(id, (text) => {
			clearTimeout(timeout);
			resolve(text);
		});
		vscode.postMessage({ type: 'clipboard.read', id });
	});
};

const pendingSpellchecks = new Map<string, (issues: SpellIssue[]) => void>();
let nextSpellcheckId = 1;

const requestSpellcheck = (text: string, strict: boolean): Promise<SpellIssue[]> => {
	const id = `spell-${nextSpellcheckId++}`;
	return new Promise((resolve) => {
		const timeout = window.setTimeout(() => {
			pendingSpellchecks.delete(id);
			resolve([]);
		}, 5000);
		pendingSpellchecks.set(id, (issues) => {
			clearTimeout(timeout);
			resolve(issues);
		});
		vscode.postMessage({ type: 'prompt.spellcheck', id, text, strict });
	});
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

// ── Copy-to-translate ────────────────────────────────────────────────
// TUI CLIs (Claude Code, OpenCode, Grok, Kilo…) enable mouse tracking, so
// drags never become an xterm.js selection and the pointerup auto-open
// above never fires. Those CLIs copy the highlighted text themselves —
// through the pty with an OSC 52 sequence, or natively (xclip/wl-copy).
// Both detection paths land here, mirroring the selection flow: remember
// the text (Shift+F2 uses it as the selection fallback) and pop the
// translator open.
let lastCopiedText = '';

const handleCopiedText = (text: string, sessionId?: string) => {
	if (!text.trim()) {
		return;
	}
	lastCopiedText = text;

	if (!isPromptFilterEnabled || !toolsController) {
		return;
	}
	if (sessionId && sessionId !== activeSessionId) {
		return;
	}
	const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (session?.status !== 'running') {
		return;
	}
	// Never remount over an open modal (e.g. the user pressed Copy inside
	// the translator itself, which also lands on the clipboard).
	if (toolsController.isOpen()) {
		return;
	}
	toolsController.open('translate');
};

// Fallback detector for CLIs that copy natively instead of via OSC 52:
// watch the system clipboard while the panel is focused and the prompt
// filter (light toggle) is on. The baseline re-arms on focus, so text
// copied elsewhere in the IDE can never trigger the translator.
let clipboardBaseline: string | undefined;

window.addEventListener('focus', () => {
	clipboardBaseline = undefined;
});

window.setInterval(() => {
	if (!isPromptFilterEnabled || !document.hasFocus() || !activeSessionId) {
		return;
	}
	void readClipboard().then((text) => {
		if (clipboardBaseline === undefined) {
			clipboardBaseline = text;
			return;
		}
		if (text && text !== clipboardBaseline) {
			clipboardBaseline = text;
			handleCopiedText(text);
		}
	});
}, 800);

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
					const delay = getAgentSlug(session.label) === 'copilot' ? 750 : 150;
					setTimeout(() => {
						if (sessions.get(sessionId)?.status === 'running') {
							vscode.postMessage({ type: 'cli.input', sessionId, data: '\r' });
						}
					}, delay);
				}
			},
			translatePrompt,
			preparePromptWithAttachments,
			requestWorkspaceFiles,
			requestWorkspaceSkills,
			requestSpellcheck,
			speakText,
			stopSpeech,
			queryVoiceState,
			onVoiceState,
			getTerminalSelection: () => {
				const view = activeSessionId ? terminals.get(activeSessionId) : undefined;
				const selection = view?.terminal.hasSelection() ? view.terminal.getSelection() : '';
				// TUI CLIs never produce an xterm selection — fall back to the
				// text they copied (captured via OSC 52 or the clipboard watch).
				return selection || lastCopiedText;
			}
		})
	: undefined;

const tabController = createTabController({
	getAgentIcon: (label) => agentIcons.get(label),
	onCreate: (agent) => vscode.postMessage(createCliCreateMessage(agent, {
		source: 'panel',
		extensionMode: 'unknown'
	})),
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
	if (lower.includes('cursor')) {
		return 'cursor';
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
		fontFamily: getFontFamily(),
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
				clipboardBaseline = text; // keep the clipboard poll from double-firing
				handleCopiedText(text, session.id);
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
	if (!bootSkeletons.has(session.id) && sessionAge < 12000) {
		createBootSkeleton(session.id);
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

	for (const [sessionId, skeleton] of bootSkeletons) {
		if (!openSessionIds.has(sessionId)) {
			skeleton.remove();
			bootSkeletons.delete(sessionId);
			sessionsWithFirstOutput.delete(sessionId);
		}
	}
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

	for (const [sessionId, skeleton] of bootSkeletons) {
		skeleton.classList.toggle('is-active', sessionId === activeSessionId);
	}

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

	const visualSleepEnabled = isVisualSleepEnabled(message.sessions.length);
	const openSessionIds = new Set<string>();
	for (const session of message.sessions) {
		const cappedSession = {
			...session,
			buffer: trimSessionBuffer(session.buffer)
		};
		sessions.set(cappedSession.id, cappedSession);
		openSessionIds.add(session.id);

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

const resolvePromptTranslation = (message: Extract<ServerMessage, { type: 'prompt.translated' }>) => {
	const pending = pendingPromptTranslations.get(message.id);
	if (!pending) {
		return;
	}

	window.clearTimeout(pending.timeout);
	pendingPromptTranslations.delete(message.id);
	pending.resolve({
		text: message.text,
		provider: message.provider,
		fromCache: message.fromCache,
	});
};

const rejectPromptTranslation = (message: Extract<ServerMessage, { type: 'prompt.translationError' }>) => {
	const pending = pendingPromptTranslations.get(message.id);
	if (!pending) {
		return;
	}

	window.clearTimeout(pending.timeout);
	pendingPromptTranslations.delete(message.id);
	pending.reject(new Error(message.message));
};

const resolvePromptPrepare = (message: Extract<ServerMessage, { type: 'prompt.prepared' }>) => {
	const pending = pendingPromptPrepares.get(message.id);
	if (!pending) {
		return;
	}
	window.clearTimeout(pending.timeout);
	pendingPromptPrepares.delete(message.id);
	pending.resolve(message.text);
};

const rejectPromptPrepare = (message: Extract<ServerMessage, { type: 'prompt.prepareError' }>) => {
	const pending = pendingPromptPrepares.get(message.id);
	if (!pending) {
		return;
	}
	window.clearTimeout(pending.timeout);
	pendingPromptPrepares.delete(message.id);
	pending.reject(new Error(message.message));
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
		resolvePromptTranslation(message);
		return;
	}

	if (message.type === 'voice.state') {
		voiceStateListener?.(message.state, message.message);
		return;
	}

	if (message.type === 'clipboard.text') {
		const handler = pendingClipboardReads.get(message.id);
		if (handler) {
			pendingClipboardReads.delete(message.id);
			handler(message.text);
		}
		return;
	}

	if (message.type === 'prompt.translationError') {
		rejectPromptTranslation(message);
		return;
	}

	if (message.type === 'prompt.prepared') {
		resolvePromptPrepare(message);
		return;
	}

	if (message.type === 'prompt.prepareError') {
		rejectPromptPrepare(message);
		return;
	}

	if (message.type === 'prompt.spellResult') {
		const handler = pendingSpellchecks.get(message.id);
		if (handler) {
			pendingSpellchecks.delete(message.id);
			handler(message.issues);
		}
		return;
	}

	if (message.type === 'workspace.files') {
		const handler = pendingWorkspaceFiles.get(message.id);
		if (handler) {
			pendingWorkspaceFiles.delete(message.id);
			handler(message.files);
		}
		return;
	}

	if (message.type === 'workspace.skills') {
		const handler = pendingWorkspaceSkills.get(message.id);
		if (handler) {
			pendingWorkspaceSkills.delete(message.id);
			handler(message.skills);
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

vscode.postMessage({ type: 'cli.ready' });
