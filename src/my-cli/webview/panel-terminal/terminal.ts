import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { createTabController, readVoiceFinishPreference, type CliAgentIcon } from '../panel-tab/tab';
import { getStoredPromptLang } from '../tools/modal-prompt/language-select';
import { hasTranslatableContent } from '../tools/modal-translator/terminal-text';
import { prunePromptDrafts, markRulesInjectedForSession, getRulesSoundUri, getConfirmationSoundUri } from '../tools/modal-prompt/prompt';
import { createCliCreateMessage } from '../../shared/agent-launch-guard';
import { getAgentSlug as resolveAgentSlug, getCliAgent } from '../../shared/agents';
import { isLynxPanelNavChord } from '../../../shared/keymaps/lynx-keymap/index';
import { matchesShortcut } from '../../../shared/keymaps/cli';
import { getUsageCommandLabel, isUsageAgentBusy, isUsageViewInline } from '../tools/modal-use/agents';
import { readTerminalScreenText } from './usage-tracker';
import { isAwaitingUserInput } from './awaiting-input';
import { createToolsController } from '../tools/tools';
import { createUsageTracker } from './usage-tracker';
import { detectModelName } from '../../shared/model-detect';
import { createRpcChannel } from './host-rpc';
import { createBootSkeletons } from './boot-skeleton';
import { createSmartSkeleton, type SmartSkeletonController } from '../../../my-plus/my-smart/webview/smart-skeleton';
import { createCopyToTranslateWatcher } from './copy-to-translate';
import { getTerminalFontFamily, getTerminalTheme } from './terminal-theme';
import { adaptRouteMentionsForKiro } from './kiro-send';
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

// Push the Voice Finish config (enabled + which language's WAV to play) to the
// host. The host detects "response done" and plays the cue even when this panel
// is hidden, so it needs both flags pushed while the webview is alive — on
// startup, when the toggle flips, and on each submit (so the language is fresh).
const sendVoiceFinishConfig = () => {
	vscode.postMessage({
		type: 'cli.voiceFinish',
		enabled: readVoiceFinishPreference(),
		lang: getStoredPromptLang() ?? 'en'
	});
};

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

const usageTracker = createUsageTracker({
	post: message => vscode.postMessage(message),
	getActiveSessionId: () => activeSessionId,
	getSession: sessionId => sessions.get(sessionId),
	getView: sessionId => terminals.get(sessionId),
	trimSessionBuffer
});

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

const spellcheckRpc = createRpcChannel<[string, string, boolean], SpellIssue[]>({
	prefix: 'spell',
	timeoutMs: 5000,
	onTimeout: { resolveWith: [] },
	send: (id, text, lang, strict) => vscode.postMessage({ type: 'prompt.spellcheck', id, text, lang, strict })
});

// One-shot rules injection: the host types the rules prompt into the CLI and
// answers when the agent has read it (or its own hard cap fires). The timeout
// sits above that host cap so the modal always unblocks; a miss resolves false.
const injectRulesRpc = createRpcChannel<[string, string, string, boolean], boolean>({
	prefix: 'inject-rules',
	timeoutMs: 70000,
	onTimeout: { resolveWith: false },
	send: (id, sessionId, text, marker, focusReporting) => vscode.postMessage({ type: 'prompt.injectRules', id, sessionId, text, marker, focusReporting })
});

// Voice playback runs in the extension host (Piper TTS, shared with the ATM
// extension). The webview fires commands and mirrors broadcast state.
let voiceStateListener: ((state: VoiceState, message?: string, progress?: VoiceProgress) => void) | undefined;

const speakText = (text: string, options?: { chunks?: string[]; lang?: string }) => {
	vscode.postMessage({ type: 'voice.speak', text, chunks: options?.chunks, lang: options?.lang });
};

// Streaming companion to speakText: queue more chunks onto the running voice
// session (the Translator feeds blocks as they finish translating). `final`
// marks the last batch so the host can wind the session down.
const appendSpeech = (chunks: string[], options?: { final?: boolean; lang?: string; reset?: boolean }) => {
	vscode.postMessage({ type: 'voice.append', chunks, lang: options?.lang, final: options?.final, reset: options?.reset });
};

// Ask the host whether the voice for a language is already downloaded, so the
// Listen button can show a "download" affordance before the first click.
const voiceReadyRpc = createRpcChannel<[string], boolean>({
	prefix: 'voice-ready',
	timeoutMs: 5000,
	// On no answer assume ready — don't show a download prompt we're unsure about.
	onTimeout: { resolveWith: true },
	send: (id, lang) => vscode.postMessage({ type: 'voice.checkReady', id, lang })
});

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

// Deliver text to a specific CLI, addressed by session id — not "whoever is
// active now". The prompt composer pins its send to the session it opened for
// (see sendToActiveSession for the live-active variant), so translation/image
// awaits plus a Tab switch mid-send can never reroute the prompt to another CLI.
const sendToSession = (sessionId: string, text: string, options?: { paste?: boolean; submit?: boolean }) => {
	const session = sessions.get(sessionId);
	if (session?.status !== 'running') {
		return;
	}
	if (options?.submit) {
		trackPickerCommand(sessionId, session.label, text);
	}
	const view = terminals.get(sessionId);
	const agentSlug = getAgentSlug(session.label);
	// kiro's @ is a modal file-picker: it drills @folder/ into a child file and swallows
	// text pasted after the open picker. adaptRouteMentionsForKiro strips the @ from its
	// folder routes so they land as literal paths (no picker). Non-kiro and kiro file
	// routes come back unchanged.
	const sendText = adaptRouteMentionsForKiro(text, agentSlug);
	// Folder routes (@path/) arrive with the picker's trailing space trimmed off, so the
	// CLI's own @ file-picker stays open on a highlighted child and the accept-Enter drills
	// @src/ -> @src/style.css. Re-add one space to close that popup ON the folder. File
	// routes end in a name and keep their popup so the exact match commits.
	const endsWithFolderRoute = /(?:^|\s)@\S+\/$/.test(sendText);
	const payload = endsWithFolderRoute ? `${sendText} ` : sendText;
	let data = payload;
	// Frame pasted text in bracketed-paste markers when the CLI has
	// enabled that mode (xterm tracks DECSET 2004 per terminal). TUI
	// CLIs rely on this to insert multi-char input cleanly; without it
	// some (e.g. Copilot) garble or drop chunked input entirely.
	if (options?.paste && view?.terminal.modes.bracketedPasteMode) {
		data = `\x1b[200~${payload}\x1b[201~`;
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
		// Refresh the host's Voice Finish config so the cue matches the
		// language the user is writing in right now for this response.
		sendVoiceFinishConfig();
		// Enter must arrive as its own write or TUI CLIs treat it as part
		// of the paste. Copilot digests pastes noticeably slower than the
		// rest. Route mentions are special in most CLI TUIs: the first
		// Enter commits/accepts the @file/@folder context, the next one
		// submits the completed prompt.
		// Delay keys off the original text: a kiro folder route now sends a literal path but
		// still wants the generous route-settle window before Enter.
		const delay = getSubmitDelayMs(agentSlug, text);
		const enterData = view?.terminal.modes.sendFocusMode ? '\x1b[I\r' : '\r';
		// Folder routes closed their picker (trailing space, or literal path on kiro), so one
		// Enter submits; only file/other routes need the second accept-then-submit Enter.
		const needsRouteSubmitConfirm = hasRouteMention(sendText) && !endsWithFolderRoute;
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
};

// Live-active variant: footer-chip chords and other terminal actions that
// legitimately target whichever CLI is focused right now.
const sendToActiveSession = (text: string, options?: { paste?: boolean; submit?: boolean }) => {
	if (activeSessionId) {
		sendToSession(activeSessionId, text, options);
	}
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
			getActiveSessionBuffer: () => {
				if (!activeSessionId) {
					return undefined;
				}
				return sessions.get(activeSessionId)?.buffer;
			},
			getUsageSnapshot: () => usageTracker.getSnapshot(activeSessionId),
			requestUsage: usageTracker.request,
			dismissUsageView: usageTracker.dismiss,
			sendToActiveSession,
			sendToSession,
			isCliBusy: () => isActiveCliBusy(),
			translatePrompt,
			preparePromptWithAttachments,
			requestWorkspaceFiles: () => workspaceFilesRpc.request(),
			requestWorkspaceSkills: () => workspaceSkillsRpc.request(),
			openCreateSkill: () => vscode.postMessage({ type: 'mySkills.openCreate' }),
			requestSpellcheck: (text: string, lang: string, strict: boolean) => spellcheckRpc.request(text, lang, strict),
			injectRules: (text: string, marker: string) =>
				activeSessionId
					// Pass the live DECSET 1004 state so the host knows to prefix a
					// focus-in on submit (the modal steals focus → copilot drops \r).
					? injectRulesRpc.request(activeSessionId, text, marker, terminals.get(activeSessionId)?.terminal.modes.sendFocusMode ?? false)
					: Promise.resolve(false),
			speakText,
			appendSpeech,
			checkVoiceReady: (lang: string) => voiceReadyRpc.request(lang),
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
			},
			refocusCli: () => {
				// Ask the extension host to focus the CLI Hub view and then refocus
				// the terminal. This is needed after Alt+number shortcuts because VS Code
				// may have moved focus to an editor tab.
				vscode.postMessage({ type: 'cli.focus' });
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
	onCreate: (agent, smart) => vscode.postMessage(createCliCreateMessage(agent, {
		source: 'panel',
		extensionMode: 'unknown'
	}, smart)),
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
	onVoiceFinishChange: () => sendVoiceFinishConfig(),
	getOpenToolModal: () => toolsController?.getOpenTool() ?? null
});

// ── Footer chip shortcuts, terminal-wide ────────────────────────────
// Alt+1/2/3 (model / resume / usage) work directly on the focused CLI, not
// just inside the prompt modal — same injection the modal footer chips use.
// Skipped while any tool modal is open: the prompt modal binds its own
// copies to click the visible chips, and the other modals own their keys.
// The same chord pressed again closes the picker it opened (Esc), and a
// different chord swaps pickers. We can't *see* the TUI picker, so this is
// tracked state: set on injection, cleared by Esc/Enter in the terminal,
// any other submitted send, and session close.

type FooterShortcutKind = 'model' | 'resume' | 'usage';

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
	const view = terminals.get(sessionId);
	const data = view?.terminal.modes.sendFocusMode ? '\x1b[I\x1b' : '\x1b';
	vscode.postMessage({ type: 'cli.input', sessionId, data });
};

const injectFooterCommand = (kind: FooterShortcutKind) => {
	const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (session?.status !== 'running') {
		return;
	}
	const command = resolveFooterCommand(session.label, kind);
	if (!command) {
		return;
	}
	if (getAgentSlug(session.label) === 'cursor') {
		// Cursor's TUI drops raw chunked input: bracketed paste, no Ctrl+U.
		sendToActiveSession(command, { paste: true, submit: true });
	} else {
		// \x15 is Ctrl+U: wipe the current input line so partially typed text
		// is not concatenated with the command.
		sendToActiveSession(`\x15${command}`, { submit: true });
	}
};

// Whether the active CLI is mid-task and would corrupt its input if a command
// were injected right now (idle-only CLIs: Kiro/Antigravity/Codex). Same
// guard modal-use applies before injecting /usage.
const isActiveCliBusy = (): boolean => {
	const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
	if (!session) {
		return false;
	}
	return isUsageAgentBusy(session.label, readTerminalScreenText(terminals.get(session.id)));
};

const handleFooterShortcutKey = (event: KeyboardEvent): boolean => {
	if (event.type !== 'keydown' || event.repeat) {
		return false;
	}
	if (toolsController?.isOpen()) {
		return false;
	}
	const kind = matchesShortcut(event, 'promptFooterModel') ? 'model'
		: matchesShortcut(event, 'promptFooterResume') ? 'resume'
		: matchesShortcut(event, 'promptFooterUsage') ? 'usage'
		: undefined;
	if (!kind) {
		return false;
	}
	const session = activeSessionId ? sessions.get(activeSessionId) : undefined;
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
	terminals.get(session.id)?.terminal.focus();
	return true;
};

// Catch the chords when focus sits elsewhere in the panel (tabs, buttons);
// the xterm path below handles them while the terminal itself is focused.
document.addEventListener('keydown', (event) => {
	handleFooterShortcutKey(event);
});

const isOpenCodeSession = (sessionId: string): boolean => {
	const session = sessions.get(sessionId);
	return session ? getAgentSlug(session.label) === 'opencode' : false;
};

const isCtrlZ = (event: KeyboardEvent): boolean =>
	event.type === 'keydown'
	&& event.ctrlKey
	&& !event.altKey
	&& !event.metaKey
	&& event.key.toLowerCase() === 'z';

const handleTerminalKey = (event: KeyboardEvent, sessionId: string) => {
	// Esc dismisses a TUI picker, Enter selects from it — either way the
	// picker a footer chord opened is gone now. Observe only, never consume.
	if (event.type === 'keydown' && (event.key === 'Escape' || event.key === 'Enter')) {
		openFooterPickers.delete(sessionId);
	}

	if (isOpenCodeSession(sessionId) && isCtrlZ(event)) {
		event.preventDefault();
		event.stopPropagation();
		return false;
	}

	if (handleFooterShortcutKey(event)) {
		return false;
	}

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

// Smart + Skills launch overlay. Shown once for the initial Smart session while
// it boots; revealed on its first output, which also tells the host to clean up.
let smartOverlay: SmartSkeletonController | undefined;
let smartDone = false;

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
	terminal.attachCustomKeyEventHandler((event) => handleTerminalKey(event, session.id));

	// OSC 52 sequences inside the restored scrollback (replayed by terminal.write
	// below) are history, not a live copy. Honoring them would re-write the system
	// clipboard and re-open the translator every time this webview is rebuilt on a
	// panel switch (My CLI has no retainContextWhenHidden) — a claude-specific
	// phantom, since TUIs copy via OSC 52 and that sequence is persisted in the
	// session buffer. xterm parses its write queue in order, so the replay's write
	// callback clears this flag before any later live output is parsed.
	let replayingScrollback = false;

	// TUI CLIs copy their internal selection with OSC 52, which xterm.js
	// ignores by default. Honor the copy (write it to the real clipboard)
	// and route it through the copy-to-translate flow.
	terminal.parser.registerOscHandler(52, (data) => {
		if (replayingScrollback) {
			return true;
		}
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
	if (session.buffer) {
		replayingScrollback = true;
		terminal.write(session.buffer, () => {
			replayingScrollback = false;
			checkAttention(session.id, { silent: true });
		});
	}
	terminal.onData((data) => {
		const currentSession = sessions.get(session.id);
		if (currentSession?.status === 'running' && !(isOpenCodeSession(session.id) && data === '\x1a')) {
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
				// A selection of separators/whitespace only (──────, blank rows)
				// carries no text — don't pop the translator over it.
				if (hasTranslatableContent(terminal.getSelection())) {
					openTranslatorFromTerminal(session.id);
				}
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
		if (session.smart) {
			// Reset the one-shot latch for each new Smart session so a panel-created
			// Smart CLI also gets the skeleton (the launcher only fires once, but the
			// in-panel "+" path can start further Smart sessions afterwards).
			smartDone = false;
			smartOverlay?.dismiss();
			smartOverlay = createSmartSkeleton(document.body, {
				onCancel: () => vscode.postMessage({ type: 'smart.cancel', sessionId: session.id })
			});
		} else {
			bootSkeletons.create(session.id, { rulesMode: session.rules === true });
		}
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

// Sessions whose live terminal screen currently shows a pending question
// (numbered choice / y-n confirm). Tracked continuously off every output
// chunk regardless of active/inactive — renderTabs() suppresses the badge
// for whichever session is active, so a question asked while active is
// already recorded by the time the user tabs away from it.
const attentionSessionIds = new Set<string>();

// Per-CLI prompt-composer open state: the sessions the user left the modal open
// in. The overlay itself is single, but its open/closed state is snapshotted and
// restored per CLI on switch (see syncState), so leaving the composer open in one
// CLI and returning finds it open again — a CLI never opened stays closed.
const promptOpenSessions = new Set<string>();

const renderTabs = () => {
	const summaries = [...sessions.values()].map((session) => ({
		...session,
		needsInput: session.id !== activeSessionId && attentionSessionIds.has(session.id)
	}));
	tabController.render(summaries, activeSessionId);
};

// Confirmation cue: ring once when a session's screen first shows a pending
// prompt. Gated by the Voice Finish toggle (the shared master switch for CLI
// audio) and a short per-session cooldown, so a TUI redraw that momentarily
// drops and repaints the prompt can't double-ring.
const confirmationSoundCooldownMs = 2000;
const lastConfirmationSoundAt = new Map<string, number>();

const playConfirmationSound = (sessionId: string) => {
	if (!readVoiceFinishPreference()) {
		return;
	}
	const now = Date.now();
	if (now - (lastConfirmationSoundAt.get(sessionId) ?? 0) < confirmationSoundCooldownMs) {
		return;
	}
	const uri = getConfirmationSoundUri();
	if (!uri) {
		return;
	}
	lastConfirmationSoundAt.set(sessionId, now);
	const audio = new Audio(uri);
	audio.volume = 0.5;
	audio.play().catch(() => { /* ignore autoplay / load errors */ });
};

// Single funnel for the awaiting-input state: updates the local set, tells the
// host (so it suppresses the finish cue for a pending prompt), rings the cue on
// the false→true edge, and repaints the tabs — edge-guarded so each transition
// acts exactly once.
const setSessionAwaiting = (sessionId: string, awaiting: boolean, ring = true) => {
	if (attentionSessionIds.has(sessionId) === awaiting) {
		return;
	}
	if (awaiting) {
		attentionSessionIds.add(sessionId);
	} else {
		attentionSessionIds.delete(sessionId);
	}
	vscode.postMessage({ type: 'cli.awaitingInput', sessionId, awaiting });
	if (awaiting && ring) {
		playConfirmationSound(sessionId);
	}
	renderTabs();
};

// silent = re-scanning restored scrollback on a panel rebuild, not live output:
// sync the badge + host flag but don't ring an already-standing prompt again.
const checkAttention = (sessionId: string, options?: { silent?: boolean }) => {
	const view = terminals.get(sessionId);
	const session = sessions.get(sessionId);
	if (!view || !session || session.status !== 'running') {
		setSessionAwaiting(sessionId, false);
		return;
	}
	setSessionAwaiting(sessionId, isAwaitingUserInput(readTerminalScreenText(view)), !options?.silent);
};

const syncState = (message: Extract<ServerMessage, { type: 'cli.state' }>) => {
	const previousActiveSessionId = activeSessionId;
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
	usageTracker.pruneClosedSessions(openSessionIds);
	for (const sessionId of [...attentionSessionIds]) {
		if (!openSessionIds.has(sessionId)) {
			attentionSessionIds.delete(sessionId);
		}
	}
	for (const sessionId of [...lastConfirmationSoundAt.keys()]) {
		if (!openSessionIds.has(sessionId)) {
			lastConfirmationSoundAt.delete(sessionId);
		}
	}
	prunePromptDrafts(openSessionIds);
	for (const sessionId of [...openFooterPickers.keys()]) {
		if (!openSessionIds.has(sessionId)) {
			openFooterPickers.delete(sessionId);
		}
	}
	for (const sessionId of [...promptOpenSessions]) {
		if (!openSessionIds.has(sessionId)) {
			promptOpenSessions.delete(sessionId);
		}
	}

	// If a session entered error/exited state before producing output, don't leave skeleton hanging
	for (const [sessionId, session] of sessions) {
		if (bootSkeletons.has(sessionId) && (session.status === 'error' || session.status === 'exited')) {
			bootSkeletons.dismiss(sessionId);
		}
	}

	renderTabs();
	setActiveTerminal();

	// Per-CLI composer state. The prompt modal is a single overlay, but each CLI
	// remembers whether the user left it open (its draft is already keyed by
	// session). On a switch, snapshot the CLI we're leaving from the live overlay,
	// then restore the one we're entering: re-mount it (with its own draft) if it
	// was left open there, otherwise close it. Independent per CLI — a CLI never
	// opened stays closed. In-flight sends are pinned, so they still land. Other
	// tool modals are transient and not tracked here.
	if (previousActiveSessionId !== undefined && previousActiveSessionId !== activeSessionId) {
		const leftPromptOpen = toolsController?.getOpenTool() === 'prompt';
		if (leftPromptOpen && openSessionIds.has(previousActiveSessionId)) {
			promptOpenSessions.add(previousActiveSessionId);
		} else {
			promptOpenSessions.delete(previousActiveSessionId);
		}
		if (activeSessionId && promptOpenSessions.has(activeSessionId)) {
			toolsController?.open('prompt');
		} else if (leftPromptOpen) {
			toolsController?.close();
		}
	}
};

const handleOutput = (message: Extract<ServerMessage, { type: 'cli.output' }>) => {
	const session = sessions.get(message.sessionId);
	if (session) {
		appendToSessionBuffer(session, message.data);
		usageTracker.noteOutput(message.sessionId, message.data);
	}

	let restoredFromBuffer = false;
	if (!terminals.has(message.sessionId) && session && shouldKeepTerminalAwake(message.sessionId)) {
		createTerminalView(session);
		restoredFromBuffer = true;
	}

	if (!restoredFromBuffer) {
		terminals.get(message.sessionId)?.terminal.write(message.data, () => {
			checkAttention(message.sessionId);
		});
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

	if (message.type === 'voice.ready') {
		voiceReadyRpc.resolve(message.id, message.ready);
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

	if (message.type === 'prompt.rulesInjected') {
		injectRulesRpc.resolve(message.id, message.ok);
		return;
	}

	if (message.type === 'cli.rulesLoaded' && typeof message.sessionId === 'string') {
		const rulesSessionId = message.sessionId;
		bootSkeletons.notifyRulesLoaded(rulesSessionId, () => {
			// Open right as the skeleton starts fading (not after it's gone) — the
			// modal sits above the skeleton (z-index 1000 vs 12) and renders during
			// that ~580ms fade, so by the time the skeleton is actually gone the
			// composer is already sitting there ready: one clean reveal instead of
			// two separate beats. Only for the launcher's rules-mode launch (this
			// message only fires from that path), and only if still on that session.
			if (rulesSessionId === activeSessionId) {
				toolsController?.open('prompt');
			}
		});
		markRulesInjectedForSession(message.sessionId);
		const soundUri = getRulesSoundUri();
		if (soundUri) {
			const audio = new Audio(soundUri);
			audio.volume = 0.5;
			audio.play().catch(() => { /* ignore autoplay / load errors */ });
		}
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

	if (message.type === 'workspace.skillsChanged') {
		toolsController?.refreshPromptIfOpen();
		return;
	}

	if (message.type === 'smart.dismiss') {
		smartDone = true;
		smartOverlay?.dismiss();
		smartOverlay = undefined;
		return;
	}

	if (message.type === 'cli.visible') {
		repaintActiveTerminal();
		return;
	}

	if (message.type === 'cli.focusTerminal') {
		focusActiveTerminal();
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

const focusActiveTerminal = () => {
	const sessionId = activeSessionId;
	if (!sessionId) {
		return;
	}

	requestAnimationFrame(() => requestAnimationFrame(() => {
		fitTerminal(sessionId);
		terminals.get(sessionId)?.terminal.focus();
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

// Seed the host with the persisted Voice Finish state on load — the host's copy
// resets each time this (non-retained) webview is rebuilt on a panel switch.
sendVoiceFinishConfig();

vscode.postMessage({ type: 'cli.ready' });
