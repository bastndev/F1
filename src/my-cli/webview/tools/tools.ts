import { mountKeymapsPanel } from './modal-keymaps/keymaps';
import { mountPromptPanel } from './modal-prompt/prompt';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../shared/prompt';
import type { VoiceProgress, VoiceState } from '../../shared/voice/voice-types';
import { mountTranslatorPanel } from './modal-translator/translator';
import { mountUsePanel } from './modal-use/use';
import { mountCommandsPanel } from './modal-commands/commands';

export type ToolId = 'translate' | 'keymaps' | 'prompt' | 'use' | 'commands';

export type CliUsageSnapshot = {
	sessionId: string;
	agentLabel: string;
	command: string;
	raw: string;
	requestedAt: number;
};

export type ToolContext = {
	close: () => void;
	minimize: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveSessionCreatedAt?: () => number | undefined;
	getActiveModelName?: () => string | undefined;
	getActiveSessionBuffer?: () => string | undefined;
	getUsageSnapshot?: () => CliUsageSnapshot | undefined;
	requestUsage?: () => Promise<CliUsageSnapshot>;
	dismissUsageView?: () => void;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	/** Deliver to a specific CLI by id (see PromptContext.sendToSession). */
	sendToSession?: (sessionId: string, text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	/** Whether the active CLI is mid-task and would corrupt its input if a command were injected now. */
	isCliBusy?: () => boolean;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<WorkspaceSkill[]>;
	openCreateSkill?: () => void;
	requestSpellcheck?: (text: string, lang: string, strict: boolean) => Promise<SpellIssue[]>;
	/** Type a one-shot rules prompt into the active CLI (see PromptContext.injectRules). */
	injectRules?: (text: string, marker: string) => Promise<boolean>;
	registerSkillsRefresh?: (refresh: () => void) => void;
	/** Composer finished a send (see PromptContext.onPromptSent). */
	onPromptSent?: (sessionId: string) => void;
	speakText?: (text: string, options?: { chunks?: string[]; lang?: string }) => void;
	appendSpeech?: (chunks: string[], options?: { final?: boolean; lang?: string; reset?: boolean }) => void;
	checkVoiceReady?: (lang: string) => Promise<boolean>;
	pauseSpeech?: () => void;
	resumeSpeech?: () => void;
	stopSpeech?: () => void;
	queryVoiceState?: () => void;
	onVoiceState?: (listener: (state: VoiceState, message?: string, progress?: VoiceProgress) => void) => () => void;
	refocusTerminal?: () => void;
	refocusCli?: () => void;
};

type ToolCleanup = () => void;
type ToolMount = (host: HTMLElement, context: ToolContext) => void | ToolCleanup;
export type ToolsControllerOptions = { container: HTMLElement; onToolChange?: (tool: ToolId | null) => void } & Omit<ToolContext, 'close' | 'minimize'>;

const modalId = 'cli-tools-modal';

const applyStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
	for (const [property, value] of Object.entries(styles)) {
		if (typeof value === 'string') {
			element.style[property as never] = value;
		}
	}
};

const toolMounts: Record<ToolId, ToolMount> = {
	keymaps: mountKeymapsPanel,
	commands: mountCommandsPanel,
	prompt: mountPromptPanel,
	translate: mountTranslatorPanel,
	use: mountUsePanel
};

export const createToolsController = ({
	container,
	getActiveSessionId,
	getActiveSessionCreatedAt,
	getActiveModelName,
	getActiveSessionBuffer,
	getUsageSnapshot,
	requestUsage,
	dismissUsageView,
	sendToActiveSession,
	sendToSession,
	isCliBusy,
	translatePrompt,
	getTerminalSelection,
	preparePromptWithAttachments,
	requestWorkspaceFiles,
	requestWorkspaceSkills,
	openCreateSkill,
	requestSpellcheck,
	injectRules,
	onPromptSent,
	speakText,
	appendSpeech,
	checkVoiceReady,
	pauseSpeech,
	resumeSpeech,
	stopSpeech,
	queryVoiceState,
	onVoiceState,
	refocusTerminal,
	refocusCli,
	onToolChange
}: ToolsControllerOptions) => {
	let activeModal: HTMLElement | null = null;
	let currentTool: ToolId | null = null;
	let activeCleanup: ToolCleanup | null = null;
	let skillsRefreshFn: (() => void) | null = null;

	// Tools that drive the host-side read-aloud: translator reads translations,
	// prompt mirrors/controls an in-flight read. Switching between them keeps the
	// voice alive (see close/open); any other exit stops it.
	const voiceTools = new Set<ToolId>(['translate', 'prompt']);

	const close = (options?: { keepVoice?: boolean }) => {
		document.removeEventListener('keydown', handleKeyDown, true);
		const closingTool = currentTool;
		activeCleanup?.();
		activeCleanup = null;
		if (closingTool && voiceTools.has(closingTool) && !options?.keepVoice) {
			stopSpeech?.();
		}
		activeModal?.replaceChildren();
		activeModal?.remove();
		activeModal = null;
		currentTool = null;
		skillsRefreshFn = null;
		
		onToolChange?.(null);

		// Return focus using the host-provided function (uses real Terminal.focus()
		// on the xterm instance so input works and no visible focus ring appears
		// on a container div).
		requestAnimationFrame(() => {
			refocusTerminal?.();
		});
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			// An open inner overlay (e.g. the @file-mention dropdown, or the
			// paste-peek popover which portals to document.body) owns Escape
			// first: dismissing just that layer must not also close the whole
			// modal. We run in the capture phase, so bail out and let the
			// overlay's own bubble-phase handler close only itself.
			if (activeModal?.querySelector('.fm-dropdown') || document.querySelector('.prompt-peek-popover')) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	};

	const open = (tool: ToolId) => {
		// Keep the read-aloud running when swapping between voice tools (e.g.
		// Ctrl+Space translator→prompt); a non-voice tool stops it.
		close({ keepVoice: voiceTools.has(tool) });

		const modal = document.createElement('div');
		modal.id = modalId;
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('aria-label', tool);

		applyStyles(modal, {
			position: 'absolute',
			inset: '0',
			zIndex: '1000',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'rgba(0, 0, 0, 0.38)',
			backdropFilter: 'blur(16px)',
			outline: 'none'
		});

		const host = document.createElement('div');
		applyStyles(host, {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: 'min(580px, calc(100% - 32px))',
			height: 'calc(100% - 32px)',
			maxHeight: 'calc(100% - 32px)',
			boxSizing: 'border-box'
		});
		modal.append(host);

		modal.addEventListener('click', (event) => {
			if (event.target === modal && (tool === 'keymaps' || tool === 'commands')) {
				close();
			}
		});

		host.addEventListener('click', (event) => {
			event.stopPropagation();
		});

		// A mount can outlive its modal: a translated send may finish after the
		// user switched CLIs and this modal was closed/replaced. Its close() must
		// then be a no-op, not tear down whatever modal is showing now.
		const closeOwnModal = () => {
			if (activeModal === modal) {
				close();
			}
		};
		const minimizeOwnModal = () => {
			if (activeModal === modal) {
				close({ keepVoice: true });
			}
		};

		const cleanup = toolMounts[tool](host, {
			close: closeOwnModal,
			minimize: minimizeOwnModal,
			getActiveSessionId,
			getActiveSessionCreatedAt,
			getActiveModelName,
			getActiveSessionBuffer,
			getUsageSnapshot,
			requestUsage,
			dismissUsageView,
			sendToActiveSession,
			sendToSession,
			isCliBusy,
			translatePrompt,
			getTerminalSelection,
			preparePromptWithAttachments,
			requestWorkspaceFiles,
			requestWorkspaceSkills,
			openCreateSkill,
			requestSpellcheck,
			injectRules,
			registerSkillsRefresh: (fn) => { skillsRefreshFn = fn; },
			onPromptSent,
			speakText,
			appendSpeech,
			checkVoiceReady,
			pauseSpeech,
			resumeSpeech,
			stopSpeech,
			queryVoiceState,
			onVoiceState,
			refocusTerminal,
			refocusCli
		});
		activeCleanup = typeof cleanup === 'function' ? cleanup : null;

		container.append(modal);

		modal.tabIndex = -1;

		// Focus strategy on open:
		// - For the Prompt modal (the "chat"), explicitly focus the textarea so the
		//   cursor is ready for immediate typing.
		// - For other tools, focus the dialog container itself (helps Esc trapping
		//   and keeps focus inside the overlay instead of the terminal underneath).
		requestAnimationFrame(() => {
			const promptInput = host.querySelector<HTMLTextAreaElement>('#promptInput');
			if (promptInput && !promptInput.disabled) {
				promptInput.focus();
			} else {
				modal.focus();
			}
		});

		// Capture phase + stopPropagation so Escape is intercepted even if the
		// terminal still has some internal key handling.
		document.addEventListener('keydown', handleKeyDown, true);
		activeModal = modal;
		currentTool = tool;
		onToolChange?.(tool);
	};

	const toggle = (tool: ToolId) => {
		if (currentTool === tool) {
			close();
		} else {
			open(tool);
		}
	};

	const refreshPromptIfOpen = () => {
		skillsRefreshFn?.();
	};

	return { open, toggle, close, isOpen: () => currentTool !== null, getOpenTool: () => currentTool, refreshPromptIfOpen };
};
