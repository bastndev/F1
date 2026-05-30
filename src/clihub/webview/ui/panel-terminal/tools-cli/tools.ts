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
		// If the same tool modal is already open, close it (toggle behavior for shortcut)
		if (currentTool === tool && !modalRoot.hidden) {
			close();
			return;
		}

		currentTool = tool;
		modalRoot.hidden = false;

		if (tool === 'keymaps') {
			// Load the actual Keymaps documentation UI
			contentHost.innerHTML = `
				<div class="keymaps-modal">
					<div class="keymaps-header">
						<div class="keymaps-title">Keyboard Shortcuts</div>
						<div class="keymaps-subtitle">Available while using CLI Hub</div>
					</div>

					<div class="keymaps-content">
						<!-- Session Management -->
						<div class="keymaps-section">
							<div class="keymaps-section-title">Session Management</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">＋</span>
									<span class="keymap-label">New CLI session</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Alt</kbd><kbd class="key">+</kbd>
								</div>
							</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">−</span>
									<span class="keymap-label">Close current session</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Alt</kbd><kbd class="key">−</kbd>
								</div>
							</div>
						</div>

						<!-- Navigation -->
						<div class="keymaps-section">
							<div class="keymaps-section-title">Navigation</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">⇥</span>
									<span class="keymap-label">Next session</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Tab</kbd>
								</div>
							</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">⇤</span>
									<span class="keymap-label">Previous session</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Shift</kbd><kbd class="key">Tab</kbd>
								</div>
							</div>
						</div>

						<!-- Panel -->
						<div class="keymaps-section">
							<div class="keymaps-section-title">Panel</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">⛶</span>
									<span class="keymap-label">Toggle maximized panel</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Ctrl</kbd><kbd class="key">\`</kbd>
									<span class="keymap-or">/</span>
									<kbd class="key">⌘</kbd><kbd class="key">\`</kbd>
								</div>
							</div>
						</div>

						<!-- Tools & Modals -->
						<div class="keymaps-section">
							<div class="keymaps-section-title">Tools &amp; Modals</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">T</span>
									<span class="keymap-label">Open Translate</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">⇧</kbd><kbd class="key">F1</kbd>
								</div>
							</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">⚙︎</span>
									<span class="keymap-label">Quick Translate (from Tools)</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Alt</kbd> + click
								</div>
							</div>
						</div>

						<!-- General -->
						<div class="keymaps-section">
							<div class="keymaps-section-title">General</div>
							<div class="keymap-item">
								<div class="keymap-left">
									<span class="keymap-icon">⎋</span>
									<span class="keymap-label">Close menus &amp; modals</span>
								</div>
								<div class="keymap-keys">
									<kbd class="key">Esc</kbd>
								</div>
							</div>
						</div>
					</div>

					<div class="keymaps-footer">
						<div class="keymaps-note">These shortcuts work while the CLI Hub panel is focused.</div>
					</div>
				</div>
			`;
		} else if (tool === 'translate') {
			// Placeholder for Translate (we'll build this next)
			contentHost.innerHTML = `
				<div style="padding: 24px; color: var(--vscode-foreground);">
					<h3 style="margin: 0 0 12px 0; font-size: 15px;">Translate</h3>
					<p style="margin: 0; opacity: 0.8; font-size: 13px;">
						Translate modal content coming soon.
					</p>
				</div>
			`;
		}
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
