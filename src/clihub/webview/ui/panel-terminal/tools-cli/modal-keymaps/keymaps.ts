/**
 * Keymaps Modal
 *
 * This module is the single owner of the Keymaps UI.
 * It is mounted dynamically by tools.ts.
 *
 * Note: keymaps.html and keymaps.css were removed to eliminate duplication.
 * The runtime markup lives here (as KEYMAPS_HTML string).
 * Styles currently live duplicated inside terminal.css.
 */

const KEYMAPS_HTML = `
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
						<span class="keymap-label">Quick Translate (from Tools menu)</span>
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

/**
 * Mounts the Keymaps documentation UI into the given container.
 * This is the single entry point called by the tools modal controller.
 */
export function mountKeymapsModal(container: HTMLElement): void {
	container.innerHTML = KEYMAPS_HTML;

	// Future: attach search, filtering, or other interactivity here.
	// Example:
	// const search = container.querySelector<HTMLInputElement>('.keymaps-search');
	// if (search) { ... }
}
