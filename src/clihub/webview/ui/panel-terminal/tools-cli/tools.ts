/**
 * Tools Modal Controller
 *
 * Thin orchestrator for the tools overlay modal.
 * It only handles lifecycle (open/close/backdrop/escape).
 *
 * Each tool (keymaps, translate, ...) owns its own UI and behavior
 * via a mount function exported from its folder.
 */

import { mountKeymapsModal } from './modal-keymaps/keymaps';

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
		// Toggle behavior: clicking the same tool again closes it
		if (currentTool === tool && !modalRoot.hidden) {
			close();
			return;
		}

		currentTool = tool;
		modalRoot.hidden = false;

		if (tool === 'keymaps') {
			mountKeymapsModal(contentHost);
			return;
		}

		if (tool === 'translate') {
			// Placeholder — will be replaced by real mountTranslateModal later
			contentHost.innerHTML = `
				<div class="translate-modal-placeholder">
					<h3>Translate</h3>
					<p>Coming soon. This will be a full smart prompt + translation layer.</p>
				</div>
			`;
			return;
		}
	};

	const close = () => {
		currentTool = null;
		modalRoot.hidden = true;
		contentHost.innerHTML = '';
	};

	const isOpen = () => !modalRoot.hidden;

	// Close when clicking the backdrop
	modalRoot.querySelector('.cli-tools-modal-backdrop')?.addEventListener('click', () => {
		close();
	});

	// Global Escape handler
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
