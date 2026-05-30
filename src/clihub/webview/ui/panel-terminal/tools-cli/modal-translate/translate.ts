const applyStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
	for (const [property, value] of Object.entries(styles)) {
		if (typeof value === 'string') {
			element.style[property as never] = value;
		}
	}
};

export const mountTranslatePanel = (host: HTMLElement) => {
	const panel = document.createElement('div');
	panel.textContent = 'hello transalte';

	applyStyles(panel, {
		minWidth: '280px',
		minHeight: '140px',
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

	host.replaceChildren(panel);
};
