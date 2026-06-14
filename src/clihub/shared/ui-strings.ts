/**
 * User-facing strings, centralized as i18n groundwork. The UI currently mixes
 * English (host notifications) and Spanish (prompt modal states) — kept
 * verbatim here so behavior is unchanged. When real localization lands
 * (vscode.l10n / package.nls.json), this is the single file to convert; no
 * caller needs to change.
 */
export const uiStrings = {
	install: {
		installAction: 'Install',
		cancelAction: 'Cancel',
		notInstalledNoInstaller: (label: string) =>
			`${label} is not installed or is not available in PATH.`,
		notInstalledOffer: (label: string) =>
			`${label} is not installed. You can install it now in an integrated terminal.`,
		terminalName: (label: string) => `Install ${label}`,
	},
	promptNoSession: {
		title: 'No hay sesión CLI activa',
		subtitle: 'Abre una sesión desde el panel izquierdo para usar Prompt',
		sendBlocked: 'Necesitas una sesión CLI activa para enviar prompts.',
	},
} as const;
