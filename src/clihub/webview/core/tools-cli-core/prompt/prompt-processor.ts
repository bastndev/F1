export interface PromptSendContext {
	close: () => void;
	sendToActiveSession: (data: string, options?: { paste?: boolean; submit?: boolean }) => void;
	getActiveSessionId?: () => string | undefined;
}

export type ProcessPromptResult =
	| { status: 'sent' }
	| { status: 'empty' }
	| { status: 'no-session' };

/**
 * Main entry point for processing user input in the Prompt tool.
 * Currently applies autocorrect before sending to the CLI.
 */
export function processPrompt(
	rawText: string,
	context: PromptSendContext
): ProcessPromptResult {
	const text = rawText.trim();

	if (!text) {
		return { status: 'empty' };
	}

	const hasActiveSession = !!context.getActiveSessionId?.();
	if (!hasActiveSession || !context.sendToActiveSession) {
		return { status: 'no-session' };
	}

	// Two-phase send, imitating a human: paste the text, then press Enter as a
	// separate keystroke. The terminal layer owns the timing and per-CLI quirks
	// (bracketed paste, focus reporting, Copilot's slower paste handling).
	context.sendToActiveSession(text, { paste: true, submit: true });

	context.close();

	return { status: 'sent' };
}
