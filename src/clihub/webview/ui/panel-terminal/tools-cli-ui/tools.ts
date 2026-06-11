import { mountKeymapsPanel } from './modal-keymaps/keymaps';
import { mountPromptPanel } from './modal-prompt/prompt';
import type { ImageAttachment, PromptTranslateRequest, PromptTranslateResult, FileMentionEntry, SpellIssue } from '../../../core/tools-cli-core/prompt';
import type { VoiceState } from '../../../core/tools-cli-core/modal-voice/voice-types';
import { mountTranslatorPanel } from './modal-translator/translator';

export type ToolId = 'translate' | 'keymaps' | 'prompt';

export type ToolContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	getActiveModelName?: () => string | undefined;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<string[]>;
	requestSpellcheck?: (text: string, strict: boolean) => Promise<SpellIssue[]>;
	speakText?: (text: string) => void;
	stopSpeech?: () => void;
	queryVoiceState?: () => void;
	onVoiceState?: (listener: (state: VoiceState, message?: string) => void) => () => void;
};

type ToolMount = (host: HTMLElement, context: ToolContext) => void;
export type ToolsControllerOptions = {
	container: HTMLElement;
	getActiveSessionId?: () => string | undefined;
	getActiveModelName?: () => string | undefined;
	sendToActiveSession?: (text: string, options?: { paste?: boolean; submit?: boolean }) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	preparePromptWithAttachments?: (text: string, attachments: ImageAttachment[]) => Promise<string>;
	requestWorkspaceFiles?: () => Promise<FileMentionEntry[]>;
	requestWorkspaceSkills?: () => Promise<string[]>;
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
	translate: mountTranslatorPanel
};

	export const createToolsController = ({
		container,
		getActiveSessionId,
		getActiveModelName,
		sendToActiveSession,
		translatePrompt,
		getTerminalSelection,
		preparePromptWithAttachments,
		requestWorkspaceFiles,
		requestWorkspaceSkills,
		requestSpellcheck,
		speakText,
		stopSpeech,
		queryVoiceState,
		onVoiceState
	}: ToolsControllerOptions) => {
		let activeModal: HTMLElement | null = null;
		let currentTool: ToolId | null = null;
	
		const close = () => {
			document.removeEventListener('keydown', handleKeyDown);
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
	
				toolMounts[tool](host, {
					close,
					getActiveSessionId,
					getActiveModelName,
					sendToActiveSession,
					translatePrompt,
					getTerminalSelection,
					preparePromptWithAttachments,
					requestWorkspaceFiles,
					requestWorkspaceSkills,
					requestSpellcheck,
					speakText,
					stopSpeech,
					queryVoiceState,
					onVoiceState
				});

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

	return { open, toggle, close, isOpen: () => currentTool !== null };
};
