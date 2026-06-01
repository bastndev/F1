import { mountKeymapsPanel } from './modal-keymaps/keymaps';
import { mountPromptPanel } from './modal-prompt/prompt';
import type { PromptTranslateRequest, PromptTranslateResult } from './modal-prompt/core/prompt-translate';
import { mountTranslatorPanel } from './modal-translator/translator';

export type ToolId = 'translate' | 'keymaps' | 'prompt';

export type ToolContext = {
	close: () => void;
	getActiveSessionId?: () => string | undefined;
	sendToActiveSession?: (text: string) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	getTerminalLines?: () => string[];
	getLastPrompt?: () => string | undefined;
};

type ToolMount = (host: HTMLElement, context: ToolContext) => void;
export type ToolsControllerOptions = {
	container: HTMLElement;
	getActiveSessionId?: () => string | undefined;
	sendToActiveSession?: (text: string) => void;
	translatePrompt?: (request: PromptTranslateRequest) => Promise<PromptTranslateResult>;
	getTerminalSelection?: () => string;
	getTerminalLines?: () => string[];
	getLastPrompt?: () => string | undefined;
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
		sendToActiveSession,
		translatePrompt,
		getTerminalSelection,
		getTerminalLines,
		getLastPrompt
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
				height: 'calc(100% - 32px)',
				maxHeight: 'calc(100% - 32px)',
				boxSizing: 'border-box'
			});
			modal.append(host);
	
			modal.addEventListener('click', (event) => {
				if (event.target === modal) {
					close();
				}
			});
	
			host.addEventListener('click', (event) => {
				event.stopPropagation();
			});
	
				toolMounts[tool](host, {
					close,
					getActiveSessionId,
					sendToActiveSession,
					translatePrompt,
					getTerminalSelection,
					getTerminalLines,
					getLastPrompt
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

	return { open, toggle, close };
};
