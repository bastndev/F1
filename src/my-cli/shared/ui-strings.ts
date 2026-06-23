/**
 * Webview-rendered prompt-modal strings (kept here so this file stays free of
 * the 'vscode' module — it's imported from the browser bundle too).
 * Host notifications use vscode.l10n.t() at the call site; bundles live in /l10n.
 */
export const uiStrings = {
	promptNoSession: {
		title: 'No hay sesión CLI activa',
		subtitle: 'Abre una sesión desde el panel izquierdo para usar Prompt',
		sendBlocked: 'Necesitas una sesión CLI activa para enviar prompts.',
	},
} as const;
