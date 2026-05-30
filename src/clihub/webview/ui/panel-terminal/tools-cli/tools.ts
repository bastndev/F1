/**
 * Tools Modal Controller
 * Lives in panel-terminal/tools-cli because the modal overlays the terminal area.
 */

type ToolId = 'translate' | 'keymaps';

type ToolsModalController = {
	open: (tool: ToolId) => void;
	close: () => void;
	isOpen: () => boolean;
};

const getRequiredElement = <T extends HTMLElement>(id: string): T => {
	const el = document.getElementById(id);
	if (!el) {
		throw new Error(`Missing modal element: ${id}`);
	}
	return el as T;
};

export function createToolsModalController(): ToolsModalController {
	const modalRoot = getRequiredElement<HTMLDivElement>('cli-tools-modal');
	const contentHost = getRequiredElement<HTMLDivElement>('cli-tools-modal-content');

	let currentTool: ToolId | null = null;

	const open = (tool: ToolId) => {
		currentTool = tool;
		modalRoot.hidden = false;

		// Temporary placeholder while we build the real content
		// Later this will load content from modal-translate / modal-keymaps
		contentHost.innerHTML = `
			<div style="padding: 24px; color: var(--vscode-foreground);">
				<h3 style="margin: 0 0 12px 0; font-size: 15px;">${tool === 'translate' ? 'Translate' : 'Keymaps'}</h3>
				<p style="margin: 0; opacity: 0.8; font-size: 13px;">
					Hello ${tool}. Modal content will be implemented here.
				</p>
			</div>
		`;

		// Future: load real module content here
		// e.g. if (tool === 'translate') loadTranslateContent(contentHost);
	};

	const close = () => {
		currentTool = null;
		modalRoot.hidden = true;
		contentHost.innerHTML = '';
	};

	const isOpen = () => !modalRoot.hidden;

	// Close on backdrop click
	modalRoot.querySelector('.cli-tools-modal-backdrop')?.addEventListener('click', () => {
		close();
	});

	// Close on Escape key (global)
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isOpen()) {
			e.preventDefault();
			close();
		}
	});

	return {
		open,
		close,
		isOpen
	};
}
