export interface PromptSendContext {
	close: () => void;
	sendToActiveSession: (data: string, options?: { paste?: boolean }) => void;
	getActiveSessionId?: () => string | undefined;
}

// TUI-based CLIs (Claude Code, Codex, Cursor…) use paste-detection heuristics:
// when text and "\r" arrive in the same PTY chunk, the trailing "\r" is treated
// as part of the paste instead of an Enter keypress, so the prompt is inserted
// but never submitted. Sending Enter as a separate write after a short pause
// makes it register as a real keypress in every CLI. Line-based CLIs don't
// care either way, so the split is safe universally.
const enterKeyDelayMs = 150;

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

	// Two-phase send, imitating a human: paste the text first (bracketed-paste
	// framed when the CLI supports it), then press Enter as a separate keystroke.
	context.sendToActiveSession(text, { paste: true });
	setTimeout(() => {
		context.sendToActiveSession('\r');
	}, enterKeyDelayMs);

	context.close();

	return { status: 'sent' };
}
