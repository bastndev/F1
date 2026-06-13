import { mountKeymapsPanel } from './modal-keymaps/keymaps';
import { mountPromptPanel } from './modal-prompt/prompt';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue, WorkspaceSkill } from '../../shared/prompt';
import type { VoiceState } from '../../shared/voice/voice-types';
import { mountTranslatorPanel } from './modal-translator/translator';
import { mountUsePanel } from './modal-use/use';

export type ToolId = 'translate' | 'keymaps' | 'prompt' | 'use';

export type CliUsageSnapshot = {
	sessionId: string;
	agentLabel: string;
	command: string;
	raw: string;
	requestedAt: number;
};

export type ToolContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveSessionCreatedAt?: () => number | undefined;
	getActiveModelName?: () => string | undefined;
	getUsageSnapshot?: () => CliUsageSnapshot | undefined;
	requestUsage?: () => Promise<CliUsageSnapshot>;
	dismissUsageView?: () => void;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<WorkspaceSkill[]>;
	openCreateSkill?: () => void;
	requestSpellcheck?: (text: string, strict: boolean) => Promise<SpellIssue[]>;
	speakText?: (text: string) => void;
	stopSpeech?: () => void;
	queryVoiceState?: () => void;
	onVoiceState?: (listener: (state: VoiceState, message?: string) => void) => () => void;
};

type ToolCleanup = () => void;
type ToolMount = (host: HTMLElement, context: ToolContext) => void | ToolCleanup;
export type ToolsControllerOptions = {
	container: HTMLElement;
	getActiveSessionId?: () => string | undefined;
	getActiveSessionCreatedAt?: () => number | undefined;
	getActiveModelName?: () => string | undefined;
	getUsageSnapshot?: () => CliUsageSnapshot | undefined;
	requestUsage?: () => Promise<CliUsageSnapshot>;
	dismissUsageView?: () => void;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<WorkspaceSkill[]>;
	openCreateSkill?: () => void;
	requestSpellcheck?: (text: string, strict: boolean) => Promise<SpellIssue[]>;
	speakText?: (text: string) => void;
	stopSpeech?: () => void;
	queryVoiceState?: () => void;
	onVoiceState?: (listener: (state: VoiceState, message?: string) => void) => () => void;
};

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
	prompt: mountPromptPanel,
	translate: mountTranslatorPanel,
	use: mountUsePanel
};

export const createToolsController = ({
	container,
	getActiveSessionId,
	getActiveSessionCreatedAt,
	getActiveModelName,
	getUsageSnapshot,
	requestUsage,
	dismissUsageView,
	sendToActiveSession,
	translatePrompt,
	getTerminalSelection,
	preparePromptWithAttachments,
	requestWorkspaceFiles,
	requestWorkspaceSkills,
	openCreateSkill,
	requestSpellcheck,
	speakText,
	stopSpeech,
	queryVoiceState,
	onVoiceState
}: ToolsControllerOptions) => {
	let activeModal: HTMLElement | null = null;
	let currentTool: ToolId | null = null;
	let activeCleanup: ToolCleanup | null = null;

	const close = () => {
		document.removeEventListener('keydown', handleKeyDown);
		const closingTool = currentTool;
		activeCleanup?.();
		activeCleanup = null;
		if (closingTool === 'translate') {
			stopSpeech?.();
		}
		activeModal?.replaceChildren();
		activeModal?.remove();
		activeModal = null;
		currentTool = null;
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	};

	const open = (tool: ToolId) => {
		close();

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
			backdropFilter: 'blur(16px)'
		});

		const host = document.createElement('div');
		applyStyles(host, {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			width: 'min(580px, calc(100% - 32px))',
			maxHeight: 'calc(100% - 32px)',
			boxSizing: 'border-box'
		});
		modal.append(host);

		modal.addEventListener('click', (event) => {
			if (event.target === modal && tool === 'keymaps') {
				close();
			}
		});

		host.addEventListener('click', (event) => {
			event.stopPropagation();
		});

		const cleanup = toolMounts[tool](host, {
			close,
			getActiveSessionId,
			getActiveSessionCreatedAt,
			getActiveModelName,
			getUsageSnapshot,
			requestUsage,
			dismissUsageView,
			sendToActiveSession,
			translatePrompt,
			getTerminalSelection,
			preparePromptWithAttachments,
			requestWorkspaceFiles,
			requestWorkspaceSkills,
			openCreateSkill,
			requestSpellcheck,
			speakText,
			stopSpeech,
			queryVoiceState,
			onVoiceState
		});
		activeCleanup = typeof cleanup === 'function' ? cleanup : null;

		container.append(modal);
		document.addEventListener('keydown', handleKeyDown);
		activeModal = modal;
		currentTool = tool;
	};

	const toggle = (tool: ToolId) => {
		if (currentTool === tool) {
			close();
		} else {
			open(tool);
		}
	};

	return { open, toggle, close, isOpen: () => currentTool !== null, getOpenTool: () => currentTool };
};
