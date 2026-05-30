import { mountKeymapsPanel } from './modal-keymaps/keymaps';
import { mountTranslatePanel } from './modal-translate/translate';

export type ToolId = 'translate' | 'keymaps';

type ToolContext = {
	close: () => void;
};

type ToolMount = (host: HTMLElement, context: ToolContext) => void;

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
	translate: mountTranslatePanel
};

export const createToolsController = () => {
	let activeModal: HTMLElement | null = null;

	const close = () => {
		document.removeEventListener('keydown', handleKeyDown);
		activeModal?.remove();
		activeModal = null;
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
			position: 'fixed',
			inset: '0',
			zIndex: '1000',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			background: 'rgba(0, 0, 0, 0.72)'
		});

		const host = document.createElement('div');
		modal.append(host);

		modal.addEventListener('click', (event) => {
			if (event.target === modal) {
				close();
			}
		});

		host.addEventListener('click', (event) => {
			event.stopPropagation();
		});

		toolMounts[tool](host, { close });

		document.body.append(modal);
		document.addEventListener('keydown', handleKeyDown);
		activeModal = modal;
	};

	return { open, close };
};
