const keymapsModalId = 'cli-keymaps-modal';

const applyStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
	for (const [property, value] of Object.entries(styles)) {
		if (typeof value === 'string') {
			element.style[property as never] = value;
		}
	}
};

export const openKeymapsModal = () => {
	document.getElementById(keymapsModalId)?.remove();

	const overlay = document.createElement('div');
	overlay.id = keymapsModalId;
	overlay.setAttribute('role', 'dialog');
	overlay.setAttribute('aria-modal', 'true');
	overlay.setAttribute('aria-label', 'Keymaps');

	applyStyles(overlay, {
		position: 'fixed',
		inset: '0',
		zIndex: '1000',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'rgba(0, 0, 0, 0.72)'
	});

	const panel = document.createElement('div');
	panel.textContent = 'hello keymaps';

	applyStyles(panel, {
		minWidth: '240px',
		minHeight: '120px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: '24px',
		boxSizing: 'border-box',
		border: '1px solid var(--vscode-editorGroup-border, rgba(128, 128, 128, 0.35))',
		borderRadius: '8px',
		background: 'var(--vscode-editor-background)',
		color: 'var(--vscode-foreground)',
		fontFamily: 'var(--vscode-font-family)',
		fontSize: '13px',
		boxShadow: '0 14px 44px rgba(0, 0, 0, 0.45)'
	});

	const close = () => {
		document.removeEventListener('keydown', handleKeyDown);
		overlay.remove();
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	};

	overlay.addEventListener('click', (event) => {
		if (event.target === overlay) {
			close();
		}
	});

	panel.addEventListener('click', (event) => {
		event.stopPropagation();
	});

	overlay.append(panel);
	document.body.append(overlay);
	document.addEventListener('keydown', handleKeyDown);
};
