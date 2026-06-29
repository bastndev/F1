/**
 * Shared types for "Smart + Skills" — importable from both host and webview
 * (no vscode, no DOM).
 */

export type SmartPrepResult = {
	/** Prep ran (a workspace was open and `.f1/` could be written). */
	ok: boolean;
	/** The built-in rules file was copied into `.f1/`. */
	rulesWritten: boolean;
};
