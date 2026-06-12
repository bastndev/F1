/**
 * xterm.js theming from the active VS Code color theme: the webview exposes
 * the editor/terminal palette as CSS custom properties, read here with
 * sensible fallbacks for themes that don't define terminal colors.
 */
const cssValue = (name: string, fallback: string) => {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
};

export const getTerminalTheme = () => {
	return {
		background: cssValue('--vscode-terminal-background', cssValue('--vscode-editor-background', '#1e1e1e')),
		foreground: cssValue('--vscode-terminal-foreground', cssValue('--vscode-editor-foreground', '#cccccc')),
		cursor: cssValue('--vscode-terminalCursor-foreground', cssValue('--vscode-editor-foreground', '#cccccc')),
		selectionBackground: cssValue('--vscode-terminal-selectionBackground', 'rgba(128, 128, 128, 0.35)'),
		black: cssValue('--vscode-terminal-ansiBlack', '#000000'),
		red: cssValue('--vscode-terminal-ansiRed', '#cd3131'),
		green: cssValue('--vscode-terminal-ansiGreen', '#0dbc79'),
		yellow: cssValue('--vscode-terminal-ansiYellow', '#e5e510'),
		blue: cssValue('--vscode-terminal-ansiBlue', '#2472c8'),
		magenta: cssValue('--vscode-terminal-ansiMagenta', '#bc3fbc'),
		cyan: cssValue('--vscode-terminal-ansiCyan', '#11a8cd'),
		white: cssValue('--vscode-terminal-ansiWhite', '#e5e5e5')
	};
};

export const getTerminalFontFamily = () => {
	return cssValue('--vscode-editor-font-family', cssValue('--vscode-font-family', 'monospace'));
};
