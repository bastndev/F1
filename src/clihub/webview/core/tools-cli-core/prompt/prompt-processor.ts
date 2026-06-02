export interface PromptSendContext {
	close: () => void;
	sendToActiveSession: (data: string) => void;
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

	// Current behavior: send exactly what the user wrote + \r (simulates pressing Enter)
	// Future: this will run autocorrect + translation before sending.
	context.sendToActiveSession(text + '\r');

	context.close();

	return { status: 'sent' };
}
