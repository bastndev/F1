/**
 * prompt-processor.ts
 *
 * Central processing layer for the Prompt tool.
 *
 * Responsibilities (Fase 1):
 * - Receive raw user input
 * - (Future) Run autocorrect → translate → other distillation steps
 * - Decide whether and how to send the (processed) text to the active CLI session
 *
 * This file should remain UI-agnostic. It receives everything it needs via context.
 */

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
 * Main entry point for the Prompt tool's processing pipeline.
 *
 * Today: trims input and sends it as-is (+ carriage return).
 * Tomorrow: this function will orchestrate prompt-autocorrect + prompt-translate
 * before calling sendToActiveSession.
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
	// In the future this line will receive the already "distilled" text:
	// const distilled = await applyAutocorrectAndTranslate(text);
	context.sendToActiveSession(text + '\r');

	context.close();

	return { status: 'sent' };
}
